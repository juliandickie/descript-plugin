import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DescriptClient } from "../../src/client/index.js";
import { importAndWait } from "../../src/workflows/importAndWait.js";
import { editAndWait } from "../../src/workflows/editAndWait.js";
import { publishAndWait } from "../../src/workflows/publishAndWait.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";
afterEach(() => restoreFetch());
const noSleep = async () => { };
test("editAndWait submits, polls, and normalizes the agent outcome", async () => {
    installMockFetch([
        { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
        { status: 200, json: { job_id: "j", job_type: "agent", job_state: "running", created_at: "t", drive_id: "d", project_id: "p", project_url: "u" } },
        { status: 200, json: { job_id: "j", job_type: "agent", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
                result: { status: "success", agent_response: "Added captions", project_changed: true, ai_credits_used: 32, media_seconds_used: 10 } } }
    ]);
    const client = new DescriptClient({ token: "t" });
    const out = await editAndWait(client, { project_id: "p", prompt: "add captions" }, { intervalMs: 1, sleep: noSleep });
    assert.equal(out.ok, true);
    assert.equal(out.projectUrl, "u");
    assert.equal(out.agentResponse, "Added captions");
    assert.equal(out.aiCreditsUsed, 32);
});
test("editAndWait surfaces a failed job result as ok:false", async () => {
    installMockFetch([
        { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
        { status: 200, json: { job_id: "j", job_type: "agent", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
                result: { status: "error", error_message: "agent failed", error_code: "agent_execution_failed" } } }
    ]);
    const client = new DescriptClient({ token: "t" });
    const out = await editAndWait(client, { project_id: "p", prompt: "x" }, { intervalMs: 1, sleep: noSleep });
    assert.equal(out.ok, false);
    assert.match(out.error ?? "", /agent failed/);
});
test("importAndWait normalizes media status and compositions", async () => {
    installMockFetch([
        { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
        { status: 200, json: { job_id: "j", job_type: "import/project_media", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
                result: { status: "success", media_status: { "a.mp4": { status: "success", duration_seconds: 5 } }, media_seconds_used: 5, created_compositions: [{ id: "c1", name: "Cut" }] } } }
    ]);
    const client = new DescriptClient({ token: "t" });
    const out = await importAndWait(client, { project_name: "P", add_media: { "a.mp4": { url: "https://x/a.mp4" } } }, { intervalMs: 1, sleep: noSleep });
    assert.equal(out.ok, true);
    assert.equal(out.createdCompositions[0].name, "Cut");
});
test("publishAndWait returns the share url", async () => {
    installMockFetch([
        { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
        { status: 200, json: { job_id: "j", job_type: "publish", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
                result: { status: "success", composition_id: "c1", share_url: "https://share.descript.com/view/x" } } }
    ]);
    const client = new DescriptClient({ token: "t" });
    const out = await publishAndWait(client, { project_id: "p" }, { intervalMs: 1, sleep: noSleep });
    assert.equal(out.ok, true);
    assert.equal(out.shareUrl, "https://share.descript.com/view/x");
});
test("importAndWait returns ok:false and failedMedia on partial import", async () => {
    installMockFetch([
        { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
        { status: 200, json: { job_id: "j", job_type: "import/project_media", job_state: "stopped", created_at: "t",
                drive_id: "d", project_id: "p", project_url: "u",
                result: { status: "partial",
                    media_status: {
                        "good.mp4": { status: "success", duration_seconds: 10 },
                        "bad.mp4": { status: "failed", error_message: "unsupported codec" }
                    },
                    media_seconds_used: 10,
                    created_compositions: [{ id: "c1", name: "Cut" }] } } }
    ]);
    const client = new DescriptClient({ token: "t" });
    const out = await importAndWait(client, { project_name: "P", add_media: { "good.mp4": { url: "u1" }, "bad.mp4": { url: "u2" } } }, { intervalMs: 1, sleep: noSleep });
    assert.equal(out.ok, false);
    assert.equal(out.status, "partial");
    assert.equal(out.failedMedia.length, 1);
    assert.equal(out.failedMedia[0].ref, "bad.mp4");
    assert.match(out.failedMedia[0].error, /unsupported codec/);
    assert.equal(out.createdCompositions.length, 1);
});
