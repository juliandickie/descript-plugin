import type { JobStatus } from "../client/types.js";

export interface PollOptions {
  intervalMs?: number;
  maxWaitMs?: number;
  backoffFactor?: number;
  maxIntervalMs?: number;
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
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;

  const start = now();
  let interval = interval0;

  for (;;) {
    const status = await getJob(jobId);
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
