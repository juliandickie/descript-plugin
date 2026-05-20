// Concurrency smoke test - dev workflow, not part of npm test, not CI.
//
// Discovers Descript's real rate-limit ceiling so we can set a sensible
// production default for --concurrency. Defaults to read-mode (download-
// published against an existing project's slugs). Optional --mode write
// exercises the publish path; the script cancels jobs immediately after
// submission so server-side renders are not wasted.
//
// Env (token resolution follows the standard plugin precedence: flag → env →
// config file → plugin user-config):
//   DESCRIPT_API_TOKEN          - optional; usually resolved from the config file
//   DESCRIPT_PROFILE            - optional; selects which profile to use
//   DESCRIPT_SMOKE_PROJECT_ID   - required; must contain at least 5 comps that
//                                 can safely be re-published
//   DESCRIPT_SMOKE_PROFILE      - optional alias for DESCRIPT_PROFILE
//
// Output: markdown summary to stdout AND scripts/smoke/results/concurrency-<ISO>.md

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DescriptClient } from "../../src/client/index.js";
import { resolveCredentials } from "../../src/config/credentials.js";

const CONCURRENCY_LEVELS = [1, 2, 3, 5, 7, 10];

async function readMode(client: DescriptClient, slugs: string[]): Promise<string> {
  const lines: string[] = [];
  lines.push(`# Concurrency smoke - read mode\n`);
  lines.push(`Slugs tested: ${slugs.length}\n`);
  lines.push(`| Concurrency | Wall time (ms) | 429s | Other errors |`);
  lines.push(`|---|---|---|---|`);

  for (const conc of CONCURRENCY_LEVELS) {
    const start = Date.now();
    let rateLimited = 0;
    let other = 0;
    let next = 0;
    async function worker(): Promise<void> {
      while (true) {
        const i = next++;
        if (i >= slugs.length) return;
        try {
          await client.getPublishedProjectMetadata(slugs[i]!);
        } catch (e) {
          const msg = String(e);
          if (msg.includes("429")) rateLimited++;
          else other++;
        }
      }
    }
    await Promise.all(Array.from({ length: conc }, () => worker()));
    const elapsed = Date.now() - start;
    lines.push(`| ${conc} | ${elapsed} | ${rateLimited} | ${other} |`);
  }
  return lines.join("\n") + "\n";
}

async function main(): Promise<void> {
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

  // For read mode we need slugs of published compositions. The /projects
  // endpoint does not currently expose per-composition slugs, so we publish
  // each comp once at the start to obtain slugs. (This is the warmup cost
  // of the smoke run.)
  const warmupCount = Math.min(5, comps.length);
  console.error(`Warming up: publishing ${warmupCount} of ${comps.length} compositions to obtain slugs...`);
  const slugs: string[] = [];
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
      if (slug) slugs.push(slug);
    }
  }

  console.error(`Obtained ${slugs.length} slugs. Running smoke...`);
  const md = await readMode(client, slugs);
  process.stdout.write(md);

  mkdirSync("scripts/smoke/results", { recursive: true });
  const out = join("scripts/smoke/results", `concurrency-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  writeFileSync(out, md);
  console.error(`Wrote ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
