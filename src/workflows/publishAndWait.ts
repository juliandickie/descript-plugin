import type { DescriptClient } from "../client/index.js";
import type { PublishRequest, PublishJobStatus } from "../client/types.js";
import { pollJob, type PollOptions } from "./poll.js";

export interface PublishOutcome {
  ok: boolean;
  jobId: string;
  projectId: string;
  projectUrl: string;
  shareUrl?: string;
  downloadUrl?: string;
  error?: string;
}

export async function publishAndWait(
  client: DescriptClient,
  req: PublishRequest,
  poll: PollOptions = {}
): Promise<PublishOutcome> {
  const submit = await client.publishJob(req);
  const final = (await pollJob((id) => client.getJob(id), submit.job_id, poll)) as PublishJobStatus;
  const result = final.result;
  const base = { jobId: submit.job_id, projectId: submit.project_id, projectUrl: submit.project_url };

  if (!result || result.status === "error") {
    return { ...base, ok: false, error: result?.status === "error" ? result.error_message : "Job stopped without a result" };
  }
  return { ...base, ok: true, shareUrl: result.share_url, downloadUrl: result.download_url };
}
