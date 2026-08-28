import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { exportPublished } from "./exportPublished.js";
import { publishAndWait } from "./publishAndWait.js";
import { DescriptApiError } from "../client/errors.js";
function slugFromShareUrl(shareUrl) {
    // Descript share URLs end with /view/<slug>; pull the last path segment.
    try {
        const u = new URL(shareUrl);
        const parts = u.pathname.split("/").filter(Boolean);
        return parts[parts.length - 1] ?? "";
    }
    catch {
        return "";
    }
}
const ALREADY_RUNNING_WAIT_MS = 30_000;
const ALREADY_RUNNING_MAX_ATTEMPTS = 10;
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Descript serializes publish jobs per project. A ghost job (e.g. left by a
// 502 on a prior submission) can hold the lock for minutes, far beyond the
// HTTP layer's Retry-After retries, so this waits at workflow scale. Only
// the specific per-project message qualifies - generic rate limits still
// fail fast after the HTTP layer's own retries.
function isAlreadyRunning(e) {
    return e instanceof DescriptApiError && e.status === 429 &&
        /publish job is already running/i.test(e.body?.message ?? "");
}
async function processOne(client, item, opts) {
    // Reject items that carry both slug AND projectId+compositionId. The two
    // shapes are mutually exclusive at the boundary (slug = download-mode,
    // projectId+compositionId = publish-then-download mode). The current CLI
    // never constructs such items, but enforcing the contract here prevents
    // ambiguous behaviour for any future caller (per v0.3.0 followup §2.1).
    if (item.slug && (item.projectId || item.compositionId)) {
        return {
            ok: false,
            slug: item.slug,
            title: "",
            outputDir: "",
            written: [],
            failed: opts.formats.map((f) => ({ format: f, error: "item carries both slug and projectId+compositionId (mutually exclusive)" })),
            skipped: [],
            projectId: item.projectId,
            compositionId: item.compositionId
        };
    }
    // Determine the slug. Either passed in (download mode) or via publish (export mode).
    let slug = item.slug;
    if (!slug) {
        if (!item.projectId || !item.compositionId) {
            return {
                ok: false,
                slug: "",
                title: "",
                outputDir: "",
                written: [],
                failed: opts.formats.map((f) => ({ format: f, error: "item missing slug and projectId+compositionId" })),
                skipped: [],
                projectId: item.projectId,
                compositionId: item.compositionId
            };
        }
        if (!opts.publish) {
            return {
                ok: false,
                slug: "",
                title: "",
                outputDir: "",
                written: [],
                failed: opts.formats.map((f) => ({ format: f, error: "publish options required for export-mode batch" })),
                skipped: [],
                projectId: item.projectId,
                compositionId: item.compositionId
            };
        }
        try {
            const publishReq = {
                project_id: item.projectId,
                composition_id: item.compositionId,
                media_type: opts.publish.mediaType,
                resolution: opts.publish.resolution,
                access_level: opts.publish.accessLevel
            };
            // The retry itself lives inside publishAndWait, scoped to ONLY the
            // submission call - a poll-time or job-status error must never
            // resubmit, or a job that already submitted successfully gets
            // orphaned while a duplicate publish runs alongside it. exportBatch
            // only supplies the policy: which errors qualify, how long to wait,
            // how many attempts.
            const submitRetry = {
                isRetryable: isAlreadyRunning,
                sleep: opts.sleep ?? defaultSleep,
                waitMs: ALREADY_RUNNING_WAIT_MS,
                maxAttempts: ALREADY_RUNNING_MAX_ATTEMPTS
            };
            const out = await publishAndWait(client, publishReq, {}, submitRetry);
            if (!out.ok || !out.shareUrl) {
                return {
                    ok: false, slug: "", title: "", outputDir: "",
                    written: [],
                    failed: opts.formats.map((f) => ({ format: f, error: out.error ?? "publish failed without error" })),
                    skipped: [],
                    projectId: item.projectId,
                    compositionId: item.compositionId
                };
            }
            slug = slugFromShareUrl(out.shareUrl);
            if (!slug) {
                // The share URL had no path segments. publishAndWait returned a malformed
                // URL or Descript's contract changed. Surface the root cause clearly
                // rather than letting a downstream "published_projects/" 404 obscure it
                // (per v0.3.0 followup §2.2).
                return {
                    ok: false, slug: "", title: "", outputDir: "",
                    written: [],
                    failed: opts.formats.map((f) => ({ format: f, error: `could not extract slug from share URL: ${out.shareUrl}` })),
                    skipped: [],
                    projectId: item.projectId,
                    compositionId: item.compositionId
                };
            }
        }
        catch (e) {
            return {
                ok: false, slug: "", title: "", outputDir: "",
                written: [],
                failed: opts.formats.map((f) => ({ format: f, error: e instanceof Error ? e.message : String(e) })),
                skipped: [],
                projectId: item.projectId,
                compositionId: item.compositionId
            };
        }
    }
    try {
        const result = await exportPublished(client, {
            slug: slug,
            outputDir: opts.outputDir,
            formats: opts.formats,
            endMarker: opts.endMarker,
            projectFolder: item.projectFolder,
            ...(item.skipFormats ? { skipFormats: item.skipFormats } : {}),
            ...(opts.claimFolder ? { claimFolder: opts.claimFolder } : {})
        });
        return {
            ...result,
            projectId: item.projectId,
            compositionId: item.compositionId
        };
    }
    catch (e) {
        return {
            ok: false,
            slug: slug ?? "",
            title: "",
            outputDir: "",
            written: [],
            failed: opts.formats.map((f) => ({ format: f, error: e instanceof Error ? e.message : String(e) })),
            skipped: [],
            projectId: item.projectId,
            compositionId: item.compositionId
        };
    }
}
async function runPool(inputs, concurrency, worker) {
    const results = new Array(inputs.length);
    let next = 0;
    async function workerLoop() {
        while (true) {
            const i = next++;
            if (i >= inputs.length)
                return;
            results[i] = await worker(inputs[i], i);
        }
    }
    const workers = Array.from({ length: Math.max(1, concurrency) }, () => workerLoop());
    await Promise.all(workers);
    return results;
}
export async function exportBatch(client, opts) {
    mkdirSync(opts.outputDir, { recursive: true });
    // Folder-name arbiter shared across the batch. First slug to claim a
    // sanitized title keeps the clean name; later different slugs get a
    // " [<slug>]" suffix. Identical titles are guaranteed by regional
    // translation variants (see field report 2026-08-27), and without this
    // the second item silently overwrites the first.
    const claimed = new Map();
    const claimFolder = (folder, slug) => {
        const holder = claimed.get(folder);
        if (holder === undefined) {
            claimed.set(folder, slug);
            return folder;
        }
        if (holder === slug)
            return folder;
        const suffixed = `${folder} [${slug}]`;
        claimed.set(suffixed, slug);
        return suffixed;
    };
    // Pass a copy carrying claimFolder to the pool workers rather than
    // mutating the caller's opts object.
    const batchOpts = { ...opts, claimFolder };
    // Descript serializes publish jobs per project (verified 2026-08-27), so
    // group export-mode items by projectId and run each group as a serial
    // chain; the pool parallelizes across groups. Download-mode (slug) items
    // have no publish step and stay individually poolable.
    const groups = new Map();
    batchOpts.items.forEach((item, i) => {
        const key = item.slug ? `slug:${i}` : `project:${item.projectId ?? `missing:${i}`}`;
        const g = groups.get(key);
        if (g)
            g.push(i);
        else
            groups.set(key, [i]);
    });
    const results = new Array(batchOpts.items.length);
    // Per-item isolation is guaranteed by processOne's internal error mapping;
    // anything thrown past it would abort the whole batch without a report - keep processOne throw-free.
    await runPool([...groups.values()], batchOpts.concurrency, async (indices) => {
        for (const i of indices)
            results[i] = await processOne(client, batchOpts.items[i], batchOpts);
        return undefined;
    });
    const items = results;
    const ok = items.every((i) => i.ok);
    const report = { ok, command: opts.command, items };
    if (opts.writeReport !== false) {
        const reportPath = join(opts.outputDir, opts.command === "export" ? "export-report.json" : "download-report.json");
        writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    }
    return report;
}
