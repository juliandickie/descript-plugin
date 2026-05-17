import { test } from "node:test";
import assert from "node:assert/strict";
import type { JobStatus, SubmitJobResponse, ImportRequest } from "../../src/client/types.js";

test("JobStatus discriminates on job_type", () => {
  const job: JobStatus = {
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
  const r: SubmitJobResponse = { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" };
  const req: ImportRequest = {
    project_name: "P",
    add_media: { "demo.mp4": { url: "https://x/y.mp4" } }
  };
  assert.equal(r.job_id, "j");
  assert.ok(req.add_media["demo.mp4"]);
});
