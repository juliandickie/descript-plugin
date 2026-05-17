import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../../src/client/http.js";
import { DescriptApiError } from "../../src/client/errors.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());

test("sends bearer auth and parses JSON", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { status: "ok" } }]);
  const http = new HttpClient({ token: "secret-token" });
  const res = await http.request<{ status: string }>("GET", "/status");
  assert.equal(res.status, "ok");
  assert.equal(calls[0]!.headers["authorization"], "Bearer secret-token");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/status");
});

test("builds query strings and request bodies", async () => {
  const { calls } = installMockFetch([{ status: 201, json: { job_id: "j" } }]);
  const http = new HttpClient({ token: "t" });
  await http.request("POST", "/jobs/agent", { query: { project_id: "p1" }, body: { prompt: "hi" } });
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/jobs/agent?project_id=p1");
  assert.equal(calls[0]!.method, "POST");
  assert.deepEqual(JSON.parse(calls[0]!.body!), { prompt: "hi" });
});

test("maps error status to DescriptApiError", async () => {
  installMockFetch([{ status: 401, json: { error: "unauthorized", message: "bad token" } }]);
  const http = new HttpClient({ token: "t" });
  await assert.rejects(
    () => http.request("GET", "/status"),
    (e: unknown) => e instanceof DescriptApiError && e.status === 401 && e.category === "unauthorized"
  );
});

test("retries 429 honoring Retry-After then succeeds", async () => {
  const { calls } = installMockFetch([
    { status: 429, json: { error: "rate_limit_exceeded", message: "slow" }, headers: { "retry-after": "0" } },
    { status: 200, json: { status: "ok" } }
  ]);
  const http = new HttpClient({ token: "t", maxRetries: 3, sleep: async () => {} });
  const res = await http.request<{ status: string }>("GET", "/status");
  assert.equal(res.status, "ok");
  assert.equal(calls.length, 2);
});

test("gives up after maxRetries on persistent 429", async () => {
  // single spec repeats via sequence clamping in the mock
  const { calls } = installMockFetch([{ status: 429, json: { error: "rate_limit_exceeded", message: "slow" }, headers: { "retry-after": "0" } }]);
  const http = new HttpClient({ token: "t", maxRetries: 2, sleep: async () => {} });
  await assert.rejects(
    () => http.request("GET", "/status"),
    (e: unknown) => e instanceof DescriptApiError && e.status === 429 && e.retryAfterSeconds === 0
  );
  assert.equal(calls.length, 3);
});

test("returns undefined for 204 No Content", async () => {
  installMockFetch([{ status: 204, text: "" }]);
  const http = new HttpClient({ token: "t" });
  const res = await http.request<undefined>("DELETE", "/jobs/j1");
  assert.equal(res, undefined);
});
