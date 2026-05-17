import type { DescriptClient } from "../client/index.js";
import type { AgentRequest } from "../client/types.js";
import { pollJob, type PollOptions } from "./poll.js";

export interface EditOutcome {
  ok: boolean;
  jobId: string;
  projectId: string;
  projectUrl: string;
  agentResponse?: string;
  projectChanged?: boolean;
  aiCreditsUsed?: number;
  mediaSecondsUsed?: number;
  error?: string;
}

export async function editAndWait(
  client: DescriptClient,
  req: AgentRequest,
  poll: PollOptions = {}
): Promise<EditOutcome> {
  const submit = await client.agentEditJob(req);
  const final = await pollJob((id) => client.getJob(id), submit.job_id, poll);
  if (final.job_type !== "agent") {
    throw new Error(`Unexpected job_type "${final.job_type}" for agent job ${submit.job_id}`);
  }
  const result = final.result;
  const base = { jobId: submit.job_id, projectId: submit.project_id, projectUrl: submit.project_url };

  if (!result || result.status === "error") {
    return { ...base, ok: false, error: result?.status === "error" ? result.error_message : "Job stopped without a result" };
  }
  return {
    ...base, ok: true,
    agentResponse: result.agent_response,
    projectChanged: result.project_changed,
    aiCreditsUsed: result.ai_credits_used,
    mediaSecondsUsed: result.media_seconds_used
  };
}
