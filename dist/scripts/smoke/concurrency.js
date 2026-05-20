// Concurrency smoke test - dev workflow, not part of npm test, not CI.
//
// Discovers Descript's real rate-limit ceiling so we can set a sensible
// production default for --concurrency.
//
// Modes:
//   --mode read   (default) - hits GET /published_projects/{slug} at varying
//                              concurrency to measure the read-path ceiling.
//   --mode write  - hits POST /jobs/publish, immediately cancels each job to
//                   avoid wasting server-side renders, captures rate-limit
//                   headers. Operator-only, double opt-in (see below).
//
// Write-mode opt-in (per docs/specs/2026-05-20-model-invocation-policy.md
// gate matrix and the v0.3.0 followup §4.3 design):
//   - Set env DESCRIPT_SMOKE_MODE_WRITE=1
//   - Pass --confirm on the command line
// Both are required. The script refuses to run write-mode otherwise.
//
// Env (token resolution follows the standard plugin precedence: flag, env,
// config file, plugin user-config):
//   DESCRIPT_API_TOKEN          - optional; usually resolved from the config file
//   DESCRIPT_PROFILE            - optional; selects which profile to use
//   DESCRIPT_SMOKE_PROJECT_ID   - required; must contain at least 5 comps
//   DESCRIPT_SMOKE_PROFILE      - optional alias for DESCRIPT_PROFILE
//   DESCRIPT_SMOKE_MODE_WRITE   - required for --mode write (must equal "1")
//
// Output: markdown summary to stdout AND scripts/smoke/results/concurrency-<ISO>.md
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DescriptClient } from "../../src/client/index.js";
import { resolveCredentials } from "../../src/config/credentials.js";
const CONCURRENCY_LEVELS = [1, 2, 3, 5, 7, 10];
function parseMode(argv) {
    const idx = argv.indexOf("--mode");
    if (idx === -1)
        return "read";
    const v = argv[idx + 1];
    if (v === "read" || v === "write")
        return v;
    throw new Error(`--mode must be 'read' or 'write' (got "${v}")`);
}
function hasFlag(argv, name) {
    return argv.includes(`--${name}`);
}
async function readMode(client, slugs) {
    const lines = [];
    lines.push(`# Concurrency smoke - read mode\n`);
    lines.push(`Slugs tested: ${slugs.length}\n`);
    lines.push(`| Concurrency | Wall time (ms) | 429s | Other errors |`);
    lines.push(`|---|---|---|---|`);
    for (const conc of CONCURRENCY_LEVELS) {
        const start = Date.now();
        let rateLimited = 0;
        let other = 0;
        let next = 0;
        async function worker() {
            while (true) {
                const i = next++;
                if (i >= slugs.length)
                    return;
                try {
                    await client.getPublishedProjectMetadata(slugs[i]);
                }
                catch (e) {
                    const msg = String(e);
                    if (msg.includes("429"))
                        rateLimited++;
                    else
                        other++;
                }
            }
        }
        await Promise.all(Array.from({ length: conc }, () => worker()));
        const elapsed = Date.now() - start;
        lines.push(`| ${conc} | ${elapsed} | ${rateLimited} | ${other} |`);
    }
    return lines.join("\n") + "\n";
}
// Write-mode smoke - submits N publish jobs at varying concurrency, immediately
// cancels each to avoid wasting server-side renders. Captures 429 incidence
// and rate-limit header surface. The plugin's HTTP client honors Retry-After
// automatically (see src/client/http.ts), so any 429 here that resolves via
// retry indicates the rate-limit recovery path is working. A 429 that does
// NOT resolve indicates concurrency above the safe ceiling.
async function writeMode(client, projectId, compIds) {
    const lines = [];
    lines.push(`# Concurrency smoke - write mode\n`);
    lines.push(`Comps tested per round: ${compIds.length}\n`);
    lines.push(`Pattern: submit publish, immediately cancel (no server-side render wasted).\n`);
    lines.push(`| Concurrency | Wall time (ms) | Submitted | 429s | Other errors | Cancelled |`);
    lines.push(`|---|---|---|---|---|---|`);
    for (const conc of CONCURRENCY_LEVELS) {
        const start = Date.now();
        let submitted = 0;
        let rateLimited = 0;
        let other = 0;
        let cancelled = 0;
        let next = 0;
        async function worker() {
            while (true) {
                const i = next++;
                if (i >= compIds.length)
                    return;
                try {
                    const out = await client.publishJob({
                        project_id: projectId,
                        composition_id: compIds[i],
                        media_type: "Video",
                        resolution: "480p", // lowest, fastest if cancel races the render
                        access_level: "private"
                    });
                    submitted++;
                    // Immediately cancel to avoid wasting a render slot. Best effort -
                    // if cancel fails (job already completed, race), the renders are
                    // still small (480p) and on the user's own Drive.
                    try {
                        await client.cancelJob(out.job_id);
                        cancelled++;
                    }
                    catch {
                        // Cancel race - acceptable here.
                    }
                }
                catch (e) {
                    const msg = String(e);
                    if (msg.includes("429"))
                        rateLimited++;
                    else
                        other++;
                }
            }
        }
        await Promise.all(Array.from({ length: conc }, () => worker()));
        const elapsed = Date.now() - start;
        lines.push(`| ${conc} | ${elapsed} | ${submitted} | ${rateLimited} | ${other} | ${cancelled} |`);
    }
    lines.push(`\nNotes:`);
    lines.push(`- 429s here that recovered indicate Retry-After honor is working (see src/client/http.ts).`);
    lines.push(`- 429s that did NOT recover indicate the configured concurrency exceeds the safe ceiling.`);
    lines.push(`- Cancelled count should equal Submitted within a small race window.`);
    return lines.join("\n") + "\n";
}
async function main() {
    const argv = process.argv.slice(2);
    let mode;
    try {
        mode = parseMode(argv);
    }
    catch (e) {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(2);
    }
    // Write-mode opt-in gate - both env var AND --confirm required.
    if (mode === "write") {
        const envOk = process.env["DESCRIPT_SMOKE_MODE_WRITE"] === "1";
        const flagOk = hasFlag(argv, "confirm");
        if (!envOk || !flagOk) {
            console.error("Write mode requires BOTH:\n" +
                "  - env DESCRIPT_SMOKE_MODE_WRITE=1\n" +
                "  - CLI flag --confirm\n" +
                "Submits real publish jobs (immediately cancelled) against the smoke project.\n" +
                "Each submission consumes Descript rate-limit budget on the configured Drive.");
            process.exit(2);
        }
    }
    const projectId = process.env["DESCRIPT_SMOKE_PROJECT_ID"];
    if (!projectId) {
        console.error("Required env: DESCRIPT_SMOKE_PROJECT_ID");
        process.exit(2);
    }
    const profile = process.env["DESCRIPT_SMOKE_PROFILE"] ?? process.env["DESCRIPT_PROFILE"];
    const creds = resolveCredentials({ profile, env: process.env });
    console.error(`Using profile "${creds.profile}" from ${creds.source}`);
    const client = new DescriptClient({ token: creds.token });
    const project = await client.getProject(projectId);
    const comps = project.compositions ?? [];
    if (comps.length < 5) {
        console.error(`Smoke project ${projectId} must have at least 5 compositions (has ${comps.length})`);
        process.exit(2);
    }
    let md;
    if (mode === "write") {
        console.error(`Running write-mode smoke against ${comps.length} compositions...`);
        const compIds = comps.slice(0, 5).map((c) => c.id);
        md = await writeMode(client, projectId, compIds);
    }
    else {
        // For read mode we need slugs of published compositions. The /projects
        // endpoint does not currently expose per-composition slugs, so we publish
        // each comp once at the start to obtain slugs. (This is the warmup cost
        // of the smoke run.)
        const warmupCount = Math.min(5, comps.length);
        console.error(`Warming up: publishing ${warmupCount} of ${comps.length} compositions to obtain slugs...`);
        const slugs = [];
        for (const cc of comps.slice(0, 5)) {
            const out = await client.publishJob({
                project_id: projectId, composition_id: cc.id,
                media_type: "Video", resolution: "1080p", access_level: "private"
            });
            // Poll briefly until stopped
            let status = await client.getJob(out.job_id);
            while (status.job_state !== "stopped" && status.job_state !== "cancelled") {
                await new Promise((r) => setTimeout(r, 2000));
                status = await client.getJob(out.job_id);
            }
            // Narrow to publish job result: only PublishJobStatus has share_url in result
            if (status.job_type === "publish" && status.result?.status === "success") {
                const slug = status.result.share_url.split("/").pop() ?? "";
                if (slug)
                    slugs.push(slug);
            }
        }
        console.error(`Obtained ${slugs.length} slugs. Running smoke...`);
        md = await readMode(client, slugs);
    }
    process.stdout.write(md);
    mkdirSync("scripts/smoke/results", { recursive: true });
    const out = join("scripts/smoke/results", `concurrency-${mode}-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
    writeFileSync(out, md);
    console.error(`Wrote ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
