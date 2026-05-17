import { pollJob } from "./poll.js";
export async function publishAndWait(client, req, poll = {}) {
    const submit = await client.publishJob(req);
    const final = await pollJob((id) => client.getJob(id), submit.job_id, poll);
    if (final.job_type !== "publish") {
        throw new Error(`Unexpected job_type "${final.job_type}" for publish job ${submit.job_id}`);
    }
    const result = final.result;
    const base = { jobId: submit.job_id, projectId: submit.project_id, projectUrl: submit.project_url };
    if (!result || result.status === "error") {
        return { ...base, ok: false, error: result?.status === "error" ? result.error_message : "Job stopped without a result" };
    }
    return { ...base, ok: true, shareUrl: result.share_url, downloadUrl: result.download_url, downloadUrlExpiresAt: result.download_url_expires_at };
}
