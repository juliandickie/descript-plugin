import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../../src/cli/index.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());

function capture() {
  const out: string[] = [];
  return { out, write: (s: string) => { out.push(s); } };
}

test("status command prints ok and exits 0", async () => {
  installMockFetch([{ status: 200, json: { status: "ok" } }]);
  const c = capture();
  const code = await runCli(["status", "--json"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: c.write, stderr: c.write });
  assert.equal(code, 0);
  assert.match(c.out.join(""), /"status": ?"ok"/);
});

test("missing token exits non-zero with a clear message", async () => {
  const c = capture();
  const code = await runCli(["status"], { env: {}, stdout: c.write, stderr: c.write });
  assert.notEqual(code, 0);
  assert.match(c.out.join(""), /No Descript API token/);
});

test("api error exits with code 3 and prints the hint", async () => {
  installMockFetch([{ status: 401, json: { error: "unauthorized", message: "bad token" } }]);
  const c = capture();
  const code = await runCli(["status"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: c.write, stderr: c.write });
  assert.equal(code, 3);
  assert.match(c.out.join(""), /descript-setup|token/i);
});

test("batch run without --confirm exits non-zero", async () => {
  const c = capture();
  const code = await runCli(["batch", "run", "/nonexistent.json"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: c.write, stderr: c.write });
  assert.notEqual(code, 0);
});

test("unknown command exits 2 with usage", async () => {
  const c = capture();
  const code = await runCli(["wat"], { env: {}, stdout: c.write, stderr: c.write });
  assert.equal(code, 2);
  assert.match(c.out.join(""), /Usage|Unknown command/);
});
