import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { exportPublished } from "./exportPublished.js";
import { publishAndWait } from "./publishAndWait.js";
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
async function processOne(client, item, opts) {
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
                projectId: item.projectId,
                compositionId: item.compositionId
            };
        }
        try {
            const out = await publishAndWait(client, {
                project_id: item.projectId,
                composition_id: item.compositionId,
                media_type: opts.publish.mediaType,
                resolution: opts.publish.resolution,
                access_level: opts.publish.accessLevel
            });
            if (!out.ok || !out.shareUrl) {
                return {
                    ok: false, slug: "", title: "", outputDir: "",
                    written: [],
                    failed: opts.formats.map((f) => ({ format: f, error: out.error ?? "publish failed without error" })),
                    projectId: item.projectId,
                    compositionId: item.compositionId
                };
            }
            slug = slugFromShareUrl(out.shareUrl);
        }
        catch (e) {
            return {
                ok: false, slug: "", title: "", outputDir: "",
                written: [],
                failed: opts.formats.map((f) => ({ format: f, error: e instanceof Error ? e.message : String(e) })),
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
            projectFolder: item.projectFolder
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
    const items = await runPool(opts.items, opts.concurrency, (item) => processOne(client, item, opts));
    const ok = items.every((i) => i.ok);
    const report = { ok, command: opts.command, items };
    const reportPath = join(opts.outputDir, opts.command === "export" ? "export-report.json" : "download-report.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    return report;
}
