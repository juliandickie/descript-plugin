import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRpc, handleLine, realExecutor, TOOLS } from "../../src/mcp/server.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";
test("lists a tool per CLI surface", () => {
    const names = TOOLS.map((t) => t.name);
    for (const n of ["descript_status", "descript_import", "descript_agent", "descript_publish", "descript_jobs", "descript_projects", "descript_published", "descript_edit_in_descript", "descript_batch", "descript_models", "descript_transcript", "descript_translate", "descript_search", "descript_timeline"]) {
        assert.ok(names.includes(n), `missing tool ${n}`);
    }
});
test("initialize returns protocol and serverInfo", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, async () => ({ code: 0, stdout: "", stderr: "" }));
    assert.equal(r.result.serverInfo.name, "descript");
});
test("tools/list returns the tool array", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, async () => ({ code: 0, stdout: "", stderr: "" }));
    assert.equal(r.result.tools.length, TOOLS.length);
});
test("tools/call invokes the CLI and returns stdout", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "descript_status", arguments: {} } }, async (argv) => { assert.deepEqual(argv, ["status", "--json"]); return { code: 0, stdout: '{"drive_name":"iDD"}', stderr: "" }; });
    assert.match(r.result.content[0].text, /"drive_name":"iDD"/);
});
test("notifications (no id) produce no response", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }, async () => ({ code: 0, stdout: "", stderr: "" }));
    assert.equal(r, null);
});
test("handleLine returns a JSON-RPC parse error for malformed input and does not throw", async () => {
    const out = await handleLine("{ not json", async () => ({ code: 0, stdout: "", stderr: "" }));
    assert.ok(out);
    const parsed = JSON.parse(out);
    assert.equal(parsed.error.code, -32700);
    assert.equal(parsed.id, null);
});
test("unknown method returns JSON-RPC -32601", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 9, method: "resources/list", params: {} }, async () => ({ code: 0, stdout: "", stderr: "" }));
    assert.equal(r.error.code, -32601);
});
test("tools/call without a name returns JSON-RPC -32602", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 10, method: "tools/call", params: {} }, async () => ({ code: 0, stdout: "", stderr: "" }));
    assert.equal(r.error.code, -32602);
});
test("tools/call surfaces a nonzero CLI exit as isError", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "descript_status", arguments: {} } }, async () => ({ code: 3, stdout: "", stderr: "bad token" }));
    assert.equal(r.result.isError, true);
    assert.match(r.result.content[0].text, /bad token/);
});
test("tools/call with non-object arguments returns JSON-RPC -32602", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "descript_status", arguments: "not-an-object" } }, async () => ({ code: 0, stdout: "", stderr: "" }));
    assert.equal(r.error.code, -32602);
});
test("descript_transcript argv builder maps args to CLI flags", () => {
    const tool = TOOLS.find((t) => t.name === "descript_transcript");
    assert.deepEqual(tool.argv({ project_id: "p1", composition_id: "c1", format: "markdown", speaker_labels: "changes", markers: true }), ["transcript", "p1", "c1", "--format=markdown", "--speaker-labels=changes", "--markers", "--json"]);
    assert.deepEqual(tool.argv({ project_id: "p1", format: "docx", out: "/tmp/t.docx" }), ["transcript", "p1", "--format=docx", "--out=/tmp/t.docx", "--json"]);
});
test("descript_transcript maps a timecodes object onto the CLI timecode flags", () => {
    const tool = TOOLS.find((t) => t.name === "descript_transcript");
    assert.deepEqual(tool.argv({ project_id: "p1", composition_id: "c1", format: "markdown", timecodes: { on_paragraphs: true, on_speakers: true } }), ["transcript", "p1", "c1", "--format=markdown", "--timecodes-on-paragraphs", "--timecodes-on-speakers", "--json"]);
    assert.deepEqual(tool.argv({ project_id: "p1", format: "txt", timecodes: { frequency_seconds: 30, offset_seconds: -5, on_markers: true, on_paragraphs: false } }), ["transcript", "p1", "--format=txt", "--timecodes-every=30", "--timecodes-offset=-5", "--timecodes-on-markers", "--json"]);
});
test("descript_transcript end to end - the timecodes argument reaches the API request body", async () => {
    const { calls } = installMockFetch([{ status: 200, text: "[00:00:00] hi", headers: { "content-type": "text/markdown" } }]);
    const prev = process.env.DESCRIPT_API_TOKEN;
    process.env.DESCRIPT_API_TOKEN = "t";
    try {
        const r = await handleRpc({ jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "descript_transcript", arguments: {
                    project_id: "p1", format: "markdown", timecodes: { frequency_seconds: 30, offset_seconds: -5, on_paragraphs: true, on_speakers: true }
                } } }, realExecutor);
        assert.equal(r.result.isError, false, r.result.content[0].text);
        const body = JSON.parse(calls[0].body);
        assert.deepEqual(body.timecodes, { frequency_seconds: 30, offset_seconds: -5, on_paragraphs: true, on_speakers: true });
    }
    finally {
        if (prev === undefined)
            delete process.env.DESCRIPT_API_TOKEN;
        else
            process.env.DESCRIPT_API_TOKEN = prev;
        restoreFetch();
    }
});
test("descript_transcript rejects a malformed timecodes argument instead of ignoring it", async () => {
    const never = async () => { throw new Error("CLI must not run"); };
    for (const bad of [true, "on_paragraphs", ["on_paragraphs"], { on_paragraph: true }, { on_paragraphs: "yes" }, { frequency_seconds: "30" }]) {
        const r = await handleRpc({ jsonrpc: "2.0", id: 21, method: "tools/call", params: { name: "descript_transcript", arguments: { project_id: "p1", format: "txt", timecodes: bad } } }, never);
        assert.equal(r.result.isError, true, `expected an error for ${JSON.stringify(bad)}`);
        assert.match(r.result.content[0].text, /timecodes/);
    }
});
test("descript_transcript rejects an unknown top-level argument instead of ignoring it", async () => {
    const r = await handleRpc({ jsonrpc: "2.0", id: 22, method: "tools/call", params: { name: "descript_transcript", arguments: { project_id: "p1", format: "txt", timecode: { on_paragraphs: true } } } }, async () => { throw new Error("CLI must not run"); });
    assert.equal(r.result.isError, true);
    assert.match(r.result.content[0].text, /Unknown argument "timecode"/);
});
test("descript_models argv builder", () => {
    const tool = TOOLS.find((t) => t.name === "descript_models");
    assert.deepEqual(tool.argv({}), ["models", "--json"]);
});
test("descript_translate argv builder", () => {
    const tool = TOOLS.find((t) => t.name === "descript_translate");
    assert.deepEqual(tool.argv({ project_id: "p1", composition_id: "c1", language: "French (Canada)", model: "claude-haiku" }), ["translate", "p1", "c1", "--language=French (Canada)", "--model=claude-haiku", "--json"]);
    assert.deepEqual(tool.argv({ project_id: "p1", language: "German" }), ["translate", "p1", "--language=German", "--json"]);
});
// =========================================================================
// Every tool rejects what it does not understand (2026-09-21 field note).
// An argument that is accepted and then dropped is the failure being guarded.
// =========================================================================
const argvOf = (name, args) => TOOLS.find((t) => t.name === name).argv(args);
test("descript_projects forwards list filters instead of dropping them", () => {
    assert.deepEqual(argvOf("descript_projects", { name: "FIS", folder_path: "Courses - Online", sort: "updated_at", direction: "desc", limit: 50 }), ["projects", "list", "--name=FIS", "--folder-path=Courses - Online", "--sort=updated_at", "--direction=desc", "--limit=50", "--json"]);
    assert.deepEqual(argvOf("descript_projects", { sub: "get", id: "p1" }), ["projects", "get", "p1", "--json"]);
});
test("descript_jobs forwards list filters instead of dropping them", () => {
    assert.deepEqual(argvOf("descript_jobs", { project_id: "p1", type: "agent", created_after: "2026-09-01T00:00:00Z", limit: 10 }), ["jobs", "list", "--project-id=p1", "--type=agent", "--created-after=2026-09-01T00:00:00Z", "--limit=10", "--json"]);
    assert.deepEqual(argvOf("descript_jobs", { sub: "cancel", id: "j1" }), ["jobs", "cancel", "j1", "--json"]);
});
test("descript_publish accepts snake_case and kebab-case and forwards access_level", () => {
    const want = ["publish", "--project-id=p1", "--composition-id=c1", "--access-level=private", "--json"];
    assert.deepEqual(argvOf("descript_publish", { project_id: "p1", composition_id: "c1", access_level: "private" }), want);
    assert.deepEqual(argvOf("descript_publish", { "project-id": "p1", "composition-id": "c1", "access-level": "private" }), want);
    assert.throws(() => argvOf("descript_publish", { project_id: "p1", "project-id": "p2" }), /given twice/);
});
test("descript_import serialises object arguments as JSON and drops false booleans", () => {
    assert.deepEqual(argvOf("descript_import", { url: "https://x.test/a.mp4", name: "A", compositions: [{ name: "Main" }], no_wait: false }), ["import", "--url=https://x.test/a.mp4", "--name=A", "--compositions=[{\"name\":\"Main\"}]", "--json"]);
    assert.deepEqual(argvOf("descript_agent", { project_id: "p1", prompt: "cut silences", no_wait: true }), ["agent", "--project-id=p1", "--prompt=cut silences", "--no-wait", "--json"]);
});
test("descript_import forwards library, folder_id, composition_id and update_compositions to the CLI flags", () => {
    assert.deepEqual(argvOf("descript_import", { library: true, url: "https://x.test/a.mp4", folder_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", language: "es", no_wait: true }), ["import", "--library", "--url=https://x.test/a.mp4", "--folder-id=3fa85f64-5717-4562-b3fc-2c963f66afa6", "--language=es", "--no-wait", "--json"]);
    assert.deepEqual(argvOf("descript_import", { project_id: "p1", composition_id: "b65d1", file: "/tmp/clip.mp4" }), ["import", "--project-id=p1", "--composition-id=b65d1", "--file=/tmp/clip.mp4", "--json"]);
    const update = [{ composition_id: "b65d1", append_clips: [{ media: "a.mp4", mute: true }] }];
    assert.deepEqual(argvOf("descript_import", { project_id: "p1", media: JSON.stringify({ "a.mp4": { url: "https://x.test/a.mp4" } }), update_compositions: update }), ["import", "--project-id=p1", "--media={\"a.mp4\":{\"url\":\"https://x.test/a.mp4\"}}", `--update-compositions=${JSON.stringify(update)}`, "--json"]);
    assert.deepEqual(argvOf("descript_import", { "folder-id": "f", "composition-id": "c", "update-compositions": [], library: false }), ["import", "--folder-id=f", "--composition-id=c", "--update-compositions=[]", "--json"]);
});
test("descript_import still rejects arguments it does not read", () => {
    assert.throws(() => argvOf("descript_import", { library: true, folder_ids: "x" }), /Unknown argument "folder_ids"/);
    assert.throws(() => argvOf("descript_import", { url: "u", composition: "b65d1" }), /Unknown argument "composition"/);
    assert.throws(() => argvOf("descript_import", { url: "u", append_clips: [] }), /Unknown argument "append_clips"/);
});
test("descript_import describes library imports and appending to a composition", () => {
    const d = TOOLS.find((t) => t.name === "descript_import").description;
    assert.match(d, /library\?/);
    assert.match(d, /folder_id\?/);
    assert.match(d, /composition_id\?/);
    assert.match(d, /update_compositions\?/);
    assert.match(d, /shared Drive media library/);
    assert.match(d, /appends? .*composition/i);
});
test("descript_publish lists all four access levels and descript_jobs all five job types", () => {
    const publish = TOOLS.find((t) => t.name === "descript_publish").description;
    assert.match(publish, /access_level\?=private\|drive\|unlisted\|public/);
    assert.match(publish, /drive/);
    const jobs = TOOLS.find((t) => t.name === "descript_jobs").description;
    for (const type of ["import/project_media", "import/drive_media", "agent", "publish", "export/timeline"]) {
        assert.ok(jobs.includes(type), `descript_jobs should list ${type}`);
    }
});
test("descript_batch and descript_published keep their positional shape", () => {
    assert.deepEqual(argvOf("descript_batch", { file: "m.json" }), ["batch", "plan", "m.json", "--json"]);
    assert.deepEqual(argvOf("descript_batch", { sub: "run", file: "m.json", confirm: true }), ["batch", "run", "m.json", "--confirm", "--json"]);
    assert.deepEqual(argvOf("descript_published", { slug: "abc123" }), ["published", "abc123", "--json"]);
});
test("every tool rejects an unknown argument before the CLI runs", async () => {
    const never = async () => { throw new Error("CLI must not run"); };
    const valid = {
        descript_published: { slug: "s" }, descript_batch: { file: "m.json" },
        descript_transcript: { project_id: "p1" }, descript_translate: { project_id: "p1", language: "German" },
        descript_search: { query: "q" }, descript_timeline: { project_id: "p1", format: "edl" }
    };
    for (const t of TOOLS) {
        const r = await handleRpc({ jsonrpc: "2.0", id: 30, method: "tools/call", params: { name: t.name, arguments: { ...(valid[t.name] ?? {}), definitely_not_an_option: 1 } } }, never);
        assert.equal(r.result.isError, true, `${t.name} accepted an unknown argument`);
        assert.match(r.result.content[0].text, /Unknown argument "definitely_not_an_option"/, t.name);
    }
});
test("a flag that belongs to another command is rejected (publish has no language, projects has no project_id)", () => {
    assert.throws(() => argvOf("descript_publish", { project_id: "p1", language: "German" }), /Unknown argument "language"/);
    assert.throws(() => argvOf("descript_projects", { project_id: "p1" }), /Unknown argument "project_id"/);
});
test("missing required positionals and flag-looking positionals are rejected", () => {
    assert.throws(() => argvOf("descript_transcript", { format: "txt" }), /missing required argument "project_id"/);
    assert.throws(() => argvOf("descript_published", {}), /missing required argument "slug"/);
    assert.throws(() => argvOf("descript_batch", { sub: "run" }), /missing required argument "file"/);
    assert.throws(() => argvOf("descript_jobs", { sub: "get", id: "--json" }), /cannot start with "--"/);
});
test("every argv a tool can build is accepted by the CLI flag table", async () => {
    const { unknownFlags } = await import("../../src/cli/commands/registry.js");
    const { parseArgv } = await import("../../src/cli/index.js");
    const samples = [
        ["descript_import", { url: "u", file: "f", media: "{}", name: "n", folder: "f", language: "en", project_id: "p", workspace: "w", compositions: [], content_type: "video/mp4", team_access: "view", callback_url: "c", no_wait: true, profile: "x" }],
        ["descript_import", { library: true, url: "u", folder_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", language: "en", callback_url: "c", no_wait: true }],
        ["descript_import", { project_id: "p", composition_id: "c", file: "f", content_type: "video/mp4" }],
        ["descript_import", { project_id: "p", media: "{}", update_compositions: [{ composition_id: "c", append_clips: [{ media: "a.mp4" }] }] }],
        ["descript_agent", { prompt: "x", project_id: "p", project_name: "n", composition_id: "c", model: "m", team_access: "view", callback_url: "c", no_wait: true }],
        ["descript_publish", { project_id: "p", composition_id: "c", media_type: "Video", resolution: "1080p", access_level: "private", callback_url: "c", no_wait: true }],
        ["descript_transcript", { project_id: "p", format: "srt", out: "o", speaker_labels: "off", markers: true, timecodes: { on_paragraphs: true, on_speakers: true, on_markers: true, frequency_seconds: 5, offset_seconds: -1 } }],
        ["descript_search", { query: "q", type: ["project", "audio"], match: "name,content", owner: ["3fa85f64-5717-4562-b3fc-2c963f66afa6"], updated_after: "2026-08-01", updated_before: "2026-08-31", sort: "newest", limit: 5 }],
        ["descript_timeline", { project_id: "p", composition_id: "c", format: "premiere", out: "o", markers: false, track_per_file: true, source_frame_rate: true, strip_spaces: true, callback_url: "c", no_wait: true }]
    ];
    for (const [name, args] of samples) {
        const { command, flags } = parseArgv(argvOf(name, args));
        assert.deepEqual(unknownFlags(command, flags), [], name);
    }
});
test("initialize reports the plugin's real version from package.json", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "package.json"), "utf8"));
    const r = await handleRpc({ jsonrpc: "2.0", id: 40, method: "initialize", params: {} }, async () => ({ code: 0, stdout: "", stderr: "" }));
    assert.equal(r.result.serverInfo.version, pkg.version);
    assert.match(r.result.serverInfo.version, /^\d+\.\d+\.\d+$/);
});
test("descript_publish end to end - no access_level means private in the API request", async () => {
    const { calls } = installMockFetch([{ status: 201, json: { job_id: "j1" } }]);
    const prev = process.env.DESCRIPT_API_TOKEN;
    process.env.DESCRIPT_API_TOKEN = "t";
    try {
        const r = await handleRpc({ jsonrpc: "2.0", id: 41, method: "tools/call", params: { name: "descript_publish", arguments: { project_id: "p1", composition_id: "c1", no_wait: true } } }, realExecutor);
        assert.equal(r.result.isError, false, r.result.content[0].text);
        const body = JSON.parse(calls[0].body);
        assert.equal(body.access_level, "private");
        assert.equal(body.composition_id, "c1");
    }
    finally {
        if (prev === undefined)
            delete process.env.DESCRIPT_API_TOKEN;
        else
            process.env.DESCRIPT_API_TOKEN = prev;
        restoreFetch();
    }
});
test("descript_import end to end - library and composition_id reach the API request bodies", async () => {
    const prev = process.env.DESCRIPT_API_TOKEN;
    process.env.DESCRIPT_API_TOKEN = "t";
    try {
        const lib = installMockFetch([{ status: 201, json: { job_id: "j1", drive_id: "d" } }]);
        const r1 = await handleRpc({ jsonrpc: "2.0", id: 42, method: "tools/call", params: { name: "descript_import", arguments: {
                    library: true, url: "https://x.test/a/clip.mp4", folder_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", no_wait: true
                } } }, realExecutor);
        assert.equal(r1.result.isError, false, r1.result.content[0].text);
        assert.equal(lib.calls[0].url, "https://descriptapi.com/v1/jobs/import/drive_media");
        assert.deepEqual(JSON.parse(lib.calls[0].body), { add_media: { "clip.mp4": { url: "https://x.test/a/clip.mp4" } }, folder_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6" });
        restoreFetch();
        const app = installMockFetch([{ status: 201, json: { job_id: "j2", drive_id: "d", project_id: "p1", project_url: "u" } }]);
        const r2 = await handleRpc({ jsonrpc: "2.0", id: 43, method: "tools/call", params: { name: "descript_import", arguments: {
                    project_id: "p1", composition_id: "b65d1", url: "https://x.test/outro.mp4", no_wait: true
                } } }, realExecutor);
        assert.equal(r2.result.isError, false, r2.result.content[0].text);
        assert.deepEqual(JSON.parse(app.calls[0].body), {
            project_id: "p1",
            add_media: { "outro.mp4": { url: "https://x.test/outro.mp4" } },
            update_compositions: [{ composition_id: "b65d1", append_clips: [{ media: "outro.mp4" }] }]
        });
        restoreFetch();
        const raw = installMockFetch([{ status: 201, json: { job_id: "j3", drive_id: "d", project_id: "p1", project_url: "u" } }]);
        const update = [{ composition_id: "b65d1", append_clips: [{ media: "a.mp4", mute: true }] }];
        const r3 = await handleRpc({ jsonrpc: "2.0", id: 44, method: "tools/call", params: { name: "descript_import", arguments: {
                    project_id: "p1", media: JSON.stringify({ "a.mp4": { url: "https://x.test/a.mp4" } }), update_compositions: update, no_wait: true
                } } }, realExecutor);
        assert.equal(r3.result.isError, false, r3.result.content[0].text);
        assert.deepEqual(JSON.parse(raw.calls[0].body).update_compositions, update);
    }
    finally {
        if (prev === undefined)
            delete process.env.DESCRIPT_API_TOKEN;
        else
            process.env.DESCRIPT_API_TOKEN = prev;
        restoreFetch();
    }
});
test("descript_import through the MCP shim reports a library usage error as isError without calling the API", async () => {
    const { calls } = installMockFetch([{ status: 201, json: { job_id: "j", drive_id: "d" } }]);
    const prev = process.env.DESCRIPT_API_TOKEN;
    process.env.DESCRIPT_API_TOKEN = "t";
    try {
        const r = await handleRpc({ jsonrpc: "2.0", id: 45, method: "tools/call", params: { name: "descript_import", arguments: { library: true, url: "https://x.test/a.mp4", project_id: "p1" } } }, realExecutor);
        assert.equal(r.result.isError, true);
        assert.match(r.result.content[0].text, /--library cannot be combined with --project-id/);
        assert.equal(calls.length, 0);
    }
    finally {
        if (prev === undefined)
            delete process.env.DESCRIPT_API_TOKEN;
        else
            process.env.DESCRIPT_API_TOKEN = prev;
        restoreFetch();
    }
});
// =========================================================================
// descript_search (GET /search) - free, read-only. type, match and owner take
// a JSON array of strings or a comma-separated string.
// =========================================================================
const OWNER_A = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const OWNER_B = "9f36ee32-5a2c-47e7-b1a3-94991d3e3ddb";
test("descript_search turns array type, match and owner arguments into the CLI's comma-separated flags", () => {
    assert.deepEqual(argvOf("descript_search", { query: "quarterly update", type: ["project", "audio"], match: ["name", "content"], owner: [OWNER_A, OWNER_B] }), ["search", "quarterly update", "--type=project,audio", "--match=name,content", `--owner=${OWNER_A},${OWNER_B}`, "--json"]);
});
test("descript_search passes comma-separated string type, match and owner arguments through unchanged", () => {
    assert.deepEqual(argvOf("descript_search", { query: "crowns", type: "project,audio", match: "content", owner: `${OWNER_A},${OWNER_B}` }), ["search", "crowns", "--type=project,audio", "--match=content", `--owner=${OWNER_A},${OWNER_B}`, "--json"]);
});
test("descript_search accepts a single-element array and a single string value alike", () => {
    const want = ["search", "q", "--type=project_folder", "--json"];
    assert.deepEqual(argvOf("descript_search", { query: "q", type: ["project_folder"] }), want);
    assert.deepEqual(argvOf("descript_search", { query: "q", type: "project_folder" }), want);
});
test("descript_search leaves out empty, null and undefined list arguments", () => {
    assert.deepEqual(argvOf("descript_search", { query: "q", type: [], match: "", owner: null, sort: undefined }), ["search", "q", "--json"]);
});
test("descript_search forwards the scalar filters, in snake_case or kebab-case", () => {
    const want = ["search", "q", "--updated-after=2026-08-01", "--updated-before=2026-08-31T23:59:59Z", "--sort=newest", "--limit=10", "--json"];
    assert.deepEqual(argvOf("descript_search", { query: "q", updated_after: "2026-08-01", updated_before: "2026-08-31T23:59:59Z", sort: "newest", limit: 10 }), want);
    assert.deepEqual(argvOf("descript_search", { query: "q", "updated-after": "2026-08-01", "updated-before": "2026-08-31T23:59:59Z", sort: "newest", limit: 10 }), want);
});
test("descript_search keeps a multi-word query as one argument", () => {
    assert.deepEqual(argvOf("descript_search", { query: "how to prep a crown" }), ["search", "how to prep a crown", "--json"]);
});
test("descript_search rejects a missing query, a flag-looking query and an unknown argument", () => {
    assert.throws(() => argvOf("descript_search", {}), /missing required argument "query"/);
    assert.throws(() => argvOf("descript_search", { query: "" }), /missing required argument "query"/);
    assert.throws(() => argvOf("descript_search", { query: "--json" }), /cannot start with "--"/);
    assert.throws(() => argvOf("descript_search", { query: "q", folder_path: "x" }), /Unknown argument "folder_path"/);
    assert.throws(() => argvOf("descript_search", { query: "q", types: ["project"] }), /Unknown argument "types"/);
});
test("descript_search rejects list arguments that are not strings or arrays of strings", () => {
    for (const bad of [{ type: 5 }, { type: true }, { match: { name: true } }, { owner: [OWNER_A, 7] }, { type: [["project"]] }]) {
        assert.throws(() => argvOf("descript_search", { query: "q", ...bad }), /descript_search: (type|match|owner) must be/, JSON.stringify(bad));
    }
});
test("descript_search never runs the CLI when an argument is malformed", async () => {
    const never = async () => { throw new Error("CLI must not run"); };
    const cases = [
        [{}, /missing required argument "query"/],
        [{ query: "q", type: 5 }, /descript_search: type must be/],
        [{ query: "q", nope: 1 }, /Unknown argument "nope"/]
    ];
    for (const [args, message] of cases) {
        const r = await handleRpc({ jsonrpc: "2.0", id: 50, method: "tools/call", params: { name: "descript_search", arguments: args } }, never);
        assert.equal(r.result.isError, true, JSON.stringify(args));
        assert.match(r.result.content[0].text, message, JSON.stringify(args));
    }
});
test("descript_search is described as free and read-only, and names every enum", () => {
    const d = TOOLS.find((t) => t.name === "descript_search").description;
    assert.match(d, /free/i);
    assert.match(d, /read-only/i);
    assert.match(d, /query/);
    for (const v of ["project", "video", "image", "audio", "project_folder", "media_library_folder", "layout_pack", "name", "content", "relevance", "newest", "oldest"]) {
        assert.ok(d.includes(v), `description should mention ${v}`);
    }
    for (const a of ["type", "match", "owner", "updated_after", "updated_before", "sort", "limit"]) {
        assert.ok(d.includes(a), `description should mention ${a}`);
    }
    assert.match(d, /1-100/);
});
test("descript_search end to end - array arguments reach the API as repeated query keys and the response comes back as JSON", async () => {
    const body = { results: [{ type: "project", project_id: "p1", name: "Quarterly update", url: "https://web.descript.com/p1", updated_at: "2026-08-15T14:00:00.000Z" }] };
    const { calls } = installMockFetch([{ status: 200, json: body }]);
    const prev = process.env.DESCRIPT_API_TOKEN;
    process.env.DESCRIPT_API_TOKEN = "t";
    try {
        const r = await handleRpc({ jsonrpc: "2.0", id: 51, method: "tools/call", params: { name: "descript_search", arguments: {
                    query: "quarterly update", type: ["project", "audio"], match: "content", owner: [OWNER_A, OWNER_B], sort: "newest", limit: 5
                } } }, realExecutor);
        assert.equal(r.result.isError, false, r.result.content[0].text);
        assert.deepEqual(JSON.parse(r.result.content[0].text), body);
        const p = new URL(calls[0].url).searchParams;
        assert.equal(new URL(calls[0].url).pathname, "/v1/search");
        assert.equal(p.get("query"), "quarterly update");
        assert.deepEqual(p.getAll("type"), ["project", "audio"]);
        assert.deepEqual(p.getAll("match"), ["content"]);
        assert.deepEqual(p.getAll("owner"), [OWNER_A, OWNER_B]);
        assert.equal(p.get("sort"), "newest");
        assert.equal(p.get("limit"), "5");
    }
    finally {
        if (prev === undefined)
            delete process.env.DESCRIPT_API_TOKEN;
        else
            process.env.DESCRIPT_API_TOKEN = prev;
        restoreFetch();
    }
});
test("descript_search surfaces a CLI validation failure as isError without calling the API", async () => {
    const { calls } = installMockFetch([{ status: 200, json: { results: [] } }]);
    const prev = process.env.DESCRIPT_API_TOKEN;
    process.env.DESCRIPT_API_TOKEN = "t";
    try {
        const r = await handleRpc({ jsonrpc: "2.0", id: 52, method: "tools/call", params: { name: "descript_search", arguments: { query: "q", type: ["project", "dubbing"] } } }, realExecutor);
        assert.equal(r.result.isError, true);
        assert.match(r.result.content[0].text, /dubbing/);
        assert.equal(calls.length, 0);
    }
    finally {
        if (prev === undefined)
            delete process.env.DESCRIPT_API_TOKEN;
        else
            process.env.DESCRIPT_API_TOKEN = prev;
        restoreFetch();
    }
});
// =========================================================================
// descript_timeline (POST /jobs/export/timeline) - free, no share page. format
// is required; markers is a tri-state (true, false, or left out).
// =========================================================================
test("descript_timeline builds the CLI argv from every argument", () => {
    assert.deepEqual(argvOf("descript_timeline", {
        project_id: "p1", composition_id: "c1", format: "premiere", out: "/tmp/lesson.xml",
        markers: true, track_per_file: true, source_frame_rate: true, callback_url: "https://hooks.example.com/done", no_wait: true
    }), ["timeline", "p1", "c1", "--format=premiere", "--out=/tmp/lesson.xml", "--track-per-file", "--source-frame-rate", "--callback-url=https://hooks.example.com/done", "--no-wait", "--markers", "--json"]);
    assert.deepEqual(argvOf("descript_timeline", { project_id: "p1", format: "aaf", strip_spaces: true }), ["timeline", "p1", "--format=aaf", "--strip-spaces", "--json"]);
    assert.deepEqual(argvOf("descript_timeline", { project_id: "p1", format: "edl" }), ["timeline", "p1", "--format=edl", "--json"]);
});
test("descript_timeline accepts kebab-case argument names and treats false switches as absent", () => {
    assert.deepEqual(argvOf("descript_timeline", { project_id: "p1", format: "davinci_resolve", "source-frame-rate": true, "track-per-file": false, "no-wait": false }), ["timeline", "p1", "--format=davinci_resolve", "--source-frame-rate", "--json"]);
});
test("descript_timeline markers true becomes --markers, false becomes --no-markers, omitted adds neither", () => {
    assert.deepEqual(argvOf("descript_timeline", { project_id: "p1", format: "fcp", markers: true }), ["timeline", "p1", "--format=fcp", "--markers", "--json"]);
    assert.deepEqual(argvOf("descript_timeline", { project_id: "p1", format: "fcp", markers: false }), ["timeline", "p1", "--format=fcp", "--no-markers", "--json"]);
    for (const omitted of [{}, { markers: undefined }, { markers: null }]) {
        const argv = argvOf("descript_timeline", { project_id: "p1", format: "fcp", ...omitted });
        assert.deepEqual(argv, ["timeline", "p1", "--format=fcp", "--json"]);
    }
});
test("descript_timeline rejects a markers value that is not true or false", () => {
    for (const bad of ["yes", "true", 1, 0, [], {}]) {
        assert.throws(() => argvOf("descript_timeline", { project_id: "p1", format: "fcp", markers: bad }), /markers must be true or false/, JSON.stringify(bad));
    }
});
test("descript_timeline rejects a missing format and a missing project_id before the CLI runs", () => {
    assert.throws(() => argvOf("descript_timeline", { project_id: "p1" }), /missing required argument "format"/);
    assert.throws(() => argvOf("descript_timeline", { project_id: "p1", format: "" }), /missing required argument "format"/);
    assert.throws(() => argvOf("descript_timeline", { project_id: "p1", format: null }), /missing required argument "format"/);
    assert.throws(() => argvOf("descript_timeline", { format: "edl" }), /missing required argument "project_id"/);
    assert.throws(() => argvOf("descript_timeline", { project_id: "--json", format: "edl" }), /cannot start with "--"/);
});
test("descript_timeline rejects an unknown argument instead of ignoring it", async () => {
    assert.throws(() => argvOf("descript_timeline", { project_id: "p1", format: "edl", include_markers: true }), /Unknown argument "include_markers"/);
    assert.throws(() => argvOf("descript_timeline", { project_id: "p1", format: "edl", snap_frame_rates: false }), /Unknown argument "snap_frame_rates"/);
    const r = await handleRpc({ jsonrpc: "2.0", id: 60, method: "tools/call", params: { name: "descript_timeline", arguments: { project_id: "p1", format: "edl", create_track_per_file: true } } }, async () => { throw new Error("CLI must not run"); });
    assert.equal(r.result.isError, true);
    assert.match(r.result.content[0].text, /Unknown argument "create_track_per_file"/);
});
test("descript_timeline is described as free, share-page-free, and lists the six formats with their target apps", () => {
    const d = TOOLS.find((t) => t.name === "descript_timeline").description;
    assert.match(d, /no share page/i);
    assert.match(d, /no AI credits/i);
    assert.match(d, /save it locally/i);
    for (const f of ["edl", "sesx", "fcp", "premiere", "davinci_resolve", "aaf"])
        assert.ok(d.includes(f), `description should list ${f}`);
    for (const app of ["Reaper", "Audition", "Final Cut", "Premiere", "DaVinci Resolve", "Pro Tools", "Logic"])
        assert.ok(d.includes(app), `description should name ${app}`);
    for (const a of ["project_id", "composition_id", "format", "out", "markers", "track_per_file", "source_frame_rate", "strip_spaces", "callback_url", "no_wait"]) {
        assert.ok(d.includes(a), `description should mention ${a}`);
    }
    assert.match(d, /24 hours/);
});
test("descript_timeline end to end - submits, polls, downloads and saves the file, then reports it as JSON", async () => {
    const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join, resolve } = await import("node:path");
    const { installMockFetchByUrl } = await import("../helpers/mockFetch.js");
    const dir = mkdtempSync(join(tmpdir(), "descript-mcp-timeline-"));
    const out = join(dir, "sub", "lesson.edl");
    const storage = "https://storage.example.com/exports/timeline.edl?sig=abc";
    const submit = { job_id: "jt", drive_id: "d", drive_name: "iDD", project_id: "p1", project_url: "u", format: "edl" };
    const done = { job_id: "jt", job_type: "export/timeline", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p1", project_url: "u",
        result: { status: "success", composition_id: "c9", file_name: "timeline.edl", content_type: "text/plain", download_url: storage, download_url_expires_at: "2026-10-01T03:00:00.000Z" } };
    const { calls } = installMockFetchByUrl([
        { match: "/jobs/export/timeline", responses: [{ status: 201, json: submit }] },
        { match: "/jobs/jt", responses: [{ status: 200, json: done }] },
        { match: "storage.example.com", responses: [{ status: 200, text: "TITLE: x\n" }] }
    ]);
    const prev = process.env.DESCRIPT_API_TOKEN;
    process.env.DESCRIPT_API_TOKEN = "t";
    try {
        const r = await handleRpc({ jsonrpc: "2.0", id: 61, method: "tools/call", params: { name: "descript_timeline", arguments: { project_id: "p1", format: "edl", out, markers: false } } }, realExecutor);
        assert.equal(r.result.isError, false, r.result.content[0].text);
        const parsed = JSON.parse(r.result.content[0].text);
        assert.equal(parsed.ok, true);
        assert.equal(parsed.path, resolve(out));
        assert.equal(parsed.compositionId, "c9");
        assert.equal(readFileSync(out, "utf8"), "TITLE: x\n");
        assert.equal(JSON.parse(calls[0].body).include_markers, false);
        assert.equal(calls.find((c) => c.url.includes("storage.example.com")).headers["authorization"], undefined);
    }
    finally {
        if (prev === undefined)
            delete process.env.DESCRIPT_API_TOKEN;
        else
            process.env.DESCRIPT_API_TOKEN = prev;
        restoreFetch();
        rmSync(dir, { recursive: true, force: true });
    }
});
test("descript_timeline surfaces a CLI validation failure as isError without calling the API", async () => {
    const { calls } = installMockFetch([{ status: 201, json: { job_id: "jt" } }]);
    const prev = process.env.DESCRIPT_API_TOKEN;
    process.env.DESCRIPT_API_TOKEN = "t";
    try {
        const r = await handleRpc({ jsonrpc: "2.0", id: 62, method: "tools/call", params: { name: "descript_timeline", arguments: { project_id: "p1", format: "fcp", track_per_file: true } } }, realExecutor);
        assert.equal(r.result.isError, true);
        assert.match(r.result.content[0].text, /--track-per-file/);
        assert.equal(calls.length, 0);
    }
    finally {
        if (prev === undefined)
            delete process.env.DESCRIPT_API_TOKEN;
        else
            process.env.DESCRIPT_API_TOKEN = prev;
        restoreFetch();
    }
});
