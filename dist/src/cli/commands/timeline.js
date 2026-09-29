import { downloadLinkNote } from "../../workflows/timelineExport.js";
/** Every timeline format the API takes, with what opens it. Order is the order shown to users. */
export const TIMELINE_FORMATS = [
    { id: "edl", opensIn: "Samplitude EDL (Reaper, Samplitude)" },
    { id: "sesx", opensIn: "Adobe Audition session" },
    { id: "fcp", opensIn: "Final Cut Pro X (FCPXML 1.8)" },
    { id: "premiere", opensIn: "Adobe Premiere Pro XML" },
    { id: "davinci_resolve", opensIn: "DaVinci Resolve XML" },
    { id: "aaf", opensIn: "Pro Tools and Logic (AAF, binary)" }
];
export const TIMELINE_FORMAT_IDS = TIMELINE_FORMATS.map((f) => f.id);
/** One indented line per format, for usage errors: `  edl              Samplitude EDL (...)`. */
export function timelineFormatLines() {
    const width = Math.max(...TIMELINE_FORMATS.map((f) => f.id.length));
    return TIMELINE_FORMATS.map((f) => `  ${f.id.padEnd(width)}  ${f.opensIn}`).join("\n");
}
export const TIMELINE_USAGE = "Usage: descript timeline <project-id> [composition-id] --format edl|sesx|fcp|premiere|davinci_resolve|aaf [--out <path>] [--markers | --no-markers] [--track-per-file] [--source-frame-rate] [--strip-spaces] [--callback-url <url>] [--no-wait]";
/** Formats the API lets `snap_frame_rates` be turned off for (--source-frame-rate). */
export const SOURCE_FRAME_RATE_FORMATS = ["premiere", "davinci_resolve"];
/**
 * Human output for a finished export. Success is two lines, the saved file and the
 * signed download link with its expiry (valid 24 hours). A failure names what went
 * wrong, and once the job had succeeded it still carries the link.
 */
export function formatTimelineOutcome(o) {
    if (o.ok) {
        return [
            `Saved ${o.path} (${o.bytes} bytes, ${o.format}, composition ${o.compositionId})`,
            `Download link (${downloadLinkNote(o.downloadUrlExpiresAt)}): ${o.downloadUrl}`
        ].join("\n");
    }
    if (o.failedAt === "download")
        return `Timeline export finished but the download failed: ${o.error}`;
    if (o.failedAt === "save")
        return `Timeline export finished but the file could not be saved: ${o.error}`;
    return `Timeline export failed: ${o.error}`;
}
/** --json shape. Success and failure are separate, documented shapes. */
export function timelineOutcomeJson(o) {
    if (o.ok) {
        return {
            ok: true, jobId: o.jobId, projectId: o.projectId, compositionId: o.compositionId, format: o.format,
            fileName: o.fileName, contentType: o.contentType, path: o.path, bytes: o.bytes,
            downloadUrl: o.downloadUrl, downloadUrlExpiresAt: o.downloadUrlExpiresAt
        };
    }
    return {
        ok: false, jobId: o.jobId, error: o.error,
        ...(o.downloadUrl ? { downloadUrl: o.downloadUrl } : {}),
        ...(o.downloadUrlExpiresAt ? { downloadUrlExpiresAt: o.downloadUrlExpiresAt } : {})
    };
}
