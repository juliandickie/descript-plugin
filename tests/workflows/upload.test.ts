import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DescriptClient } from "../../src/client/index.js";
import { directUpload } from "../../src/workflows/upload.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());

function tmpFile(bytes: number): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "descript-up-"));
  const path = join(dir, "clip.mp4");
  writeFileSync(path, Buffer.alloc(bytes, 1));
  return { path, dir };
}

test("requests signed URL, PUTs the bytes, returns submit response", async () => {
  const { path, dir } = tmpFile(2048);
  const { calls } = installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u",
      upload_urls: { "clip.mp4": { upload_url: "https://gcs/signed", asset_id: "a", artifact_id: "b" } } } },
    { status: 200, text: "" }
  ]);
  const client = new DescriptClient({ token: "t" });
  const res = await directUpload(client, {
    mediaRef: "clip.mp4",
    filePath: path,
    contentType: "video/mp4",
    request: { project_name: "P", add_media: {} }
  });
  assert.equal(res.job_id, "j");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/jobs/import/project_media");
  assert.equal(calls[1]!.method, "PUT");
  assert.equal(calls[1]!.url, "https://gcs/signed");
  assert.equal(calls[1]!.headers["content-type"], "application/octet-stream");
  assert.equal(calls[1]!.headers["content-length"], "2048");
  rmSync(dir, { recursive: true, force: true });
});

test("throws when the API returns no upload_urls for the media ref", async () => {
  const { path, dir } = tmpFile(16);
  installMockFetch([{ status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } }]);
  const client = new DescriptClient({ token: "t" });
  await assert.rejects(
    () => directUpload(client, { mediaRef: "clip.mp4", filePath: path, contentType: "video/mp4", request: { project_name: "P", add_media: {} } }),
    /no signed upload URL/i
  );
  rmSync(dir, { recursive: true, force: true });
});
