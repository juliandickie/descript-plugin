import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../../src/client/http.js";
import { listProjects, getProject } from "../../src/client/projects.js";
import { getStatus } from "../../src/client/status.js";
import { getPublishedProjectMetadata } from "../../src/client/published.js";
import { postEditInDescriptSchema } from "../../src/client/editInDescript.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());
const http = () => new HttpClient({ token: "t" });

test("listProjects GETs /projects with paging", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: { next_cursor: "c2" } } }]);
  const res = await listProjects(http(), { cursor: "c1", limit: 10 });
  assert.equal(res.pagination.next_cursor, "c2");
  assert.ok(calls[0]!.url.includes("cursor=c1"));
});

test("getProject GETs /projects/{id}", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { id: "p1", name: "X", drive_id: "d", created_at: "a", updated_at: "b", media_files: {}, compositions: [] } }]);
  const p = await getProject(http(), "p1");
  assert.equal(p.id, "p1");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/projects/p1");
});

test("getStatus GETs /status", async () => {
  installMockFetch([{ status: 200, json: { status: "ok" } }]);
  assert.deepEqual(await getStatus(http()), { status: "ok" });
});

test("getPublishedProjectMetadata GETs /published_projects/{slug}", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { project_id: "p", publish_type: "video", privacy: "unlisted", metadata: {}, subtitles: "WEBVTT" } }]);
  const m = await getPublishedProjectMetadata(http(), "my slug");
  assert.equal(m.publish_type, "video");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/published_projects/my%20slug");
});

test("postEditInDescriptSchema POSTs the schema", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { url: "https://web.descript.com/import?nonce=x" } }]);
  const r = await postEditInDescriptSchema(http(), { partner_drive_id: "d", project_schema: { schema_version: "1.0.0", files: [{ uri: "https://x/a.wav" }] } });
  assert.match(r.url ?? "", /nonce=x/);
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/edit_in_descript/schema");
});

test("listProjects serializes name filter in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listProjects(http(), { name: "my project" });
  assert.ok(calls[0]!.url.includes("name="), "expected name param: " + calls[0]!.url);
});

test("listProjects serializes folder_path filter in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listProjects(http(), { folder_path: "Clients/Acme" });
  assert.ok(calls[0]!.url.includes("folder_path="), "expected folder_path param: " + calls[0]!.url);
});

test("listProjects serializes created_by filter in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listProjects(http(), { created_by: "me" });
  assert.ok(calls[0]!.url.includes("created_by=me"), "expected created_by=me: " + calls[0]!.url);
});

test("listProjects serializes created_after filter in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listProjects(http(), { created_after: "2024-01-01T00:00:00Z" });
  assert.ok(calls[0]!.url.includes("created_after="), "expected created_after param: " + calls[0]!.url);
});

test("listProjects serializes created_before filter in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listProjects(http(), { created_before: "2024-12-31T23:59:59Z" });
  assert.ok(calls[0]!.url.includes("created_before="), "expected created_before param: " + calls[0]!.url);
});

test("listProjects serializes updated_after filter in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listProjects(http(), { updated_after: "2024-06-01T00:00:00Z" });
  assert.ok(calls[0]!.url.includes("updated_after="), "expected updated_after param: " + calls[0]!.url);
});

test("listProjects serializes updated_before filter in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listProjects(http(), { updated_before: "2024-06-30T23:59:59Z" });
  assert.ok(calls[0]!.url.includes("updated_before="), "expected updated_before param: " + calls[0]!.url);
});

test("listProjects serializes sort and direction in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listProjects(http(), { sort: "updated_at", direction: "asc" });
  assert.ok(calls[0]!.url.includes("sort=updated_at"), "expected sort=updated_at: " + calls[0]!.url);
  assert.ok(calls[0]!.url.includes("direction=asc"), "expected direction=asc: " + calls[0]!.url);
});

test("listProjects serializes limit in query string", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listProjects(http(), { limit: 50 });
  assert.ok(calls[0]!.url.includes("limit=50"), "expected limit=50: " + calls[0]!.url);
});

test("listProjects serializes all filters together", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listProjects(http(), { name: "foo", sort: "updated_at", direction: "asc", limit: 50 });
  assert.ok(calls[0]!.url.includes("name=foo"), "expected name=foo: " + calls[0]!.url);
  assert.ok(calls[0]!.url.includes("sort=updated_at"), "expected sort=updated_at: " + calls[0]!.url);
  assert.ok(calls[0]!.url.includes("direction=asc"), "expected direction=asc: " + calls[0]!.url);
  assert.ok(calls[0]!.url.includes("limit=50"), "expected limit=50: " + calls[0]!.url);
});
