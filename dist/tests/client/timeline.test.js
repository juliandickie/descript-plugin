import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../../src/client/http.js";
import { DescriptClient } from "../../src/client/index.js";
import { DescriptApiError } from "../../src/client/errors.js";
import { exportTimeline, downloadTimelineFile, TimelineDownloadError } from "../../src/client/timeline.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";
afterEach(() => restoreFetch());
const http = () => new HttpClient({ token: "t" });
const SUBMIT = {
    job_id: "j1",
    drive_id: "d1",
    drive_name: "iDD",
    project_id: "88dc66c3-3f2a-4d7e-9b1c-5a6b7c8d9e0f",
    project_url: "https://web.descript.com/88dc66c3",
    format: "edl"
};
test("exportTimeline POSTs the request to /jobs/export/timeline with bearer auth and returns the submit response", async () => {
    const { calls } = installMockFetch([{ status: 201, json: SUBMIT }]);
    const req = { project_id: SUBMIT.project_id, format: "edl" };
    const r = await exportTimeline(http(), req);
    assert.deepEqual(r, SUBMIT);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, "https://descriptapi.com/v1/jobs/export/timeline");
    assert.equal(calls[0].headers["authorization"], "Bearer t");
    assert.equal(calls[0].headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(calls[0].body), { project_id: SUBMIT.project_id, format: "edl" });
});
test("exportTimeline sends every optional field it is given and nothing else", async () => {
    const { calls } = installMockFetch([{ status: 201, json: { ...SUBMIT, format: "premiere" } }]);
    await exportTimeline(http(), {
        project_id: SUBMIT.project_id,
        composition_id: "c1c1c1c1",
        format: "premiere",
        include_markers: false,
        create_track_per_file: true,
        snap_frame_rates: false,
        strip_spaces: true,
        callback_url: "https://hooks.example.com/done"
    });
    assert.deepEqual(JSON.parse(calls[0].body), {
        project_id: SUBMIT.project_id,
        composition_id: "c1c1c1c1",
        format: "premiere",
        include_markers: false,
        create_track_per_file: true,
        snap_frame_rates: false,
        strip_spaces: true,
        callback_url: "https://hooks.example.com/done"
    });
});
test("exportTimeline surfaces an API rejection as a DescriptApiError carrying the body", async () => {
    const body = { error: "bad_request", message: "Invalid request payload input", details: [{ message: "\"folder_id\" must be a valid GUID" }] };
    installMockFetch([{ status: 400, json: body }]);
    await assert.rejects(() => exportTimeline(http(), { project_id: "nope", format: "edl" }), (e) => e instanceof DescriptApiError && e.status === 400 && e.body.details[0].message.includes("folder_id"));
});
test("DescriptClient.exportTimeline delegates to the same endpoint", async () => {
    const { calls } = installMockFetch([{ status: 201, json: SUBMIT }]);
    const c = new DescriptClient({ token: "t" });
    const r = await c.exportTimeline({ project_id: SUBMIT.project_id, format: "aaf", strip_spaces: true });
    assert.equal(r.job_id, "j1");
    assert.equal(new URL(calls[0].url).pathname, "/v1/jobs/export/timeline");
    assert.deepEqual(JSON.parse(calls[0].body), { project_id: SUBMIT.project_id, format: "aaf", strip_spaces: true });
});
test("the export/timeline job status is a member of the JobStatus union and narrows on job_type", () => {
    const status = {
        job_id: "j1", job_type: "export/timeline", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", composition_id: "c1", file_name: "timeline.edl", content_type: "text/plain", download_url: "https://s.example/x", download_url_expires_at: "2026-10-01T00:00:00.000Z" }
    };
    const asUnion = status;
    if (asUnion.job_type === "export/timeline" && asUnion.result?.status === "success") {
        assert.equal(asUnion.result.file_name, "timeline.edl");
        assert.equal(asUnion.result.download_url, "https://s.example/x");
    }
    else {
        assert.fail("job_type export/timeline should narrow to the timeline status");
    }
    const failed = { ...status, result: { status: "error", error_message: "boom" } };
    if (failed.job_type === "export/timeline" && failed.result?.status === "error") {
        assert.equal(failed.result.error_message, "boom");
    }
    else {
        assert.fail("error result should narrow");
    }
});
// ---- downloadTimelineFile: a plain fetch of a signed storage URL ----------
test("downloadTimelineFile fetches the URL with no headers at all, so no bearer token reaches storage", async () => {
    const { calls } = installMockFetch([{ status: 200, text: "TITLE: x\n" }]);
    const bytes = await downloadTimelineFile("https://storage.example.com/t.edl?sig=abc");
    assert.equal(new TextDecoder().decode(bytes), "TITLE: x\n");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://storage.example.com/t.edl?sig=abc");
    assert.equal(calls[0].method, "GET");
    assert.deepEqual(calls[0].headers, {});
});
test("downloadTimelineFile returns binary bytes untouched", async () => {
    const aaf = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0xff, 0x80]);
    installMockFetch([{ status: 200, bytes: aaf }]);
    const bytes = await downloadTimelineFile("https://storage.example.com/t.aaf?sig=abc");
    assert.deepEqual([...bytes], [...aaf]);
});
test("downloadTimelineFile throws a TimelineDownloadError with the status and URL on a non-2xx response", async () => {
    installMockFetch([{ status: 403, text: "<Error>expired</Error>" }]);
    await assert.rejects(() => downloadTimelineFile("https://storage.example.com/t.edl?sig=old"), (e) => e instanceof TimelineDownloadError && e.status === 403 && e.url === "https://storage.example.com/t.edl?sig=old" && /403/.test(e.message));
});
test("downloadTimelineFile wraps a network failure in a TimelineDownloadError with no status", async () => {
    const { mock } = await import("node:test");
    mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });
    await assert.rejects(() => downloadTimelineFile("https://storage.example.com/t.edl?sig=abc"), (e) => e instanceof TimelineDownloadError && e.status === undefined && /fetch failed/.test(e.message) && e.url.includes("storage.example.com"));
});
