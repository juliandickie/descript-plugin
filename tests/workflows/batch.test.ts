import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DescriptClient } from "../../src/client/index.js";
import { parseManifest, planBatch, runBatch } from "../../src/workflows/batch.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());

const manifest = {
  concurrency: 1,
  items: [
    { name: "vid1", source: { url: "https://x/a.mp4" }, project_name: "Vid 1", agent_prompt: "add captions",
      publish: { media_type: "Video", resolution: "1080p" } }
  ]
};

test("parseManifest validates required fields", () => {
  assert.throws(() => parseManifest({ items: [{}] }), /source/);
  const m = parseManifest(manifest);
  assert.equal(m.items.length, 1);
});

test("planBatch returns a non-executing plan", () => {
  const plan = planBatch(parseManifest(manifest));
  assert.equal(plan.itemCount, 1);
  assert.equal(plan.willImport, 1);
  assert.equal(plan.willEdit, 1);
  assert.equal(plan.willPublish, 1);
  assert.match(plan.summary, /1 item/);
});

test("runBatch refuses without confirm", async () => {
  const client = new DescriptClient({ token: "t" });
  await assert.rejects(
    () => runBatch(client, parseManifest(manifest), { confirm: false }),
    /requires explicit confirmation/
  );
});

test("runBatch executes import then edit then publish per item", async () => {
  installMockFetch([
    { status: 201, json: { job_id: "ij", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "ij", job_type: "import/project_media", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", media_status: {}, media_seconds_used: 1, created_compositions: [{ id: "c", name: "Cut" }] } } },
    { status: 201, json: { job_id: "aj", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "aj", job_type: "agent", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", agent_response: "done", project_changed: true } } },
    { status: 201, json: { job_id: "pj", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "pj", job_type: "publish", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", composition_id: "c", share_url: "https://share/x" } } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const report = await runBatch(client, parseManifest(manifest), { confirm: true, poll: { intervalMs: 1, sleep: async () => {} } });
  assert.equal(report.items[0]!.status, "success");
  assert.equal(report.items[0]!.shareUrl, "https://share/x");
  assert.equal(report.succeeded, 1);
  assert.equal(report.failed, 0);
});

test("parseManifest rejects local file sources (URL-only batch)", () => {
  assert.throws(
    () => parseManifest({ items: [{ name: "x", source: { file: "/a.mp4", content_type: "video/mp4" } }] }),
    /URL-only/
  );
});

test("runBatch reports a failed import without attempting edit or publish", async () => {
  const { calls } = installMockFetch([
    { status: 201, json: { job_id: "ij", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "ij", job_type: "import/project_media", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "error", error_message: "import blew up" } } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const report = await runBatch(client, parseManifest(manifest), { confirm: true, poll: { intervalMs: 1, sleep: async () => {} } });
  assert.equal(report.items[0]!.status, "failed");
  assert.match(report.items[0]!.error ?? "", /import blew up/);
  assert.equal(report.succeeded, 0);
  assert.equal(report.failed, 1);
  assert.equal(calls.length, 2);
});

test("runBatch preserves manifest order in the report under concurrency", async () => {
  installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "import/project_media", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", media_status: {}, media_seconds_used: 1, created_compositions: [] } } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const m = parseManifest({
    concurrency: 2,
    items: [
      { name: "alpha", source: { url: "https://x/a.mp4" }, project_name: "A" },
      { name: "bravo", source: { url: "https://x/b.mp4" }, project_name: "B" }
    ]
  });
  const report = await runBatch(client, m, { confirm: true, poll: { intervalMs: 1, sleep: async () => {} } });
  assert.equal(report.items.length, 2);
  assert.equal(report.items[0]!.name, "alpha");
  assert.equal(report.items[1]!.name, "bravo");
  assert.equal(report.succeeded, 2);
});
