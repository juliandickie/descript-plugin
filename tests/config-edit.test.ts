import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { mkdirSync as mkdirSyncFs } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { configEdit } from "../src/cli/commands/config.js";

function mkdirSyncFor(p: string) { mkdirSyncFs(dirname(p), { recursive: true }); }

function cap() {
  const out: string[] = [];
  return { io: { stdout: (s: string) => out.push(s), stderr: (s: string) => out.push(s), json: false }, out };
}
function tmpCfg() {
  const dir = mkdtempSync(join(tmpdir(), "descript-cfg-"));
  return { dir, path: join(dir, "nested", "credentials.json"), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const noopEditor = () => {};

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

test("adds a new profile while preserving existing profiles and default_profile", () => {
  const t = tmpCfg();
  mkdirSyncFor(t.path);
  writeFileSync(t.path, JSON.stringify({ default_profile: "idd", profiles: { idd: { api_token: "SECRET" } } }), { mode: 0o600 });
  const c = cap();
  const code = configEdit({
    flags: { profile: "promarketing" }, io: c.io, env: {},
    configPath: t.path, spawnEditor: noopEditor, platform: "darwin"
  });
  assert.equal(code, 0);
  const cfg = JSON.parse(readFileSync(t.path, "utf8"));
  assert.equal(cfg.profiles.idd.api_token, "SECRET");
  assert.equal(cfg.profiles.promarketing.api_token, "");
  assert.equal(cfg.default_profile, "idd");
  t.cleanup();
});

test("does not modify or clear an existing target profile token", () => {
  const t = tmpCfg();
  mkdirSyncFor(t.path);
  writeFileSync(t.path, JSON.stringify({ default_profile: "idd", profiles: { idd: { api_token: "SECRET" } } }), { mode: 0o600 });
  const c = cap();
  const code = configEdit({
    flags: { profile: "idd" }, io: c.io, env: {},
    configPath: t.path, spawnEditor: noopEditor, platform: "darwin"
  });
  assert.equal(code, 0);
  assert.equal(JSON.parse(readFileSync(t.path, "utf8")).profiles.idd.api_token, "SECRET");
  t.cleanup();
});

test("tightens an existing 0644 file to 0600", () => {
  const t = tmpCfg();
  mkdirSyncFor(t.path);
  writeFileSync(t.path, JSON.stringify({ default_profile: "idd", profiles: { idd: { api_token: "SECRET" } } }));
  chmodSync(t.path, 0o644);
  const c = cap();
  configEdit({ flags: { profile: "idd" }, io: c.io, env: {}, configPath: t.path, spawnEditor: noopEditor, platform: "darwin" });
  assert.equal(statSync(t.path).mode & 0o777, 0o600);
  t.cleanup();
});

test("editor precedence: --editor over VISUAL over EDITOR, darwin default is open -t", () => {
  const t = tmpCfg();
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const spy = (cmd: string, args: string[]) => { calls.push({ cmd, args }); };

  configEdit({ flags: { profile: "p", editor: "vim" }, io: cap().io, env: { VISUAL: "code", EDITOR: "emacs" }, configPath: t.path, spawnEditor: spy, platform: "linux" });
  assert.deepEqual(calls[0], { cmd: "vim", args: [t.path] });

  configEdit({ flags: { profile: "p" }, io: cap().io, env: { VISUAL: "code", EDITOR: "emacs" }, configPath: t.path, spawnEditor: spy, platform: "linux" });
  assert.deepEqual(calls[1], { cmd: "code", args: [t.path] });

  configEdit({ flags: { profile: "p" }, io: cap().io, env: { EDITOR: "emacs" }, configPath: t.path, spawnEditor: spy, platform: "linux" });
  assert.deepEqual(calls[2], { cmd: "emacs", args: [t.path] });

  configEdit({ flags: { profile: "p" }, io: cap().io, env: {}, configPath: t.path, spawnEditor: spy, platform: "darwin" });
  assert.deepEqual(calls[3], { cmd: "open", args: ["-t", t.path] });
  t.cleanup();
});

test("never writes or echoes a token; existing token stays intact", () => {
  const t = tmpCfg();
  mkdirSyncFor(t.path);
  const SENTINEL = "TOPSECRET-do-not-leak";
  writeFileSync(t.path, JSON.stringify({ default_profile: "idd", profiles: { idd: { api_token: SENTINEL } } }), { mode: 0o600 });
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const spy = (cmd: string, args: string[]) => { calls.push({ cmd, args }); };
  const c = cap();
  configEdit({ flags: { profile: "newp" }, io: c.io, env: {}, configPath: t.path, spawnEditor: spy, platform: "darwin" });
  assert.ok(!c.out.join("").includes(SENTINEL), "output leaked the token");
  assert.ok(!calls.some(k => k.args.join(" ").includes(SENTINEL)), "editor args leaked the token");
  assert.equal(JSON.parse(readFileSync(t.path, "utf8")).profiles.idd.api_token, SENTINEL);
  t.cleanup();
});

test("spawn failure still leaves a correct 0600 file, prints path, returns 0", () => {
  const t = tmpCfg();
  const c = cap();
  const code = configEdit({
    flags: { profile: "idd" }, io: c.io, env: {},
    configPath: t.path, spawnEditor: () => { throw new Error("no editor"); }, platform: "darwin"
  });
  assert.equal(code, 0);
  assert.equal(statSync(t.path).mode & 0o777, 0o600);
  assert.ok(c.out.join("").includes(t.path));
  assert.ok(c.out.join("").includes("Could not open an editor"));
  t.cleanup();
});

test("corrupt credentials.json returns 2 with clear message and leaves file unchanged", () => {
  const t = tmpCfg();
  mkdirSyncFor(t.path);
  const corruptContent = "{ broken";
  writeFileSync(t.path, corruptContent, { mode: 0o600 });
  const c = cap();
  let code: number | undefined;
  assert.doesNotThrow(() => {
    code = configEdit({
      flags: { profile: "idd" }, io: c.io, env: {},
      configPath: t.path, spawnEditor: noopEditor, platform: "darwin"
    });
  });
  assert.equal(code, 2);
  assert.ok(c.out.join("").match(/not valid JSON/), "expected 'not valid JSON' in output");
  assert.equal(readFileSync(t.path, "utf8"), corruptContent, "corrupt file must be left byte-for-byte unchanged");
  t.cleanup();
});

test("descript config edit runs end to end and exits 0", async () => {
  const t = tmpCfg();
  const { configEdit: ce } = await import("../src/cli/commands/config.js");
  const out: string[] = [];
  const code = ce({ flags: { profile: "smoke" }, io: { stdout: (s: string) => out.push(s), stderr: (s: string) => out.push(s), json: false }, env: { EDITOR: "true" }, configPath: t.path, spawnEditor: () => {}, platform: "linux" });
  assert.equal(code, 0);
  assert.match(out.join(""), /Set the "api_token" value for profile "smoke"/);
  t.cleanup();
});

test("unknown config subcommand still exits 2 with set|list|edit usage", async () => {
  const { runCli } = await import("../src/cli/index.js");
  const out: string[] = [];
  const code = await runCli(["config", "wat"], { env: {}, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
  assert.equal(code, 2);
  assert.match(out.join(""), /set\|list\|edit/);
});
