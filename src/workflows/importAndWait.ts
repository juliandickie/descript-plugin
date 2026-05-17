import type { DescriptClient } from "../client/index.js";
import type { ImportRequest, SubmitJobResponse, JobStatus } from "../client/types.js";
import { pollJob, type PollOptions } from "./poll.js";

export interface ImportOutcome {
  ok: boolean;
  jobId: string;
  projectId: string;
  projectUrl: string;
  status: "success" | "partial" | "error";
  mediaSecondsUsed?: number;
  createdCompositions: Array<{ id: string; name: string }>;
  failedMedia: Array<{ ref: string; error: string }>;
  error?: string;
}

export function normalizeImportJob(submit: SubmitJobResponse, final: JobStatus): ImportOutcome {
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

export async function importAndWait(
  client: DescriptClient,
  req: ImportRequest,
  poll: PollOptions = {}
): Promise<ImportOutcome> {
  const submit = await client.importProjectMedia(req);
  const final = await pollJob((id) => client.getJob(id), submit.job_id, poll);
  return normalizeImportJob(submit, final);
}
