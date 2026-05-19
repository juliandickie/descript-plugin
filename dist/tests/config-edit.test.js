import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configEdit } from "../src/cli/commands/config.js";
function cap() {
    const out = [];
    return { io: { stdout: (s) => out.push(s), stderr: (s) => out.push(s), json: false }, out };
}
function tmpCfg() {
    const dir = mkdtempSync(join(tmpdir(), "descript-cfg-"));
    return { dir, path: join(dir, "nested", "credentials.json"), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const noopEditor = () => { };
test("creates dir and a 0600 file with the skeleton when absent", () => {
    const t = tmpCfg();
    const c = cap();
    const code = configEdit({
        flags: { profile: "idd" }, io: c.io, env: {},
        configPath: t.path, spawnEditor: noopEditor, platform: "darwin"
    });
    assert.equal(code, 0);
    assert.ok(existsSync(t.path));
    assert.deepEqual(JSON.parse(readFileSync(t.path, "utf8")), {
        profiles: { idd: { api_token: "" } }, default_profile: "idd"
    });
    assert.equal(statSync(t.path).mode & 0o777, 0o600);
    t.cleanup();
});
