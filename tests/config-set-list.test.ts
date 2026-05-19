import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { configSet, configList } from "../src/cli/commands/config.js";
import { runCli } from "../src/cli/index.js";

function mkdirFor(p: string) { mkdirSync(dirname(p), { recursive: true }); }

function cap() {
  const out: string[] = [];
  return { io: { stdout: (s: string) => out.push(s), stderr: (s: string) => out.push(s), json: false }, out };
}

function tmpCfg() {
  const dir = mkdtempSync(join(tmpdir(), "descript-cfg-set-list-"));
  return { dir, path: join(dir, "nested", "credentials.json"), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ---- configList: corrupt file ----

test("configList on a corrupt file returns 2, emits not valid JSON, does not throw, leaves file unchanged", () => {
  const t = tmpCfg();
  mkdirFor(t.path);
  const corruptContent = "{ broken";
  writeFileSync(t.path, corruptContent, { mode: 0o600 });
  const c = cap();
  let code: number | undefined;
  assert.doesNotThrow(() => {
    code = configList({ flags: {}, io: c.io, configPath: t.path });
  });
  assert.equal(code, 2);
  assert.ok(c.out.join("").match(/not valid JSON/), "expected 'not valid JSON' in output");
  assert.equal(readFileSync(t.path, "utf8"), corruptContent, "corrupt file must be left byte-for-byte unchanged");
  t.cleanup();
});

// ---- configSet: corrupt file ----

test("configSet with --token on a corrupt existing file returns 2, emits not valid JSON, does not throw, leaves file unchanged", () => {
  const t = tmpCfg();
  mkdirFor(t.path);
  const corruptContent = "{ broken";
  writeFileSync(t.path, corruptContent, { mode: 0o600 });
  const c = cap();
  let code: number | undefined;
  assert.doesNotThrow(() => {
    code = configSet({ flags: { token: "tok_test_123" }, io: c.io, configPath: t.path });
  });
  assert.equal(code, 2);
  assert.ok(c.out.join("").match(/not valid JSON/), "expected 'not valid JSON' in output");
  assert.equal(readFileSync(t.path, "utf8"), corruptContent, "corrupt file must be left byte-for-byte unchanged");
  t.cleanup();
});

// ---- Positive controls ----

test("configList on a valid file lists profiles and returns 0", () => {
  const t = tmpCfg();
  mkdirFor(t.path);
  writeFileSync(t.path, JSON.stringify({ default_profile: "idd", profiles: { idd: { api_token: "tok_123" }, promarketing: { api_token: "tok_456" } } }), { mode: 0o600 });
  const c = cap();
  let code: number | undefined;
  assert.doesNotThrow(() => {
    code = configList({ flags: {}, io: c.io, configPath: t.path });
  });
  assert.equal(code, 0);
  const combined = c.out.join("");
  assert.ok(combined.includes("idd"), "expected idd profile in output");
  assert.ok(combined.includes("promarketing"), "expected promarketing profile in output");
  t.cleanup();
});

test("configSet on a valid file (injected temp path) writes the profile and returns 0", () => {
  const t = tmpCfg();
  // file does not exist yet - configSet should create it
  const c = cap();
  let code: number | undefined;
  assert.doesNotThrow(() => {
    code = configSet({ flags: { token: "tok_test_456", profile: "idd" }, io: c.io, configPath: t.path });
  });
  assert.equal(code, 0);
  assert.ok(existsSync(t.path), "credentials file should have been created");
  const cfg = JSON.parse(readFileSync(t.path, "utf8"));
  assert.equal(cfg.profiles?.idd?.api_token, "tok_test_456");
  t.cleanup();
});

// ---- SYMMETRY: DESCRIPT_CONFIG_PATH must be honored by config list/set/edit ----
// This test is RED before the registry.ts fix and GREEN after.

test("DESCRIPT_CONFIG_PATH: config list reads from the env-override path, not defaultConfigPath()", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-cfgpath-sym-"));
  const credPath = join(dir, "creds.json");
  // Write a temp credentials file containing a uniquely-named sentinel profile
  // that cannot collide with any real ~/.config/descript content.
  writeFileSync(credPath, JSON.stringify({
    default_profile: "zz_sentinel_cfgpath",
    profiles: { zz_sentinel_cfgpath: { api_token: "tok_sentinel_abc123" } }
  }), { mode: 0o600 });

  const out: string[] = [];
  const code = await runCli(["config", "list"], {
    env: { DESCRIPT_CONFIG_PATH: credPath },
    stdout: (s) => out.push(s),
    stderr: (s) => out.push(s)
  });
  rmSync(dir, { recursive: true, force: true });

  assert.equal(code, 0, "config list should exit 0");
  const combined = out.join("");
  assert.ok(
    combined.includes("zz_sentinel_cfgpath"),
    `Expected sentinel profile 'zz_sentinel_cfgpath' in output, got: ${combined}`
  );
});
