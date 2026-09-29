import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../src/cli/index.js";
import { progressReporter } from "../../src/cli/output.js";
import { handleRpc, realExecutor } from "../../src/mcp/server.js";
import { installMockFetch, installMockFetchByUrl, restoreFetch } from "../helpers/mockFetch.js";
afterEach(() => restoreFetch());
// =========================================================================
// Underlord progress labels while polling. Human mode writes each NEW label to
// stderr as "  progress - <label>"; --json (and so the MCP shim) stays silent.
// =========================================================================
const FAST_POLL = { intervalMs: 1, maxIntervalMs: 1, sleep: async () => { } };
const ENV = { DESCRIPT_API_TOKEN: "t" };
async function run(argv) {
    const out = [];
    const err = [];
    const code = await runCli(argv, { env: ENV, stdout: (s) => out.push(s), stderr: (s) => err.push(s), poll: FAST_POLL });
    return { code, out: out.join(""), err: err.join("") };
}
const base = { created_at: "t", drive_id: "d", project_id: "p", project_url: "u" };
const running = (id, type, label) => ({ status: 200, json: { job_id: id, job_type: type, job_state: "running", ...base, ...(label ? { progress: { label, last_update_at: "t" } } : {}) } });
const agentDone = { status: 200, json: { job_id: "j", job_type: "agent", job_state: "stopped", ...base,
        result: { status: "success", agent_response: "Done", project_changed: true, ai_credits_used: 1, media_seconds_used: 0 } } };
const submit = { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } };
const agentSequence = () => [
    submit,
    running("j", "agent", "Editing script"),
    running("j", "agent", "Editing script"),
    running("j", "agent", "Applying Studio Sound"),
    agentDone
];
test("agent writes each new progress label to stderr once, in order", async () => {
    installMockFetch(agentSequence());
    const r = await run(["agent", "--project-id", "p", "--prompt", "clean up the audio"]);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.err, "  progress - Editing script\n  progress - Applying Studio Sound\n");
    assert.doesNotMatch(r.out, /progress/);
    assert.match(r.out, /Agent: Done/);
});
test("agent --json writes no progress lines and keeps stdout machine-readable", async () => {
    installMockFetch(agentSequence());
    const r = await run(["agent", "--project-id", "p", "--prompt", "clean up the audio", "--json"]);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.err, "");
    const parsed = JSON.parse(r.out);
    assert.equal(parsed.ok, true);
    assert.doesNotMatch(r.out, /progress -/);
});
test("agent --no-wait polls nothing, so it prints no progress", async () => {
    installMockFetch(agentSequence());
    const r = await run(["agent", "--project-id", "p", "--prompt", "x", "--no-wait"]);
    assert.equal(r.code, 0);
    assert.equal(r.err, "");
});
test("a label that comes back after a different one is printed again", async () => {
    installMockFetch([submit, running("j", "agent", "A"), running("j", "agent", "B"), running("j", "agent", "A"), agentDone]);
    const r = await run(["agent", "--project-id", "p", "--prompt", "x"]);
    assert.equal(r.err, "  progress - A\n  progress - B\n  progress - A\n");
});
test("polls without a progress label print nothing", async () => {
    installMockFetch([submit, running("j", "agent"), running("j", "agent"), agentDone]);
    const r = await run(["agent", "--project-id", "p", "--prompt", "x"]);
    assert.equal(r.code, 0);
    assert.equal(r.err, "");
});
test("publish writes its progress labels to stderr", async () => {
    installMockFetch([
        submit,
        running("j", "publish", "Rendering video export"),
        running("j", "publish", "Rendering video export"),
        running("j", "publish", "Uploading"),
        { status: 200, json: { job_id: "j", job_type: "publish", job_state: "stopped", ...base,
                result: { status: "success", composition_id: "c", share_url: "https://share.descript.com/view/abc" } } }
    ]);
    const r = await run(["publish", "--project-id", "p"]);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.err, "  progress - Rendering video export\n  progress - Uploading\n");
    assert.match(r.out, /Published: https:\/\/share\.descript\.com\/view\/abc/);
});
test("publish --json writes no progress lines", async () => {
    installMockFetch([
        submit,
        running("j", "publish", "Rendering video export"),
        { status: 200, json: { job_id: "j", job_type: "publish", job_state: "stopped", ...base,
                result: { status: "success", composition_id: "c", share_url: "https://share.descript.com/view/abc" } } }
    ]);
    const r = await run(["publish", "--project-id", "p", "--json"]);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.err, "");
});
const importDone = { status: 200, json: { job_id: "j", job_type: "import/project_media", job_state: "stopped", ...base,
        result: { status: "success", media_status: {}, media_seconds_used: 1, created_compositions: [{ id: "c", name: "Cut" }] } } };
const importPolls = () => [
    running("j", "import/project_media", "Importing media"),
    running("j", "import/project_media", "Importing media"),
    running("j", "import/project_media", "Transcribing"),
    importDone
];
test("import writes progress labels on every branch that polls", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-progress-"));
    const file = join(dir, "clip.mp4");
    writeFileSync(file, Buffer.alloc(64, 1));
    const uploadSubmit = { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u",
            upload_urls: { "clip.mp4": { upload_url: "https://gcs/s", asset_id: "a", artifact_id: "b" } } } };
    const cases = [
        { name: "--url", argv: ["import", "--url", "https://x.test/a.mp4"], sequence: [submit, ...importPolls()] },
        { name: "--file", argv: ["import", "--file", file], sequence: [uploadSubmit, { status: 200, text: "" }, ...importPolls()] },
        { name: "--media", argv: ["import", "--media", JSON.stringify({ "a.mp4": { url: "https://x.test/a.mp4" } })], sequence: [submit, ...importPolls()] },
        { name: "--project-id --url", argv: ["import", "--project-id", "p", "--url", "https://x.test/a.mp4"], sequence: [submit, ...importPolls()] }
    ];
    try {
        for (const c of cases) {
            installMockFetch(c.sequence);
            const r = await run(c.argv);
            assert.equal(r.code, 0, `${c.name}: ${r.err}`);
            assert.equal(r.err, "  progress - Importing media\n  progress - Transcribing\n", c.name);
            restoreFetch();
            installMockFetch(c.sequence);
            const j = await run([...c.argv, "--json"]);
            assert.equal(j.code, 0, `${c.name} --json: ${j.err}`);
            assert.equal(j.err, "", `${c.name} --json`);
            restoreFetch();
        }
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("import into an existing project by file, and into the drive media library, write progress labels", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-progress-lib-"));
    const file = join(dir, "clip.mp4");
    writeFileSync(file, Buffer.alloc(64, 1));
    const uploadUrls = { "clip.mp4": { upload_url: "https://gcs/s", asset_id: "a", artifact_id: "b" } };
    const projectUpload = { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u", upload_urls: uploadUrls } };
    const driveSubmit = { status: 201, json: { job_id: "j", drive_id: "d" } };
    const driveUpload = { status: 201, json: { job_id: "j", drive_id: "d", upload_urls: uploadUrls } };
    const driveRunning = (label) => ({ status: 200, json: { job_id: "j", job_type: "import/drive_media", job_state: "running", created_at: "t", drive_id: "d", progress: { label, last_update_at: "t" } } });
    const driveDone = { status: 200, json: { job_id: "j", job_type: "import/drive_media", job_state: "stopped", created_at: "t", drive_id: "d", result: { status: "success" } } };
    const drivePolls = () => [driveRunning("Importing media"), driveRunning("Importing media"), driveRunning("Transcribing"), driveDone];
    const cases = [
        { name: "--project-id --file", argv: ["import", "--project-id", "p", "--file", file], sequence: [projectUpload, { status: 200, text: "" }, ...importPolls()] },
        { name: "--project-id --composition-id --url", argv: ["import", "--project-id", "p", "--composition-id", "b65d1", "--url", "https://x.test/a.mp4"], sequence: [submit, ...importPolls()] },
        { name: "--library --url", argv: ["import", "--library", "--url", "https://x.test/a.mp4"], sequence: [driveSubmit, ...drivePolls()] },
        { name: "--library --file", argv: ["import", "--library", "--file", file], sequence: [driveUpload, { status: 200, text: "" }, ...drivePolls()] },
        { name: "--library --media", argv: ["import", "--library", "--media", JSON.stringify({ "a.mp4": { url: "https://x.test/a.mp4" } })], sequence: [driveSubmit, ...drivePolls()] }
    ];
    try {
        for (const c of cases) {
            installMockFetch(c.sequence);
            const r = await run(c.argv);
            assert.equal(r.code, 0, `${c.name}: ${r.err}`);
            assert.equal(r.err, "  progress - Importing media\n  progress - Transcribing\n", c.name);
            restoreFetch();
            installMockFetch(c.sequence);
            const j = await run([...c.argv, "--json"]);
            assert.equal(j.code, 0, `${c.name} --json: ${j.err}`);
            assert.equal(j.err, "", `${c.name} --json`);
            restoreFetch();
        }
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("translate writes the agent job's progress labels to stderr", async () => {
    const project = (extra) => ({ status: 200, json: { id: "p1", name: "P", drive_id: "d", created_at: "a", updated_at: "b", media_files: {},
            compositions: [{ id: "orig", name: "Video", media_type: "video" }, ...extra] } });
    installMockFetchByUrl([
        { match: "/projects/p1", responses: [project([]), project([{ id: "newfr", name: "Video FR", media_type: "video" }])] },
        { match: "/jobs/agent", responses: [{ status: 201, json: { job_id: "ja", drive_id: "d", project_id: "p1", project_url: "u" } }] },
        { match: "/jobs/ja", responses: [
                running("ja", "agent", "Adding captions"),
                running("ja", "agent", "Translating captions"),
                { status: 200, json: { job_id: "ja", job_type: "agent", job_state: "stopped", ...base, project_id: "p1",
                        result: { status: "success", agent_response: "Done", project_changed: true, ai_credits_used: 9.3 } } }
            ] }
    ]);
    const r = await run(["translate", "p1", "orig", "--language", "French (Canada)"]);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.err, "  progress - Adding captions\n  progress - Translating captions\n");
    assert.match(r.out, /newfr/);
});
test("export writes the publish job's progress labels to stderr", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-progress-exp-"));
    try {
        installMockFetch([
            submit,
            running("j", "publish", "Rendering video export"),
            running("j", "publish", "Uploading"),
            { status: 200, json: { job_id: "j", job_type: "publish", job_state: "stopped", ...base,
                    result: { status: "success", composition_id: "c", share_url: "https://web.descript.com/p/view/slug-1" } } },
            { status: 200, json: { download_url: "https://gcs/X.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "X" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx.\n" } },
            { status: 200, text: "X-bytes" }
        ]);
        const r = await run(["export", "p", "c", "--output-dir", dir, "--formats", "md"]);
        assert.equal(r.code, 0, r.out + r.err);
        assert.equal(r.err, "  progress - Rendering video export\n  progress - Uploading\n");
        restoreFetch();
        installMockFetch([
            submit,
            running("j", "publish", "Rendering video export"),
            { status: 200, json: { job_id: "j", job_type: "publish", job_state: "stopped", ...base,
                    result: { status: "success", composition_id: "c", share_url: "https://web.descript.com/p/view/slug-1" } } },
            { status: 200, json: { download_url: "https://gcs/X.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "X" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx.\n" } },
            { status: 200, text: "X-bytes" }
        ]);
        const j = await run(["export", "p", "c", "--output-dir", dir, "--formats", "md", "--json"]);
        assert.equal(j.code, 0, j.out + j.err);
        assert.equal(j.err, "");
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("export --resume writes progress labels when it republishes an item", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-progress-resume-"));
    try {
        const reportPath = join(dir, "export-report.json");
        writeFileSync(reportPath, JSON.stringify({
            ok: false, command: "export",
            items: [{ ok: false, slug: "", title: "", outputDir: "", written: [], failed: [{ format: "md", error: "publish failed" }], skipped: [],
                    projectId: "p", compositionId: "c" }]
        }));
        installMockFetch([
            submit,
            running("j", "publish", "Rendering video export"),
            { status: 200, json: { job_id: "j", job_type: "publish", job_state: "stopped", ...base,
                    result: { status: "success", composition_id: "c", share_url: "https://web.descript.com/p/view/slug-1" } } },
            { status: 200, json: { download_url: "https://gcs/X.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "X" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx.\n" } },
            { status: 200, text: "X-bytes" }
        ]);
        const r = await run(["export", "--resume", reportPath, "--output-dir", dir]);
        assert.equal(r.code, 0, r.out + r.err);
        assert.equal(r.err, "  progress - Rendering video export\n");
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test("a multi-composition export tags each progress line with the composition title", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-progress-exp2-"));
    const stopped = (id, slug) => ({ status: 200, json: { job_id: id, job_type: "publish", job_state: "stopped", ...base,
            result: { status: "success", composition_id: "c", share_url: `https://web.descript.com/p/view/${slug}` } } });
    const meta = { status: 200, json: { download_url: "https://gcs/X.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private",
            metadata: { title: "X" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx.\n" } };
    try {
        installMockFetchByUrl([
            { match: "/projects/p", responses: [{ status: 200, json: { id: "p", name: "P", drive_id: "d", created_at: "a", updated_at: "b", media_files: {},
                            compositions: [{ id: "c1", name: "Lesson A" }, { id: "c2", name: "Lesson B" }] } }] },
            { match: "/jobs/publish", responses: [
                    { status: 201, json: { job_id: "j1", drive_id: "d", project_id: "p", project_url: "u" } },
                    { status: 201, json: { job_id: "j2", drive_id: "d", project_id: "p", project_url: "u" } }
                ] },
            { match: "/jobs/j1", responses: [running("j1", "publish", "Rendering video export"), stopped("j1", "s1")] },
            { match: "/jobs/j2", responses: [running("j2", "publish", "Rendering video export"), stopped("j2", "s2")] },
            { match: "/published_projects/", responses: [meta] }
        ]);
        const r = await run(["export", "p", "--output-dir", dir, "--formats", "md"]);
        assert.equal(r.code, 0, r.out + r.err);
        assert.equal(r.err, "  progress - Lesson A - Rendering video export\n  progress - Lesson B - Rendering video export\n");
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
// =========================================================================
// progressReporter, the one shared formatter.
// =========================================================================
function statusWith(label) {
    return { job_id: "j", job_type: "agent", job_state: "running", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        ...(label === undefined ? {} : { progress: { label } }) };
}
function ioFor(json) {
    const err = [];
    const out = [];
    return { io: { json, stdout: (s) => out.push(s), stderr: (s) => err.push(s) }, err, out };
}
test("progressReporter writes one line per new label to stderr and never to stdout", () => {
    const { io, err, out } = ioFor(false);
    const report = progressReporter(io);
    for (const l of ["A", "A", "B", "B", "B", "C"])
        report(statusWith(l));
    assert.deepEqual(err, ["  progress - A\n", "  progress - B\n", "  progress - C\n"]);
    assert.deepEqual(out, []);
});
test("progressReporter is silent in json mode", () => {
    const { io, err, out } = ioFor(true);
    const report = progressReporter(io);
    report(statusWith("A"));
    report(statusWith("B"));
    assert.deepEqual(err, []);
    assert.deepEqual(out, []);
});
test("progressReporter ignores polls without a usable label", () => {
    const { io, err } = ioFor(false);
    const report = progressReporter(io);
    report(statusWith());
    report(statusWith(""));
    report(statusWith("   "));
    report({ ...statusWith(), progress: { label: 7 } });
    assert.deepEqual(err, []);
});
test("progressReporter keeps a label on one line and prefixes a context when given", () => {
    const { io, err } = ioFor(false);
    const report = progressReporter(io, "Lesson A");
    report(statusWith("Applying Studio Sound\nto clip 2..."));
    assert.deepEqual(err, ["  progress - Lesson A - Applying Studio Sound to clip 2...\n"]);
});
test("each reporter keeps its own last label", () => {
    const { io, err } = ioFor(false);
    const a = progressReporter(io, "A");
    const b = progressReporter(io, "B");
    a(statusWith("Same"));
    b(statusWith("Same"));
    assert.deepEqual(err, ["  progress - A - Same\n", "  progress - B - Same\n"]);
});
// =========================================================================
// The MCP shim always passes --json and returns stdout (stderr only when
// stdout is empty), so progress can never reach a tool result.
// =========================================================================
test("descript_agent through the MCP shim returns clean JSON with no progress lines", async () => {
    installMockFetch([
        submit,
        { status: 200, json: { job_id: "j", job_type: "agent", job_state: "stopped", ...base, progress: { label: "Editing script" },
                result: { status: "success", agent_response: "Done", project_changed: true, ai_credits_used: 1, media_seconds_used: 0 } } }
    ]);
    const prev = process.env.DESCRIPT_API_TOKEN;
    process.env.DESCRIPT_API_TOKEN = "t";
    try {
        const r = await handleRpc({ jsonrpc: "2.0", id: 30, method: "tools/call", params: { name: "descript_agent", arguments: { project_id: "p", prompt: "clean up the audio" } } }, realExecutor);
        assert.equal(r.result.isError, false, r.result.content[0].text);
        const text = r.result.content[0].text;
        assert.doesNotMatch(text, /progress -/);
        assert.equal(JSON.parse(text).agentResponse, "Done");
    }
    finally {
        if (prev === undefined)
            delete process.env.DESCRIPT_API_TOKEN;
        else
            process.env.DESCRIPT_API_TOKEN = prev;
    }
});
