import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRpc, handleLine, TOOLS } from "../../src/mcp/server.js";

test("lists a tool per CLI surface", () => {
  const names = TOOLS.map((t) => t.name);
  for (const n of ["descript_status", "descript_import", "descript_agent", "descript_publish", "descript_jobs", "descript_projects", "descript_published", "descript_edit_in_descript", "descript_batch"]) {
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
    async (argv) => { assert.deepEqual(argv, ["status", "--json"]); return { code: 0, stdout: '{"status":"ok"}', stderr: "" }; }
  );
  assert.match(r!.result.content[0].text, /"status":"ok"/);
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
