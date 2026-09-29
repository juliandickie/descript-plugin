import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DescriptClient } from "../../src/client/index.js";
import { directUpload, mediaRefForFile, mediaRefForUrl } from "../../src/workflows/upload.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";
afterEach(() => restoreFetch());
function tmpFile(bytes) {
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
    assert.equal(calls[0].url, "https://descriptapi.com/v1/jobs/import/project_media");
    assert.equal(calls[1].method, "PUT");
    assert.equal(calls[1].url, "https://gcs/signed");
    assert.equal(calls[1].headers["content-type"], "application/octet-stream");
    assert.equal(calls[1].headers["content-length"], "2048");
    rmSync(dir, { recursive: true, force: true });
});
test("throws when the API returns no upload_urls for the media ref", async () => {
    const { path, dir } = tmpFile(16);
    installMockFetch([{ status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } }]);
    const client = new DescriptClient({ token: "t" });
    await assert.rejects(() => directUpload(client, { mediaRef: "clip.mp4", filePath: path, contentType: "video/mp4", request: { project_name: "P", add_media: {} } }), /no signed upload URL/i);
    rmSync(dir, { recursive: true, force: true });
});
test("directUpload submits through the function it is given and returns that response", async () => {
    const { path, dir } = tmpFile(512);
    const { calls } = installMockFetch([
        { status: 201, json: { job_id: "dj", drive_id: "d", upload_urls: { "clip.mp4": { upload_url: "https://gcs/signed", asset_id: "a", artifact_id: "b" } } } },
        { status: 200, text: "" }
    ]);
    const client = new DescriptClient({ token: "t" });
    const res = await directUpload(client, { mediaRef: "clip.mp4", filePath: path, contentType: "video/mp4", language: "es", request: { add_media: {}, folder_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" } }, (req) => client.importDriveMedia(req));
    assert.equal(res.job_id, "dj");
    assert.equal(calls[0].url, "https://descriptapi.com/v1/jobs/import/drive_media");
    assert.deepEqual(JSON.parse(calls[0].body), {
        folder_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        add_media: { "clip.mp4": { content_type: "video/mp4", file_size: 512, language: "es" } }
    });
    assert.equal(calls[1].method, "PUT");
    assert.equal(calls[1].url, "https://gcs/signed");
    rmSync(dir, { recursive: true, force: true });
});
test("directUpload with a custom submit still throws when no signed URL comes back", async () => {
    const { path, dir } = tmpFile(16);
    installMockFetch([{ status: 201, json: { job_id: "dj", drive_id: "d" } }]);
    const client = new DescriptClient({ token: "t" });
    await assert.rejects(() => directUpload(client, { mediaRef: "clip.mp4", filePath: path, contentType: "video/mp4", request: { add_media: {} } }, (req) => client.importDriveMedia(req)), /no signed upload URL/i);
    rmSync(dir, { recursive: true, force: true });
});
test("mediaRefForFile keeps the extension and replaces unsafe characters", () => {
    assert.equal(mediaRefForFile("/tmp/L1-02 - Course 1 (Single Unit) Crowns.m4a"), "L1-02---Course-1-Single-Unit-Crowns.m4a");
    assert.equal(mediaRefForFile("clip.mp4"), "clip.mp4");
});
test("mediaRefForUrl takes the last path segment of a plain URL", () => {
    assert.equal(mediaRefForUrl("https://cdn.example.com/media/interview.mp4"), "interview.mp4");
    assert.equal(mediaRefForUrl("http://x/a.mp4"), "a.mp4");
});
test("mediaRefForUrl ignores the query string and fragment of a signed URL", () => {
    assert.equal(mediaRefForUrl("https://storage.example.com/bucket/Session%20One.wav?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123#t=5"), "Session-One.wav");
});
test("mediaRefForUrl percent-decodes the segment and replaces unsafe characters", () => {
    assert.equal(mediaRefForUrl("https://x.test/My%20Great%20Clip%20%28final%29.mov"), "My-Great-Clip-final-.mov");
    assert.equal(mediaRefForUrl("https://x.test/caf%C3%A9.mp3"), "caf-.mp3");
    // A malformed escape must not throw; the raw segment is sanitised instead.
    assert.equal(mediaRefForUrl("https://x.test/bad%E0%A4%A.mp4"), "bad-E0-A4-A.mp4");
});
test("mediaRefForUrl falls back to media.0 when the segment has no extension", () => {
    assert.equal(mediaRefForUrl("https://x.test/download/12345"), "media.0");
    assert.equal(mediaRefForUrl("https://x.test/"), "media.0");
    assert.equal(mediaRefForUrl("https://x.test"), "media.0");
    assert.equal(mediaRefForUrl("https://x.test/v1/file.toolongext"), "media.0");
    assert.equal(mediaRefForUrl("https://x.test/name."), "media.0");
});
test("mediaRefForUrl falls back to media.0 for a trailing slash, even after a file-like segment", () => {
    assert.equal(mediaRefForUrl("https://x.test/media/"), "media.0");
    assert.equal(mediaRefForUrl("https://x.test/media/clip.mp4/"), "media.0");
});
test("mediaRefForUrl falls back to media.0 for a URL that does not parse", () => {
    assert.equal(mediaRefForUrl("not a url"), "media.0");
    assert.equal(mediaRefForUrl(""), "media.0");
    assert.equal(mediaRefForUrl("/relative/clip.mp4"), "media.0");
});
test("mediaRefForUrl keeps a 1 to 5 character extension, whatever its case", () => {
    assert.equal(mediaRefForUrl("https://x.test/a.m4a"), "a.m4a");
    assert.equal(mediaRefForUrl("https://x.test/A.MP4"), "A.MP4");
    assert.equal(mediaRefForUrl("https://x.test/a.webm"), "a.webm");
    assert.equal(mediaRefForUrl("https://x.test/archive.tar.gz"), "archive.tar.gz");
});
