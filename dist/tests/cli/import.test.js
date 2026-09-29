import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli/index.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";
afterEach(() => restoreFetch());
// =========================================================================
// descript import - into an existing project, appended to a composition
// (update_compositions), and into the drive media library (--library).
// =========================================================================
const ENV = { DESCRIPT_API_TOKEN: "t" };
const FAST_POLL = { intervalMs: 1, maxIntervalMs: 1, sleep: async () => { } };
const PROJECT_URL = "https://web.descript.com/proj-1";
const FOLDER_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const IMPORT_URL = "https://descriptapi.com/v1/jobs/import/project_media";
const DRIVE_URL = "https://descriptapi.com/v1/jobs/import/drive_media";
async function run(argv) {
    const out = [];
    const err = [];
    const code = await runCli(argv, { env: ENV, stdout: (s) => out.push(s), stderr: (s) => err.push(s), poll: FAST_POLL });
    return { code, out: out.join(""), err: err.join("") };
}
function tmpFile(name, bytes) {
    const dir = mkdtempSync(join(tmpdir(), "descript-import-"));
    const path = join(dir, name);
    writeFileSync(path, Buffer.alloc(bytes, 1));
    return { path, dir };
}
const projectSubmit = { status: 201, json: { job_id: "j", drive_id: "d", project_id: "proj-1", project_url: PROJECT_URL } };
const projectUploadSubmit = (ref) => ({ status: 201, json: {
        job_id: "j", drive_id: "d", project_id: "proj-1", project_url: PROJECT_URL,
        upload_urls: { [ref]: { upload_url: "https://gcs.example/signed", asset_id: "a", artifact_id: "b" } }
    } });
const projectDone = { status: 200, json: { job_id: "j", job_type: "import/project_media", job_state: "stopped", created_at: "t",
        drive_id: "d", project_id: "proj-1", project_url: PROJECT_URL,
        result: { status: "success", media_status: {}, media_seconds_used: 3 } } };
const put200 = { status: 200, text: "" };
// The drive media library submit response carries no project fields, and the job
// result shape has never been observed, so these fixtures leave them out or vary them.
const driveSubmit = { status: 201, json: { job_id: "j", drive_id: "d" } };
const driveUploadSubmit = (ref) => ({ status: 201, json: {
        job_id: "j", drive_id: "d",
        upload_urls: { [ref]: { upload_url: "https://gcs.example/signed", asset_id: "a", artifact_id: "b" } }
    } });
const driveJob = (result) => ({ status: 200, json: { job_id: "j", job_type: "import/drive_media", job_state: "stopped",
        created_at: "t", drive_id: "d", ...(result === undefined ? {} : { result }) } });
// -------------------------------------------------------------------------
// D1 - URL references for existing-project imports
// -------------------------------------------------------------------------
test("import --project-id --url uses the URL's file name as the media reference", async () => {
    const { calls } = installMockFetch([projectSubmit]);
    const r = await run(["import", "--project-id", "proj-1", "--url", "https://cdn.example/audio/Take%201.m4a?sig=abc", "--no-wait", "--json"]);
    assert.equal(r.code, 0, r.err);
    const body = JSON.parse(calls[0].body);
    assert.deepEqual(body, { project_id: "proj-1", add_media: { "Take-1.m4a": { url: "https://cdn.example/audio/Take%201.m4a?sig=abc" } } });
});
test("import --project-id --url falls back to media.0 when the URL has no file extension", async () => {
    const { calls } = installMockFetch([projectSubmit]);
    const r = await run(["import", "--project-id", "proj-1", "--url", "https://cdn.example/download/12345", "--no-wait", "--json"]);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(Object.keys(JSON.parse(calls[0].body).add_media), ["media.0"]);
});
test("two URL imports into the same project no longer collide on one media reference", async () => {
    const { calls } = installMockFetch([projectSubmit]);
    await run(["import", "--project-id", "proj-1", "--url", "https://cdn.example/one.mp4", "--no-wait", "--json"]);
    await run(["import", "--project-id", "proj-1", "--url", "https://cdn.example/two.mp4", "--no-wait", "--json"]);
    assert.deepEqual(Object.keys(JSON.parse(calls[0].body).add_media), ["one.mp4"]);
    assert.deepEqual(Object.keys(JSON.parse(calls[1].body).add_media), ["two.mp4"]);
});
test("a new-project import --url keeps media.0 as the reference, unchanged", async () => {
    const { calls } = installMockFetch([projectSubmit]);
    const r = await run(["import", "--url", "https://cdn.example/interview.mp4", "--name", "P", "--no-wait", "--json"]);
    assert.equal(r.code, 0, r.err);
    const body = JSON.parse(calls[0].body);
    assert.deepEqual(Object.keys(body.add_media), ["media.0"]);
    assert.deepEqual(body.add_compositions, [{ name: "P", clips: [{ media: "media.0" }] }]);
});
// -------------------------------------------------------------------------
// D2 - import --file into an existing project
// -------------------------------------------------------------------------
test("import --project-id --file uploads into the existing project, PUTs the bytes and polls the job", async () => {
    const { path, dir } = tmpFile("Session 4 (final).m4a", 128);
    try {
        const ref = "Session-4-final-.m4a";
        const { calls } = installMockFetch([projectUploadSubmit(ref), put200, projectDone]);
        const r = await run(["import", "--project-id", "proj-1", "--file", path, "--content-type", "audio/mp4", "--language", "es", "--callback-url", "https://hook.example/cb"]);
        assert.equal(r.code, 0, r.err);
        assert.equal(calls.length, 3);
        assert.equal(calls[0].url, IMPORT_URL);
        assert.deepEqual(JSON.parse(calls[0].body), {
            project_id: "proj-1",
            add_media: { [ref]: { content_type: "audio/mp4", file_size: 128, language: "es" } },
            callback_url: "https://hook.example/cb"
        });
        assert.equal(calls[1].method, "PUT");
        assert.equal(calls[1].url, "https://gcs.example/signed");
        assert.equal(calls[1].headers["content-length"], "128");
        assert.equal(calls[2].method, "GET");
        assert.equal(calls[2].url, "https://descriptapi.com/v1/jobs/j");
        assert.equal(r.out, `Imported into ${PROJECT_URL}\n`);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("import --project-id --file --no-wait submits and uploads without polling", async () => {
    const { path, dir } = tmpFile("clip.mp4", 64);
    try {
        const { calls } = installMockFetch([projectUploadSubmit("clip.mp4"), put200]);
        const r = await run(["import", "--project-id", "proj-1", "--file", path, "--no-wait", "--json"]);
        assert.equal(r.code, 0, r.err);
        assert.equal(calls.length, 2);
        assert.equal(JSON.parse(r.out).job_id, "j");
        const body = JSON.parse(calls[0].body);
        assert.equal(body.project_id, "proj-1");
        assert.equal(body.project_name, undefined);
        assert.equal(body.add_compositions, undefined);
        assert.equal(body.update_compositions, undefined);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("import --project-id --file keeps the workspace check and still rejects --workspace", async () => {
    const { calls } = installMockFetch([projectSubmit]);
    const r = await run(["import", "--project-id", "proj-1", "--file", "/nonexistent/clip.mp4", "--workspace", "General"]);
    assert.equal(r.code, 2);
    assert.equal(calls.length, 0);
    assert.match(r.err, /--workspace only applies when creating a new project/);
});
// -------------------------------------------------------------------------
// D2 - append to a composition
// -------------------------------------------------------------------------
test("import --project-id --composition-id --url appends the imported clip to that composition", async () => {
    const { calls } = installMockFetch([projectSubmit]);
    const r = await run(["import", "--project-id", "proj-1", "--composition-id", "b65d1", "--url", "https://cdn.example/outro.mp4", "--language", "en", "--no-wait", "--json"]);
    assert.equal(r.code, 0, r.err);
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0].body), {
        project_id: "proj-1",
        add_media: { "outro.mp4": { url: "https://cdn.example/outro.mp4", language: "en" } },
        update_compositions: [{ composition_id: "b65d1", append_clips: [{ media: "outro.mp4" }] }]
    });
});
test("--composition-id passes a UUID, a short id and a project URL through unchanged", async () => {
    for (const cid of ["9a4a3f1e-6f0c-4c62-8a8e-5f3c9f7a1d20", "b65d1", "https://web.descript.com/proj-1/b65d1"]) {
        const { calls } = installMockFetch([projectSubmit]);
        const r = await run(["import", "--project-id", "proj-1", "--composition-id", cid, "--url", "https://cdn.example/x.mp4", "--no-wait", "--json"]);
        assert.equal(r.code, 0, `${cid}: ${r.err}`);
        assert.equal(JSON.parse(calls[0].body).update_compositions[0].composition_id, cid);
        restoreFetch();
    }
});
test("import --project-id --composition-id --file appends the uploaded clip by its media reference", async () => {
    const { path, dir } = tmpFile("Intro Cut.mov", 32);
    try {
        const ref = "Intro-Cut.mov";
        const { calls } = installMockFetch([projectUploadSubmit(ref), put200, projectDone]);
        const r = await run(["import", "--project-id", "proj-1", "--composition-id", "b65d1", "--file", path, "--content-type", "video/quicktime"]);
        assert.equal(r.code, 0, r.err);
        assert.deepEqual(JSON.parse(calls[0].body), {
            project_id: "proj-1",
            add_media: { [ref]: { content_type: "video/quicktime", file_size: 32 } },
            update_compositions: [{ composition_id: "b65d1", append_clips: [{ media: ref }] }]
        });
        assert.equal(calls[1].method, "PUT");
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("an append names the composition in the human output and keeps --json as the normalised result", async () => {
    installMockFetch([projectSubmit, projectDone]);
    const human = await run(["import", "--project-id", "proj-1", "--composition-id", "b65d1", "--url", "https://cdn.example/outro.mp4"]);
    assert.equal(human.code, 0, human.err);
    assert.equal(human.out, `Imported into ${PROJECT_URL} and appended to composition b65d1\n`);
    restoreFetch();
    installMockFetch([projectSubmit, projectDone]);
    const json = await run(["import", "--project-id", "proj-1", "--composition-id", "b65d1", "--url", "https://cdn.example/outro.mp4", "--json"]);
    const parsed = JSON.parse(json.out);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.projectUrl, PROJECT_URL);
    assert.equal(parsed.mediaSecondsUsed, 3);
});
test("a failed append reports the job error and exits 4", async () => {
    installMockFetch([projectSubmit, { status: 200, json: { job_id: "j", job_type: "import/project_media", job_state: "stopped", created_at: "t",
                drive_id: "d", project_id: "proj-1", project_url: PROJECT_URL, result: { status: "error", error_message: "composition not found" } } }]);
    const r = await run(["import", "--project-id", "proj-1", "--composition-id", "nope1", "--url", "https://cdn.example/outro.mp4"]);
    assert.equal(r.code, 4);
    assert.match(r.out, /Import failed: composition not found/);
});
test("import --project-id --update-compositions --media sends the raw update_compositions as given", async () => {
    const { calls } = installMockFetch([projectSubmit, projectDone]);
    const update = [{ composition_id: "b65d1", append_clips: [{ media: "a.mp4" }, { media: "b.mp4", mute: true }] }, { composition_id: "c77e2", append_clips: [{ media: "b.mp4" }] }];
    const media = { "a.mp4": { url: "https://cdn.example/a.mp4" }, "b.mp4": { url: "https://cdn.example/b.mp4" } };
    const r = await run(["import", "--project-id", "proj-1", "--media", JSON.stringify(media), "--update-compositions", JSON.stringify(update)]);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(JSON.parse(calls[0].body), { project_id: "proj-1", add_media: media, update_compositions: update });
    assert.equal(r.out, `Imported into ${PROJECT_URL} and appended to compositions b65d1, c77e2\n`);
});
test("import --project-id --media without --update-compositions is unchanged", async () => {
    const { calls } = installMockFetch([projectSubmit]);
    const media = { "a.mp4": { url: "https://cdn.example/a.mp4" } };
    const r = await run(["import", "--project-id", "proj-1", "--media", JSON.stringify(media), "--no-wait", "--json"]);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(JSON.parse(calls[0].body), { project_id: "proj-1", add_media: media });
});
test("append and existing-project usage errors exit 2 with no API call", async () => {
    const media = JSON.stringify({ "a.mp4": { url: "https://cdn.example/a.mp4" } });
    const update = JSON.stringify([{ composition_id: "b65d1", append_clips: [{ media: "a.mp4" }] }]);
    const cases = [
        { argv: ["--composition-id", "b65d1", "--url", "https://cdn.example/a.mp4"], message: /--composition-id needs --project-id/ },
        { argv: ["--update-compositions", update, "--media", media], message: /--update-compositions needs --project-id/ },
        { argv: ["--project-id", "p", "--composition-id", "b65d1", "--update-compositions", update, "--media", media], message: /--composition-id and --update-compositions cannot be combined/ },
        { argv: ["--project-id", "p", "--composition-id", "b65d1", "--media", media], message: /--composition-id works with --url or --file, not --media/ },
        { argv: ["--project-id", "p", "--update-compositions", update, "--url", "https://cdn.example/a.mp4"], message: /--update-compositions works with --media only/ },
        { argv: ["--project-id", "p", "--update-compositions", update, "--file", "/nonexistent/a.mp4"], message: /--update-compositions works with --media only/ },
        { argv: ["--project-id", "p", "--media", media, "--update-compositions", "{not json"], message: /--update-compositions must be valid JSON \(an array/ },
        { argv: ["--project-id", "p", "--media", media, "--update-compositions", "{}"], message: /--update-compositions must be valid JSON \(an array/ },
        { argv: ["--project-id", "p", "--composition-id", "--url", "https://cdn.example/a.mp4"], message: /--composition-id needs a value/ },
        { argv: ["--project-id", "p", "--url", "https://cdn.example/a.mp4", "--file", "/nonexistent/a.mp4"], message: /only one of --url, --file or --media/ },
        { argv: ["--project-id", "p"], message: /--url or --media <json> \(or --file <path>\)/ }
    ];
    for (const c of cases) {
        const { calls } = installMockFetch([projectSubmit]);
        const r = await run(["import", "--no-wait", "--json", ...c.argv]);
        assert.equal(r.code, 2, c.argv.join(" "));
        assert.equal(calls.length, 0, c.argv.join(" "));
        assert.match(r.err, c.message, c.argv.join(" "));
        restoreFetch();
    }
});
// -------------------------------------------------------------------------
// D3 - drive media library import
// -------------------------------------------------------------------------
test("import --library --url posts add_media to /jobs/import/drive_media and nothing project-shaped", async () => {
    const { calls } = installMockFetch([driveSubmit]);
    const r = await run(["import", "--library", "--url", "https://cdn.example/a/Interview%20Final.mp4?sig=1", "--no-wait", "--json"]);
    assert.equal(r.code, 0, r.err);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, DRIVE_URL);
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(JSON.parse(calls[0].body), { add_media: { "Interview-Final.mp4": { url: "https://cdn.example/a/Interview%20Final.mp4?sig=1" } } });
});
test("import --library --url passes --folder-id, --language and --callback-url", async () => {
    const { calls } = installMockFetch([driveSubmit]);
    const r = await run(["import", "--library", "--url", "https://cdn.example/a.mp4", "--folder-id", FOLDER_ID, "--language", "fr", "--callback-url", "https://hook.example/cb", "--no-wait", "--json"]);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(JSON.parse(calls[0].body), {
        add_media: { "a.mp4": { url: "https://cdn.example/a.mp4", language: "fr" } },
        folder_id: FOLDER_ID,
        callback_url: "https://hook.example/cb"
    });
});
test("import --library --url falls back to media.0 for an extensionless URL", async () => {
    const { calls } = installMockFetch([driveSubmit]);
    await run(["import", "--library", "--url", "https://cdn.example/stream/9981/", "--no-wait", "--json"]);
    assert.deepEqual(Object.keys(JSON.parse(calls[0].body).add_media), ["media.0"]);
});
test("import --library --file requests a signed URL from the drive endpoint, PUTs the bytes and polls", async () => {
    const { path, dir } = tmpFile("Lecture 1.mp3", 256);
    try {
        const ref = "Lecture-1.mp3";
        const { calls } = installMockFetch([driveUploadSubmit(ref), put200, driveJob({ status: "success", media_status: { [ref]: { status: "success", duration_seconds: 61 } }, media_seconds_used: 61 })]);
        const r = await run(["import", "--library", "--file", path, "--content-type", "audio/mpeg", "--language", "de", "--folder-id", FOLDER_ID]);
        assert.equal(r.code, 0, r.err);
        assert.equal(calls.length, 3);
        assert.equal(calls[0].url, DRIVE_URL);
        assert.deepEqual(JSON.parse(calls[0].body), {
            add_media: { [ref]: { content_type: "audio/mpeg", file_size: 256, language: "de" } },
            folder_id: FOLDER_ID
        });
        assert.equal(calls[1].method, "PUT");
        assert.equal(calls[1].url, "https://gcs.example/signed");
        assert.equal(calls[1].headers["content-length"], "256");
        assert.equal(calls[2].method, "GET");
        assert.equal(calls[2].url, "https://descriptapi.com/v1/jobs/j");
        assert.equal(r.out, `Imported 1 file(s) into the drive media library (folder ${FOLDER_ID})\n`);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("import --library --file --no-wait submits and uploads only", async () => {
    const { path, dir } = tmpFile("clip.mp4", 40);
    try {
        const { calls } = installMockFetch([driveUploadSubmit("clip.mp4"), put200]);
        const r = await run(["import", "--library", "--file", path, "--no-wait", "--json"]);
        assert.equal(r.code, 0, r.err);
        assert.equal(calls.length, 2);
        assert.deepEqual(JSON.parse(calls[0].body), { add_media: { "clip.mp4": { content_type: "video/mp4", file_size: 40 } } });
        assert.equal(JSON.parse(r.out).job_id, "j");
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("import --library --media sends the add_media map as given, folder paths in the keys included", async () => {
    const { calls } = installMockFetch([driveSubmit, driveJob({ status: "success" })]);
    const media = { "Course 1/intro.mp4": { url: "https://cdn.example/intro.mp4" }, "b-roll.mov": { url: "https://cdn.example/b.mov", language: "en" } };
    const r = await run(["import", "--library", "--media", JSON.stringify(media)]);
    assert.equal(r.code, 0, r.err);
    assert.deepEqual(JSON.parse(calls[0].body), { add_media: media });
    assert.equal(r.out, "Imported 2 file(s) into the drive media library\n");
});
test("import --library --no-wait prints the submit response and never polls", async () => {
    const { calls } = installMockFetch([driveSubmit]);
    const human = await run(["import", "--library", "--url", "https://cdn.example/a.mp4", "--no-wait"]);
    assert.equal(human.code, 0, human.err);
    assert.equal(human.out, "Submitted library import job j\n");
    assert.equal(calls.length, 1);
    restoreFetch();
    installMockFetch([driveSubmit]);
    const json = await run(["import", "--library", "--url", "https://cdn.example/a.mp4", "--no-wait", "--json"]);
    assert.deepEqual(JSON.parse(json.out), { job_id: "j", drive_id: "d" });
});
test("a successful library import reports ok in --json, with media status and the raw result", async () => {
    const result = { status: "success", media_status: { "a.mp4": { status: "success", duration_seconds: 12 } }, media_seconds_used: 12 };
    installMockFetch([driveSubmit, driveJob(result)]);
    const r = await run(["import", "--library", "--url", "https://cdn.example/a.mp4", "--json"]);
    assert.equal(r.code, 0, r.err);
    const parsed = JSON.parse(r.out);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.jobId, "j");
    assert.equal(parsed.driveId, "d");
    assert.equal(parsed.status, "success");
    assert.deepEqual(parsed.mediaStatus, result.media_status);
    assert.equal(parsed.mediaSecondsUsed, 12);
    assert.equal(parsed.error, undefined);
    assert.deepEqual(parsed.result, result);
});
test("a library job that reports only a success status still counts as imported", async () => {
    installMockFetch([driveSubmit, driveJob({ status: "success" })]);
    const r = await run(["import", "--library", "--url", "https://cdn.example/a.mp4", "--json"]);
    assert.equal(r.code, 0, r.err);
    const parsed = JSON.parse(r.out);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.mediaStatus, undefined);
});
test("a failed library import prints Library import failed, exits 4 and keeps the raw result in --json", async () => {
    const result = { status: "error", error_message: "Not enough media minutes", error_code: "quota" };
    installMockFetch([driveSubmit, driveJob(result)]);
    const human = await run(["import", "--library", "--url", "https://cdn.example/a.mp4"]);
    assert.equal(human.code, 4);
    assert.equal(human.out, "Library import failed: Not enough media minutes\n");
    restoreFetch();
    installMockFetch([driveSubmit, driveJob(result)]);
    const json = await run(["import", "--library", "--url", "https://cdn.example/a.mp4", "--json"]);
    assert.equal(json.code, 4);
    const parsed = JSON.parse(json.out);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, "error");
    assert.equal(parsed.error, "Not enough media minutes");
    assert.deepEqual(parsed.result, result);
});
test("a library job that stopped without a result, or with a failed file, is an error and names what failed", async () => {
    installMockFetch([driveSubmit, driveJob()]);
    const none = await run(["import", "--library", "--url", "https://cdn.example/a.mp4"]);
    assert.equal(none.code, 4);
    assert.match(none.out, /Library import failed: Job stopped without a result/);
    restoreFetch();
    installMockFetch([driveSubmit, driveJob({ status: "partial", media_status: { "a.mp4": { status: "success" }, "b.mp4": { status: "failed", error_message: "unsupported codec" } } })]);
    const partial = await run(["import", "--library", "--media", JSON.stringify({ "a.mp4": { url: "https://cdn.example/a.mp4" }, "b.mp4": { url: "https://cdn.example/b.mp4" } })]);
    assert.equal(partial.code, 4);
    assert.match(partial.out, /Library import failed: .*b\.mp4.*unsupported codec/);
});
test("library imports tolerate a job status with no project fields", async () => {
    installMockFetch([driveSubmit, { status: 200, json: { job_id: "j", job_type: "import/drive_media", job_state: "running", created_at: "t", drive_id: "d" } }, driveJob({ status: "success" })]);
    const r = await run(["import", "--library", "--url", "https://cdn.example/a.mp4", "--json"]);
    assert.equal(r.code, 0, r.err);
    assert.equal(JSON.parse(r.out).ok, true);
});
test("library usage errors exit 2 with no API call", async () => {
    const url = ["--url", "https://cdn.example/a.mp4"];
    const cases = [
        { argv: ["--library", ...url, "--name", "X"], message: /--library cannot be combined with --name/ },
        { argv: ["--library", ...url, "--project-id", "p"], message: /--library cannot be combined with --project-id/ },
        { argv: ["--library", ...url, "--workspace", "General"], message: /--library cannot be combined with --workspace/ },
        { argv: ["--library", ...url, "--team-access", "edit"], message: /--library cannot be combined with --team-access/ },
        { argv: ["--library", ...url, "--folder", "Client Work"], message: /--library cannot be combined with --folder\b/ },
        { argv: ["--library", ...url, "--compositions", "[]"], message: /--library cannot be combined with --compositions/ },
        { argv: ["--library", ...url, "--composition-id", "b65d1"], message: /--library cannot be combined with --composition-id/ },
        { argv: ["--library", ...url, "--update-compositions", "[]"], message: /--library cannot be combined with --update-compositions/ },
        { argv: ["--library", ...url, "--name", "X", "--team-access", "view"], message: /--name, --team-access/ },
        { argv: [...url, "--folder-id", FOLDER_ID], message: /--folder-id only applies with --library/ },
        { argv: ["--library", ...url, "--folder-id", "Client Work"], message: /--folder-id must be a UUID/ },
        { argv: ["--library", ...url, "--folder-id"], message: /--folder-id needs a value/ },
        { argv: ["--library", "--media", JSON.stringify({ "Seq": { tracks: [{ media: "a.mp4" }] }, "a.mp4": { url: "https://cdn.example/a.mp4" } })], message: /tracks.*drive media library does not accept sequences/ },
        { argv: ["--library", "--media", "{not json"], message: /--media must be valid JSON/ },
        { argv: ["--library", "--media", "[1,2]"], message: /--media must be valid JSON \(an add_media map\)/ },
        { argv: ["--library"], message: /--url, --file or --media/ },
        { argv: ["--library", ...url, "--file", "/nonexistent/a.mp4"], message: /only one of --url, --file or --media/ },
        { argv: ["--library", "leftover", ...url], message: /--library is a switch and takes no value/ }
    ];
    for (const c of cases) {
        const { calls } = installMockFetch([driveSubmit]);
        const r = await run(["import", "--no-wait", "--json", ...c.argv]);
        assert.equal(r.code, 2, c.argv.join(" "));
        assert.equal(calls.length, 0, c.argv.join(" "));
        assert.match(r.err, c.message, c.argv.join(" "));
        restoreFetch();
    }
});
test("a library import with a missing file fails before any API call", async () => {
    const { calls } = installMockFetch([driveSubmit]);
    const r = await run(["import", "--library", "--file", "/nonexistent/clip.mp4", "--no-wait"]);
    assert.notEqual(r.code, 0);
    assert.equal(calls.length, 0);
});
