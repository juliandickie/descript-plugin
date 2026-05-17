import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../../src/client/http.js";
import {
  importProjectMedia, agentEditJob, publishJob, listJobs, getJob, cancelJob
} from "../../src/client/jobs.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());

const http = () => new HttpClient({ token: "t" });

test("importProjectMedia POSTs to /jobs/import/project_media", async () => {
  const { calls } = installMockFetch([{ status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } }]);
  const res = await importProjectMedia(http(), { project_name: "P", add_media: { "a.mp4": { url: "https://x/a.mp4" } } });
  assert.equal(res.job_id, "j");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/jobs/import/project_media");
  assert.equal(calls[0]!.method, "POST");
});

test("agentEditJob POSTs the prompt", async () => {
  const { calls } = installMockFetch([{ status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } }]);
  await agentEditJob(http(), { project_id: "p", prompt: "add captions" });
  assert.deepEqual(JSON.parse(calls[0]!.body!), { project_id: "p", prompt: "add captions" });
});

test("publishJob POSTs to /jobs/publish", async () => {
  const { calls } = installMockFetch([{ status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } }]);
  await publishJob(http(), { project_id: "p", media_type: "Video", resolution: "1080p" });
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/jobs/publish");
});

test("listJobs passes query params", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listJobs(http(), { project_id: "p1", limit: 50 });
  assert.ok(calls[0]!.url.includes("project_id=p1"));
  assert.ok(calls[0]!.url.includes("limit=50"));
});

test("getJob GETs /jobs/{id}", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { job_id: "j1", job_type: "agent", job_state: "stopped", created_at: "x", drive_id: "d", project_id: "p", project_url: "u" } }]);
  const job = await getJob(http(), "j1");
  assert.equal(job.job_id, "j1");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/jobs/j1");
});

test("cancelJob DELETEs and resolves on 204", async () => {
  const { calls } = installMockFetch([{ status: 204, text: "" }]);
  await cancelJob(http(), "j1");
  assert.equal(calls[0]!.method, "DELETE");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/jobs/j1");
});
