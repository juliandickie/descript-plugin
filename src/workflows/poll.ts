import type { JobStatus } from "../client/types.js";
import { DescriptApiError } from "../client/errors.js";

export interface PollOptions {
  intervalMs?: number;
  maxWaitMs?: number;
  backoffFactor?: number;
  maxIntervalMs?: number;
  maxPollRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onPoll?: (status: JobStatus) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function pollJob(
  getJob: (jobId: string) => Promise<JobStatus>,
  jobId: string,
  opts: PollOptions = {}
): Promise<JobStatus> {
  const interval0 = opts.intervalMs ?? 3000;
  const maxWait = opts.maxWaitMs ?? 30 * 60 * 1000;
  const factor = opts.backoffFactor ?? 1.5;
  const maxInterval = opts.maxIntervalMs ?? 15000;
  const maxPollRetries = opts.maxPollRetries ?? 5;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;

  const start = now();
  let interval = interval0;
  let pollAttempt = 0;

  for (;;) {
    let status: JobStatus;
    try {
      status = await getJob(jobId);
    } catch (e) {
      // Only the idempotent getJob read is retried here. Submits (import/agent/
      // publish) are non-idempotent and must never be blindly retried (duplicate
      // spend). Transient = server error (>=500) or a non-API network/parse error.
      // 429 is handled inside HttpClient; an exhausted 429 propagates.
      const transient =
        (e instanceof DescriptApiError && e.status >= 500) ||
        !(e instanceof DescriptApiError);
      if (transient && pollAttempt < maxPollRetries) {
        pollAttempt += 1;
        if (now() - start >= maxWait) {
          throw new Error(
            `Polling timed out after ${maxWait}ms for job ${jobId} (transient error: ${e instanceof Error ? e.message : String(e)})`
          );
        }
        await sleep(interval);
        interval = Math.min(Math.round(interval * factor), maxInterval);
        continue;
      }
      throw e;
    }
    pollAttempt = 0;
    opts.onPoll?.(status);
    if (status.job_state === "stopped") return status;
    if (status.job_state === "cancelled") {
      throw new Error(`Job ${jobId} was cancelled`);
    }
    if (now() - start >= maxWait) {
      throw new Error(`Polling timed out after ${maxWait}ms for job ${jobId} (last state: ${status.job_state})`);
    }
    await sleep(interval);
    interval = Math.min(Math.round(interval * factor), maxInterval);
  }
}
