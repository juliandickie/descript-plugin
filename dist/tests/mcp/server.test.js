import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRpc, handleLine, realExecutor, TOOLS } from "../../src/mcp/server.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";
test("lists a tool per CLI surface", () => {
    const names = TOOLS.map((t) => t.name);
    for (const n of ["descript_status", "descript_import", "descript_agent", "descript_publish", "descript_jobs", "descript_projects", "descript_published", "descript_edit_in_descript", "descript_batch", "descript_models", "descript_transcript", "descript_translate"]) {
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
    assert.deepEqual(tool.argv({ project_id: "p1", composition_id: "c1", format: "markdown", speaker_labels: "changes", markers: true }), ["transcript", "p1", "c1", "--format", "markdown", "--speaker-labels", "changes", "--markers", "--json"]);
    assert.deepEqual(tool.argv({ project_id: "p1", format: "docx", out: "/tmp/t.docx" }), ["transcript", "p1", "--format", "docx", "--out", "/tmp/t.docx", "--json"]);
});
test("descript_transcript maps a timecodes object onto the CLI timecode flags", () => {
    const tool = TOOLS.find((t) => t.name === "descript_transcript");
    assert.deepEqual(tool.argv({ project_id: "p1", composition_id: "c1", format: "markdown", timecodes: { on_paragraphs: true, on_speakers: true } }), ["transcript", "p1", "c1", "--format", "markdown", "--timecodes-on-paragraphs", "--timecodes-on-speakers", "--json"]);
    assert.deepEqual(tool.argv({ project_id: "p1", format: "txt", timecodes: { frequency_seconds: 30, offset_seconds: -5, on_markers: true, on_paragraphs: false } }), ["transcript", "p1", "--format", "txt", "--timecodes-every", "30", "--timecodes-offset", "-5", "--timecodes-on-markers", "--json"]);
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
    assert.deepEqual(tool.argv({ project_id: "p1", composition_id: "c1", language: "French (Canada)", model: "claude-haiku" }), ["translate", "p1", "c1", "--language", "French (Canada)", "--model", "claude-haiku", "--json"]);
    assert.deepEqual(tool.argv({ project_id: "p1", language: "German" }), ["translate", "p1", "--language", "German", "--json"]);
});
