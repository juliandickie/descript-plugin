import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DescriptClient } from "../../src/client/index.js";
import { translateAndMap } from "../../src/workflows/translate.js";
import { installMockFetchByUrl, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());
const proj = (comps: Array<{ id: string; name: string }>) => ({
  id: "p1", name: "P", drive_id: "d", created_at: "a", updated_at: "b",
  media_files: {}, compositions: comps.map((c) => ({ ...c, media_type: "video" }))
});

test("translateAndMap diffs compositions and reports the new one", async () => {
  const { calls } = installMockFetchByUrl([
    { match: "/projects/p1", responses: [
      { status: 200, json: proj([{ id: "orig", name: "Video" }]) },
      { status: 200, json: proj([{ id: "orig", name: "Video" }, { id: "newfr", name: "Vidéo" }]) }
    ]},
    { match: "/jobs/agent", responses: [{ status: 201, json: { job_id: "ja", drive_id: "d", project_id: "p1", project_url: "u" } }]},
    { match: "/jobs/ja", responses: [{ status: 200, json: { job_id: "ja", job_type: "agent", job_state: "stopped", created_at: "a", drive_id: "d", project_id: "p1", project_url: "u", result: { status: "success", agent_response: "Done", project_changed: true, ai_credits_used: 9.3, resolved_model: "claude-haiku-4.5" } } }]}
  ]);
  const out = await translateAndMap(new DescriptClient({ token: "t" }), {
    projectId: "p1", compositionId: "orig", language: "French (Canada)", model: "claude-haiku"
  });
  assert.equal(out.ok, true);
  assert.deepEqual(out.newCompositions, [{ id: "newfr", name: "Vidéo" }]);
  assert.equal(out.resolvedModel, "claude-haiku-4.5");
  const agentBody = JSON.parse(calls.find((c) => c.url.includes("/jobs/agent"))!.body!);
  assert.equal(agentBody.composition_id, "orig");
  assert.equal(agentBody.model, "claude-haiku");
  assert.match(agentBody.prompt, /French \(Canada\)/);
  assert.match(agentBody.prompt, /exactly that variant/i);
  assert.match(agentBody.prompt, /no dubbing/i);
  assert.match(agentBody.prompt, /add captions/i);
});

test("translateAndMap reports zero new compositions when the agent only asks", async () => {
  installMockFetchByUrl([
    { match: "/projects/p1", responses: [
      { status: 200, json: proj([{ id: "orig", name: "Video" }]) },
      { status: 200, json: proj([{ id: "orig", name: "Video" }]) }
    ]},
    { match: "/jobs/agent", responses: [{ status: 201, json: { job_id: "ja", drive_id: "d", project_id: "p1", project_url: "u" } }]},
    { match: "/jobs/ja", responses: [{ status: 200, json: { job_id: "ja", job_type: "agent", job_state: "stopped", created_at: "a", drive_id: "d", project_id: "p1", project_url: "u", result: { status: "success", agent_response: "Would you like me to add captions first?", project_changed: false, ai_credits_used: 5.4 } } }]}
  ]);
  const out = await translateAndMap(new DescriptClient({ token: "t" }), { projectId: "p1", language: "German" });
  assert.equal(out.ok, true);
  assert.deepEqual(out.newCompositions, []);
  assert.match(out.agentResponse ?? "", /add captions first/);
});
