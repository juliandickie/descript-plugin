import type { DescriptClient } from "../client/index.js";
import { editAndWait } from "./editAndWait.js";
import type { PollOptions } from "./poll.js";

export interface TranslateOutcome {
  ok: boolean;
  jobId: string;
  language: string;
  newCompositions: Array<{ id: string; name: string }>;
  agentResponse?: string;
  projectChanged?: boolean;
  aiCreditsUsed?: number;
  resolvedModel?: string;
  error?: string;
}

// Language-to-composition mapping is NOT recoverable after the fact (no
// metadata field exists - verified 2026-08-28), so this captures it at
// creation time: snapshot compositions, run the agent translation, diff.
// The prompt is self-contained because the API cannot continue agent
// conversations (conversation_id is response-only) - a clarifying question
// costs a full billable round.
export async function translateAndMap(client: DescriptClient, opts: {
  projectId: string;
  compositionId?: string;
  language: string;
  model?: string;
  poll?: PollOptions;
}): Promise<TranslateOutcome> {
  const before = await client.getProject(opts.projectId);
  const known = new Set((before.compositions ?? []).map((c) => c.id));
  const prompt =
    `Add captions to this composition if it has none, then translate the captions into ${opts.language}. ` +
    `If the language names a regional variant (for example "French (Canada)"), use exactly that variant. ` +
    `Captions translation only, no dubbing.`;
  const edit = await editAndWait(client, {
    project_id: opts.projectId,
    ...(opts.compositionId ? { composition_id: opts.compositionId } : {}),
    prompt,
    ...(opts.model ? { model: opts.model } : {})
  }, opts.poll ?? {});
  const base = { jobId: edit.jobId, language: opts.language };
  if (!edit.ok) {
    return { ...base, ok: false, newCompositions: [], error: edit.error };
  }
  const after = await client.getProject(opts.projectId);
  const newCompositions = (after.compositions ?? [])
    .filter((c) => !known.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));
  return {
    ...base, ok: true, newCompositions,
    agentResponse: edit.agentResponse,
    projectChanged: edit.projectChanged,
    aiCreditsUsed: edit.aiCreditsUsed,
    resolvedModel: edit.resolvedModel
  };
}
