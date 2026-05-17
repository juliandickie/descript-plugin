import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRpc, TOOLS } from "../../src/mcp/server.js";

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
