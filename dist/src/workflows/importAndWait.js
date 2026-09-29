import { pollJob } from "./poll.js";
export function normalizeImportJob(submit, final) {
    if (final.job_type !== "import/project_media") {
        throw new Error(`Unexpected job_type "${final.job_type}" for import job ${submit.job_id}`);
    }
    const result = final.result;
    const base = { jobId: submit.job_id, projectId: submit.project_id, projectUrl: submit.project_url };
    if (!result || result.status === "error") {
        return {
            ...base, ok: false, status: "error",
            createdCompositions: [], failedMedia: [],
            error: result?.status === "error" ? result.error_message : "Job stopped without a result"
        };
    }
    const failedMedia = Object.entries(result.media_status)
        .filter(([, v]) => v.status === "failed")
        .map(([ref, v]) => ({ ref, error: v.error_message ?? "unknown" }));
    return {
        ...base,
        ok: result.status === "success" && failedMedia.length === 0,
        status: result.status,
        mediaSecondsUsed: result.media_seconds_used,
        createdCompositions: result.created_compositions ?? [],
        failedMedia
    };
}
export async function importAndWait(client, req, poll = {}) {
    const submit = await client.importProjectMedia(req);
    const final = await pollJob((id) => client.getJob(id), submit.job_id, poll);
    return normalizeImportJob(submit, final);
}
// Reads a drive media library import defensively: the result shape is unobserved, so only
// `status === "success"` counts as success (and a file reported as failed, whatever the
// status says, does not), and whatever `media_status` and error fields exist are reported.
export function normalizeDriveImportJob(submit, final) {
    if (final.job_type !== "import/drive_media") {
        throw new Error(`Unexpected job_type "${final.job_type}" for drive media import job ${submit.job_id}`);
    }
    const base = { jobId: submit.job_id, driveId: submit.drive_id };
    const result = final.result;
    if (!result) {
        return { ...base, ok: false, status: "error", error: "Job stopped without a result" };
    }
    const status = typeof result.status === "string" ? result.status : "unknown";
    const mediaStatus = result.media_status && typeof result.media_status === "object" ? result.media_status : undefined;
    const failed = Object.entries(mediaStatus ?? {})
        .filter(([, v]) => v?.status === "failed")
        .map(([ref, v]) => `${ref}: ${v?.error_message ?? "unknown error"}`);
    const ok = status === "success" && failed.length === 0;
    const error = ok
        ? undefined
        : (typeof result.error_message === "string" && result.error_message !== "" ? result.error_message
            : failed.length > 0 ? failed.join("; ")
                : `Job finished with status "${status}"`);
    return {
        ...base,
        ok,
        status,
        ...(typeof result.media_seconds_used === "number" ? { mediaSecondsUsed: result.media_seconds_used } : {}),
        ...(mediaStatus ? { mediaStatus } : {}),
        ...(error !== undefined ? { error } : {}),
        result
    };
}
export async function importDriveMediaAndWait(client, req, poll = {}) {
    const submit = await client.importDriveMedia(req);
    const final = await pollJob((id) => client.getJob(id), submit.job_id, poll);
    return normalizeDriveImportJob(submit, final);
}
