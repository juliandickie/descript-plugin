import type { DescriptClient } from "../client/index.js";
import type { PublishRequest } from "../client/types.js";
import { pollJob, type PollOptions } from "./poll.js";

export interface PublishOutcome {
  ok: boolean;
  jobId: string;
  projectId: string;
  projectUrl: string;
  shareUrl?: string;
  downloadUrl?: string;
  downloadUrlExpiresAt?: string;
  error?: string;
}

/**
 * Retry policy for the initial publish SUBMISSION only (the
 * `client.publishJob` call). Must never extend to polling or the job_type
 * check below - a submission that already succeeded must never be
 * resubmitted, or the original job is orphaned while a duplicate publish
 * runs alongside it (see docs/field-reports/2026-08-27 already-running
 * findings). The caller supplies the policy (which errors qualify, how
 * long to wait, how many attempts); this function owns only the mechanism.
 */
export interface SubmitRetryOptions {
  isRetryable: (e: unknown) => boolean;
  sleep: (ms: number) => Promise<void>;
  waitMs: number;
  maxAttempts: number;
}

export async function publishAndWait(
  client: DescriptClient,
  req: PublishRequest,
  poll: PollOptions = {},
  submitRetry?: SubmitRetryOptions
): Promise<PublishOutcome> {
  let submit;
  for (let attempt = 0; ; attempt++) {
    try {
      submit = await client.publishJob(req);
      break;
    } catch (e) {
      if (submitRetry && submitRetry.isRetryable(e) && attempt < submitRetry.maxAttempts) {
        await submitRetry.sleep(submitRetry.waitMs);
        continue;
      }
      throw e;
    }
  }
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
