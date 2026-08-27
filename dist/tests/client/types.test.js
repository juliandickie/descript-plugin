import { test } from "node:test";
import assert from "node:assert/strict";
test("JobStatus discriminates on job_type", () => {
    const job = {
        job_id: "j1",
        job_type: "agent",
        job_state: "stopped",
        created_at: "2026-01-01T00:00:00Z",
        drive_id: "d1",
        project_id: "p1",
        project_url: "https://web.descript.com/p1",
        result: { status: "success", agent_response: "done", project_changed: true, ai_credits_used: 5 }
    };
    assert.equal(job.job_type, "agent");
    if (job.job_type === "agent" && job.result && job.result.status === "success") {
        assert.equal(job.result.ai_credits_used, 5);
    }
});
test("SubmitJobResponse and ImportRequest shapes compile", () => {
    const r = { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" };
    const req = {
        project_name: "P",
        add_media: { "demo.mp4": { url: "https://x/y.mp4" } }
    };
    assert.equal(r.job_id, "j");
    assert.ok(req.add_media["demo.mp4"]);
});
test("new v0.5.0 shapes compile", () => {
    const models = {
        availableModels: [{ id: "claude-haiku-4.5", cost: "low" }],
        aliases: [{ id: "claude-haiku", resolvesTo: "claude-haiku-4.5", cost: "low" }]
    };
    const treq = {
        project_id: "p", format: "srt", include_markers: true,
        timecodes: { frequency_seconds: 30, on_paragraphs: true }
    };
    const pub = {
        composition_id: "c", share_url: "https://share.descript.com/view/x",
        name: "Cut 1", media_type: "video", access_level: "private",
        published_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z"
    };
    const agentOk = {
        status: "success", agent_response: "done", project_changed: true,
        resolved_model: "claude-haiku-4.5", conversation_id: "conv1"
    };
    const importReq = { project_name: "P", workspace_name: "General", add_media: {} };
    assert.equal(models.aliases[0].id, "claude-haiku");
    assert.equal(treq.format, "srt");
    assert.equal(pub.media_type, "video");
    assert.equal(agentOk.resolved_model, "claude-haiku-4.5");
    assert.equal(importReq.workspace_name, "General");
});
