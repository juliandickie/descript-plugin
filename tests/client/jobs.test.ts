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

test("listJobs serializes type=agent in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listJobs(http(), { type: "agent" });
  assert.ok(calls[0]!.url.includes("type=agent"), `expected type=agent in URL, got: ${calls[0]!.url}`);
});

test("listJobs serializes type=import/project_media in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listJobs(http(), { type: "import/project_media" });
  assert.ok(calls[0]!.url.includes("type=import"), `expected type=import... in URL, got: ${calls[0]!.url}`);
});

test("listJobs serializes created_after in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listJobs(http(), { created_after: "2026-01-01T00:00:00Z" });
  assert.ok(calls[0]!.url.includes("created_after="), `expected created_after in URL, got: ${calls[0]!.url}`);
});

test("listJobs serializes created_before in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listJobs(http(), { created_before: "2026-05-01T00:00:00Z" });
  assert.ok(calls[0]!.url.includes("created_before="), `expected created_before in URL, got: ${calls[0]!.url}`);
});

test("listJobs serializes cursor in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listJobs(http(), { cursor: "tok-abc" });
  assert.ok(calls[0]!.url.includes("cursor=tok-abc"), `expected cursor in URL, got: ${calls[0]!.url}`);
});

test("listJobs serializes all six query fields together", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listJobs(http(), {
    project_id: "pid-1",
    type: "agent",
    created_after: "2026-01-01T00:00:00Z",
    created_before: "2026-05-01T00:00:00Z",
    limit: 10,
    cursor: "cur-x"
  });
  const url = calls[0]!.url;
  assert.ok(url.includes("project_id=pid-1"), `missing project_id in: ${url}`);
  assert.ok(url.includes("type=agent"), `missing type in: ${url}`);
  assert.ok(url.includes("created_after="), `missing created_after in: ${url}`);
  assert.ok(url.includes("created_before="), `missing created_before in: ${url}`);
  assert.ok(url.includes("limit=10"), `missing limit in: ${url}`);
  assert.ok(url.includes("cursor=cur-x"), `missing cursor in: ${url}`);
});
