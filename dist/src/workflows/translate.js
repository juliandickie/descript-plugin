import { editAndWait } from "./editAndWait.js";
// Language-to-composition mapping is NOT recoverable after the fact (no
// metadata field exists - verified 2026-08-28), so this captures it at
// creation time: snapshot compositions, run the agent translation, diff.
// The prompt is self-contained because the API cannot continue agent
// conversations (conversation_id is response-only) - a clarifying question
// costs a full billable round.
export async function translateAndMap(client, opts) {
    const before = await client.getProject(opts.projectId);
    const known = new Set((before.compositions ?? []).map((c) => c.id));
    const prompt = `Add captions to this composition if it has none, then translate the captions into ${opts.language}. ` +
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
    // The agent job already ran and billed AI credits by this point (edit.ok is
    // true). If this after-snapshot fetch fails, that must never be reported as
    // a job failure - the caller would be invited to re-run translate, billing
    // a second time for work that already happened. Surface every field already
    // in hand from the billed job instead, with mappingCaptureFailed set so the
    // caller can recover the mapping manually (e.g. `projects get` + reading
    // the agent's response) rather than re-running.
    let after;
    try {
        after = await client.getProject(opts.projectId);
    }
    catch (e) {
        return {
            ...base, ok: true, newCompositions: [],
            mappingCaptureFailed: e instanceof Error ? e.message : String(e),
            agentResponse: edit.agentResponse,
            projectChanged: edit.projectChanged,
            aiCreditsUsed: edit.aiCreditsUsed,
            resolvedModel: edit.resolvedModel
        };
    }
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
