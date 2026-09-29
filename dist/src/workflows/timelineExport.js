import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { downloadTimelineFile, TimelineDownloadError } from "../client/timeline.js";
import { pollJob } from "./poll.js";
// What the API names each format's file, used only if a result arrives without file_name.
const FALLBACK_FILE_NAME = {
    edl: "timeline.edl",
    sesx: "timeline.sesx",
    fcp: "timeline.fcpxml",
    premiere: "timeline.xml",
    davinci_resolve: "timeline.xml",
    aaf: "timeline.aaf"
};
/** "valid 24 hours" plus the exact expiry when the API gave one. */
export function downloadLinkNote(expiresAt) {
    return expiresAt ? `valid 24 hours, expires ${expiresAt}` : "valid 24 hours";
}
/**
 * Where the export is written. `--out` names the file, unless it is an existing
 * folder (or ends in a path separator), in which case the API's file name goes
 * inside it. With no `--out` the file lands in the current directory as
 * `<project_id>-<file_name>`. The API's file name is reduced to its base name, so
 * a hostile or odd value can never climb out of the target folder. Always absolute.
 */
export function resolveTimelineOutputPath(out, projectId, fileName, format) {
    const base = basename((fileName ?? "").trim());
    const name = base === "" || base === "." || base === ".." ? FALLBACK_FILE_NAME[format] : base;
    if (out === undefined)
        return resolve(`${projectId.replace(/[^A-Za-z0-9._-]/g, "-")}-${name}`);
    const isFolder = out.endsWith("/") || out.endsWith(sep) || (existsSync(out) && statSync(out).isDirectory());
    return resolve(isFolder ? join(out, name) : out);
}
/**
 * Waits for a submitted timeline export, downloads the finished file from its
 * signed storage URL and writes it to disk. The job is already submitted; a
 * failure at any later step is reported, never thrown, and once the job has
 * succeeded the outcome keeps the download link so the file can be fetched by
 * hand (it stays valid for 24 hours). Polling errors (cancelled, timed out, API
 * errors) still throw, as they do for every other command.
 */
export async function saveTimelineExport(client, submit, opts = {}) {
    const base = { jobId: submit.job_id, projectId: submit.project_id, format: submit.format };
    const final = await pollJob((id) => client.getJob(id), submit.job_id, opts.poll);
    if (final.job_type !== "export/timeline") {
        throw new Error(`Unexpected job_type "${final.job_type}" for timeline export job ${submit.job_id}`);
    }
    const result = final.result;
    if (!result || result.status === "error") {
        return { ...base, ok: false, failedAt: "job", error: result?.status === "error" ? result.error_message : "Job stopped without a result" };
    }
    const link = { downloadUrl: result.download_url, downloadUrlExpiresAt: result.download_url_expires_at };
    const file = { compositionId: result.composition_id, fileName: result.file_name, contentType: result.content_type };
    if (!result.download_url) {
        return { ...base, ...file, ok: false, failedAt: "job", error: "The export job succeeded but returned no download URL" };
    }
    const retry = `retry by hand while the link is valid (${downloadLinkNote(result.download_url_expires_at)}): ${result.download_url}`;
    let bytes;
    try {
        bytes = await downloadTimelineFile(result.download_url);
    }
    catch (e) {
        const why = e instanceof TimelineDownloadError ? e.message : `Download failed: ${e instanceof Error ? e.message : String(e)}`;
        return { ...base, ...file, ...link, ok: false, failedAt: "download", error: `${why} - ${retry}` };
    }
    const path = resolveTimelineOutputPath(opts.out, submit.project_id, result.file_name, submit.format);
    try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, bytes);
    }
    catch (e) {
        return { ...base, ...file, ...link, ok: false, failedAt: "save", error: `Could not write ${path}: ${e instanceof Error ? e.message : String(e)} - ${retry}` };
    }
    return { ...base, ...file, ...link, ok: true, path, bytes: bytes.length };
}
