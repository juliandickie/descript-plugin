import type { JobStatus } from "../client/types.js";

export interface IO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  json: boolean;
}

export function emit(io: IO, human: string, data: unknown): void {
  if (io.json) io.stdout(JSON.stringify(data, null, 2) + "\n");
  else io.stdout(human + "\n");
}

export function fail(io: IO, message: string, data?: unknown): void {
  if (io.json) io.stderr(JSON.stringify({ error: message, ...(data ? { detail: data } : {}) }, null, 2) + "\n");
  else io.stderr(message + "\n");
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * Builds the onPoll callback that shows Underlord's progress while a job runs.
 * Each NEW label (the job status carries `progress.label`, for example "Applying
 * Studio Sound to clip 2...") is written to stderr as one line,
 * "  progress - <label>", so it never mixes into the result on stdout. In --json
 * mode it does nothing, which keeps machine output clean and is why the MCP shim
 * (which always passes --json) never carries progress. `context` names the item
 * when several jobs report at once (a multi-composition export). Every reporter
 * remembers its own last label, so build one per job.
 */
export function progressReporter(io: IO, context?: string): (status: JobStatus) => void {
  if (io.json) return () => {};
  const prefix = context ? `${oneLine(context)} - ` : "";
  let last: string | undefined;
  return (status) => {
    const raw = status.progress?.label;
    if (typeof raw !== "string") return;
    const label = oneLine(raw);
    if (label === "" || label === last) return;
    last = label;
    io.stderr(`  progress - ${prefix}${label}\n`);
  };
}
