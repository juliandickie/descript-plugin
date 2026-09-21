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
  assert.equal(r!.result.serverInfo.name, "descript");
});

test("tools/list returns the tool array", async () => {
  const r = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, async () => ({ code: 0, stdout: "", stderr: "" }));
  assert.equal(r!.result.tools.length, TOOLS.length);
});

test("tools/call invokes the CLI and returns stdout", async () => {
  const r = await handleRpc(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "descript_status", arguments: {} } },
    async (argv) => { assert.deepEqual(argv, ["status", "--json"]); return { code: 0, stdout: '{"drive_name":"iDD"}', stderr: "" }; }
  );
  assert.match(r!.result.content[0].text, /"drive_name":"iDD"/);
});

test("notifications (no id) produce no response", async () => {
  const r = await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }, async () => ({ code: 0, stdout: "", stderr: "" }));
  assert.equal(r, null);
});

test("handleLine returns a JSON-RPC parse error for malformed input and does not throw", async () => {
  const out = await handleLine("{ not json", async () => ({ code: 0, stdout: "", stderr: "" }));
  assert.ok(out);
  const parsed = JSON.parse(out!);
  assert.equal(parsed.error.code, -32700);
  assert.equal(parsed.id, null);
});

test("unknown method returns JSON-RPC -32601", async () => {
  const r = await handleRpc({ jsonrpc: "2.0", id: 9, method: "resources/list", params: {} }, async () => ({ code: 0, stdout: "", stderr: "" }));
  assert.equal(r!.error!.code, -32601);
});

test("tools/call without a name returns JSON-RPC -32602", async () => {
  const r = await handleRpc({ jsonrpc: "2.0", id: 10, method: "tools/call", params: {} }, async () => ({ code: 0, stdout: "", stderr: "" }));
  assert.equal(r!.error!.code, -32602);
});

test("tools/call surfaces a nonzero CLI exit as isError", async () => {
  const r = await handleRpc(
    { jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "descript_status", arguments: {} } },
    async () => ({ code: 3, stdout: "", stderr: "bad token" })
  );
  assert.equal(r!.result.isError, true);
  assert.match(r!.result.content[0].text, /bad token/);
});

test("tools/call with non-object arguments returns JSON-RPC -32602", async () => {
  const r = await handleRpc(
    { jsonrpc: "2.0", id: 12, method: "tools/call", params: { name: "descript_status", arguments: "not-an-object" } },
    async () => ({ code: 0, stdout: "", stderr: "" })
  );
  assert.equal(r!.error!.code, -32602);
});

test("descript_transcript argv builder maps args to CLI flags", () => {
  const tool = TOOLS.find((t) => t.name === "descript_transcript")!;
  assert.deepEqual(
    tool.argv({ project_id: "p1", composition_id: "c1", format: "markdown", speaker_labels: "changes", markers: true }),
    ["transcript", "p1", "c1", "--format=markdown", "--speaker-labels=changes", "--markers", "--json"]
  );
  assert.deepEqual(
    tool.argv({ project_id: "p1", format: "docx", out: "/tmp/t.docx" }),
    ["transcript", "p1", "--format=docx", "--out=/tmp/t.docx", "--json"]
  );
});

test("descript_transcript maps a timecodes object onto the CLI timecode flags", () => {
  const tool = TOOLS.find((t) => t.name === "descript_transcript")!;
  assert.deepEqual(
    tool.argv({ project_id: "p1", composition_id: "c1", format: "markdown", timecodes: { on_paragraphs: true, on_speakers: true } }),
    ["transcript", "p1", "c1", "--format=markdown", "--timecodes-on-paragraphs", "--timecodes-on-speakers", "--json"]
  );
  assert.deepEqual(
    tool.argv({ project_id: "p1", format: "txt", timecodes: { frequency_seconds: 30, offset_seconds: -5, on_markers: true, on_paragraphs: false } }),
    ["transcript", "p1", "--format=txt", "--timecodes-every=30", "--timecodes-offset=-5", "--timecodes-on-markers", "--json"]
  );
});

test("descript_transcript end to end - the timecodes argument reaches the API request body", async () => {
  const { calls } = installMockFetch([{ status: 200, text: "[00:00:00] hi", headers: { "content-type": "text/markdown" } }]);
  const prev = process.env.DESCRIPT_API_TOKEN;
  process.env.DESCRIPT_API_TOKEN = "t";
  try {
    const r = await handleRpc(
      { jsonrpc: "2.0", id: 20, method: "tools/call", params: { name: "descript_transcript", arguments: {
        project_id: "p1", format: "markdown", timecodes: { frequency_seconds: 30, offset_seconds: -5, on_paragraphs: true, on_speakers: true } } } },
      realExecutor
    );
    assert.equal(r!.result.isError, false, r!.result.content[0].text);
    const body = JSON.parse(calls[0]!.body as string);
    assert.deepEqual(body.timecodes, { frequency_seconds: 30, offset_seconds: -5, on_paragraphs: true, on_speakers: true });
  } finally {
    if (prev === undefined) delete process.env.DESCRIPT_API_TOKEN; else process.env.DESCRIPT_API_TOKEN = prev;
    restoreFetch();
  }
});

test("descript_transcript rejects a malformed timecodes argument instead of ignoring it", async () => {
  const never = async () => { throw new Error("CLI must not run"); };
  for (const bad of [true, "on_paragraphs", ["on_paragraphs"], { on_paragraph: true }, { on_paragraphs: "yes" }, { frequency_seconds: "30" }]) {
    const r = await handleRpc(
      { jsonrpc: "2.0", id: 21, method: "tools/call", params: { name: "descript_transcript", arguments: { project_id: "p1", format: "txt", timecodes: bad } } },
      never
    );
    assert.equal(r!.result.isError, true, `expected an error for ${JSON.stringify(bad)}`);
    assert.match(r!.result.content[0].text, /timecodes/);
  }
});

test("descript_transcript rejects an unknown top-level argument instead of ignoring it", async () => {
  const r = await handleRpc(
    { jsonrpc: "2.0", id: 22, method: "tools/call", params: { name: "descript_transcript", arguments: { project_id: "p1", format: "txt", timecode: { on_paragraphs: true } } } },
    async () => { throw new Error("CLI must not run"); }
  );
  assert.equal(r!.result.isError, true);
  assert.match(r!.result.content[0].text, /Unknown argument "timecode"/);
});

test("descript_models argv builder", () => {
  const tool = TOOLS.find((t) => t.name === "descript_models")!;
  assert.deepEqual(tool.argv({}), ["models", "--json"]);
});

test("descript_translate argv builder", () => {
  const tool = TOOLS.find((t) => t.name === "descript_translate")!;
  assert.deepEqual(
    tool.argv({ project_id: "p1", composition_id: "c1", language: "French (Canada)", model: "claude-haiku" }),
    ["translate", "p1", "c1", "--language=French (Canada)", "--model=claude-haiku", "--json"]
  );
  assert.deepEqual(
    tool.argv({ project_id: "p1", language: "German" }),
    ["translate", "p1", "--language=German", "--json"]
  );
});

// =========================================================================
// Every tool rejects what it does not understand (2026-09-21 field note).
// An argument that is accepted and then dropped is the failure being guarded.
// =========================================================================

const argvOf = (name: string, args: Record<string, unknown>) => TOOLS.find((t) => t.name === name)!.argv(args);

test("descript_projects forwards list filters instead of dropping them", () => {
  assert.deepEqual(
    argvOf("descript_projects", { name: "FIS", folder_path: "Courses - Online", sort: "updated_at", direction: "desc", limit: 50 }),
    ["projects", "list", "--name=FIS", "--folder-path=Courses - Online", "--sort=updated_at", "--direction=desc", "--limit=50", "--json"]
  );
  assert.deepEqual(argvOf("descript_projects", { sub: "get", id: "p1" }), ["projects", "get", "p1", "--json"]);
});

test("descript_jobs forwards list filters instead of dropping them", () => {
  assert.deepEqual(
    argvOf("descript_jobs", { project_id: "p1", type: "agent", created_after: "2026-09-01T00:00:00Z", limit: 10 }),
    ["jobs", "list", "--project-id=p1", "--type=agent", "--created-after=2026-09-01T00:00:00Z", "--limit=10", "--json"]
  );
  assert.deepEqual(argvOf("descript_jobs", { sub: "cancel", id: "j1" }), ["jobs", "cancel", "j1", "--json"]);
});

test("descript_publish accepts snake_case and kebab-case and forwards access_level", () => {
  const want = ["publish", "--project-id=p1", "--composition-id=c1", "--access-level=private", "--json"];
  assert.deepEqual(argvOf("descript_publish", { project_id: "p1", composition_id: "c1", access_level: "private" }), want);
  assert.deepEqual(argvOf("descript_publish", { "project-id": "p1", "composition-id": "c1", "access-level": "private" }), want);
  assert.throws(() => argvOf("descript_publish", { project_id: "p1", "project-id": "p2" }), /given twice/);
});

test("descript_import serialises object arguments as JSON and drops false booleans", () => {
  assert.deepEqual(
    argvOf("descript_import", { url: "https://x.test/a.mp4", name: "A", compositions: [{ name: "Main" }], no_wait: false }),
    ["import", "--url=https://x.test/a.mp4", "--name=A", "--compositions=[{\"name\":\"Main\"}]", "--json"]
  );
  assert.deepEqual(argvOf("descript_agent", { project_id: "p1", prompt: "cut silences", no_wait: true }),
    ["agent", "--project-id=p1", "--prompt=cut silences", "--no-wait", "--json"]);
});

test("descript_batch and descript_published keep their positional shape", () => {
  assert.deepEqual(argvOf("descript_batch", { file: "m.json" }), ["batch", "plan", "m.json", "--json"]);
  assert.deepEqual(argvOf("descript_batch", { sub: "run", file: "m.json", confirm: true }), ["batch", "run", "m.json", "--confirm", "--json"]);
  assert.deepEqual(argvOf("descript_published", { slug: "abc123" }), ["published", "abc123", "--json"]);
});

test("every tool rejects an unknown argument before the CLI runs", async () => {
  const never = async () => { throw new Error("CLI must not run"); };
  const valid: Record<string, Record<string, unknown>> = {
    descript_published: { slug: "s" }, descript_batch: { file: "m.json" },
    descript_transcript: { project_id: "p1" }, descript_translate: { project_id: "p1", language: "German" }
  };
  for (const t of TOOLS) {
    const r = await handleRpc(
      { jsonrpc: "2.0", id: 30, method: "tools/call", params: { name: t.name, arguments: { ...(valid[t.name] ?? {}), definitely_not_an_option: 1 } } },
      never
    );
    assert.equal(r!.result.isError, true, `${t.name} accepted an unknown argument`);
    assert.match(r!.result.content[0].text, /Unknown argument "definitely_not_an_option"/, t.name);
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
  const samples: Array<[string, Record<string, unknown>]> = [
    ["descript_import", { url: "u", file: "f", media: "{}", name: "n", folder: "f", language: "en", project_id: "p", workspace: "w", compositions: [], content_type: "video/mp4", team_access: "view", callback_url: "c", no_wait: true, profile: "x" }],
    ["descript_agent", { prompt: "x", project_id: "p", project_name: "n", composition_id: "c", model: "m", team_access: "view", callback_url: "c", no_wait: true }],
    ["descript_publish", { project_id: "p", composition_id: "c", media_type: "Video", resolution: "1080p", access_level: "private", callback_url: "c", no_wait: true }],
    ["descript_transcript", { project_id: "p", format: "srt", out: "o", speaker_labels: "off", markers: true, timecodes: { on_paragraphs: true, on_speakers: true, on_markers: true, frequency_seconds: 5, offset_seconds: -1 } }]
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
  assert.equal(r!.result.serverInfo.version, pkg.version);
  assert.match(r!.result.serverInfo.version, /^\d+\.\d+\.\d+$/);
});

test("descript_publish end to end - no access_level means private in the API request", async () => {
  const { calls } = installMockFetch([{ status: 201, json: { job_id: "j1" } }]);
  const prev = process.env.DESCRIPT_API_TOKEN;
  process.env.DESCRIPT_API_TOKEN = "t";
  try {
    const r = await handleRpc(
      { jsonrpc: "2.0", id: 41, method: "tools/call", params: { name: "descript_publish", arguments: { project_id: "p1", composition_id: "c1", no_wait: true } } },
      realExecutor
    );
    assert.equal(r!.result.isError, false, r!.result.content[0].text);
    const body = JSON.parse(calls[0]!.body as string);
    assert.equal(body.access_level, "private");
    assert.equal(body.composition_id, "c1");
  } finally {
    if (prev === undefined) delete process.env.DESCRIPT_API_TOKEN; else process.env.DESCRIPT_API_TOKEN = prev;
    restoreFetch();
  }
});
