# Descript Setup Secure Token Configuration - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `descript config edit` subcommand and rework the descript-setup skill so the API token is never routed through a Claude conversation.

**Architecture:** A new pure-ish CLI command in the existing `config` family creates and locks the credentials file then opens it in the user's editor, with injected seams (config path, editor launcher, platform) for hermetic tests. The skill is rewritten to document three no-chat paths plus a hard guardrail directed at Claude.

**Tech Stack:** TypeScript (NodeNext, strict), node:test, node:fs, node:child_process. Zero runtime dependencies.

---

## Commit gating - read before executing

The user has a standing rule - no commit, push, tag, or version bump without explicit per-commit approval, and the working tree already holds other un-approved changes (the status fix). Every "Commit" step below is therefore **gated**. At each commit step, stage only the exact paths listed, present the staged scope, and wait for explicit approval before running `git commit`. Do not bundle the status-fix files. Do not push or tag.

## Dependency

Task 4 (SKILL.md) writes a verification line that reads `Authenticated to Descript (...)`. That string only exists once the separately-pending status fix lands. If that fix has not landed when Task 4 runs, still write the line as specified - it is the intended end state - but flag in the commit-scope summary that it is correct only after the status fix merges.

## File Structure

- Modify `src/cli/commands/config.ts` - add `ConfigEditCtx` interface, `resolveEditor` helper, and `configEdit` function alongside the existing `configSet`/`configList`. Add `chmodSync` and `spawnSync` imports.

- Modify `src/cli/commands/registry.ts` - add the `edit` branch to the `config` dispatch, extend the import, update the inline usage string.

- Modify `src/cli/index.ts` - update the global USAGE line for `config` to include `edit`.

- Create `tests/config-edit.test.ts` - hermetic unit tests using an injected temp config path and a fake editor launcher.

- Modify `skills/descript-setup/SKILL.md` - full content replacement.

---

### Task 1: `configEdit` creates and locks a fresh credentials file

**Files:**
- Modify: `src/cli/commands/config.ts`
- Test: `tests/config-edit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/config-edit.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configEdit } from "../src/cli/commands/config.js";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build`
Expected: FAIL with `error TS2305` or `TS2307` - `configEdit` is not exported from `config.js`.

- [ ] **Step 3: Write minimal implementation**

In `src/cli/commands/config.ts`, change the `node:fs` import line and add a `node:child_process` import:

```typescript
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
```

Append to the end of `src/cli/commands/config.ts`:

```typescript
export interface ConfigEditCtx {
  flags: Record<string, string | boolean>;
  io: IO;
  env: Record<string, string | undefined>;
  configPath?: string;
  spawnEditor?: (cmd: string, args: string[]) => void;
  platform?: NodeJS.Platform;
}

function resolveEditor(
  flags: Record<string, string | boolean>,
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
  path: string
): { cmd: string; args: string[]; display: string } {
  const flag = typeof flags.editor === "string" ? flags.editor : undefined;
  const chosen = flag ?? env.VISUAL ?? env.EDITOR;
  if (chosen) return { cmd: chosen, args: [path], display: chosen };
  if (platform === "darwin") return { cmd: "open", args: ["-t", path], display: "open -t" };
  return { cmd: "nano", args: [path], display: "nano" };
}

export function configEdit(ctx: ConfigEditCtx): number {
  const profile = typeof ctx.flags.profile === "string" ? ctx.flags.profile : "default";
  const path = ctx.configPath ?? defaultConfigPath();
  const platform = ctx.platform ?? process.platform;
  const spawnEditor = ctx.spawnEditor ?? ((cmd: string, args: string[]) => {
    spawnSync(cmd, args, { stdio: "inherit" });
  });

  mkdirSync(dirname(path), { recursive: true });
  const existed = existsSync(path);
  const cfg: CfgFile = existed ? (JSON.parse(readFileSync(path, "utf8")) as CfgFile) : {};
  const profiles = cfg.profiles ?? {};
  let changed = !existed;
  if (!(profile in profiles)) { profiles[profile] = { api_token: "" }; changed = true; }
  cfg.profiles = profiles;
  if (cfg.default_profile === undefined) { cfg.default_profile = profile; changed = true; }
  if (changed) writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);

  const ed = resolveEditor(ctx.flags, ctx.env, platform, path);
  let launchFailed = false;
  try { spawnEditor(ed.cmd, ed.args); } catch { launchFailed = true; }

  const verify = `descript status --profile ${profile}`;
  const human = launchFailed
    ? `Prepared ${path} (profile "${profile}", owner-only). Could not open an editor automatically - open that file in your text editor, set the "api_token" value, save, then run: ${verify}`
    : `Opening ${path} in ${ed.display}. Set the "api_token" value for profile "${profile}", save and close, then run: ${verify}`;
  emit(ctx.io, human, { path, profile, editor: ed.display, launched: !launchFailed });
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test "dist/tests/config-edit.test.js"`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit (gated - stage only these paths, present scope, await approval)**

```bash
git add src/cli/commands/config.ts tests/config-edit.test.ts dist/src/cli/commands/config.js dist/tests/config-edit.test.js
git commit -m "feat(cli): add config edit - create and lock credentials file"
```

---

### Task 2: Preserve existing profiles and never mutate an existing entry

**Files:**
- Modify: `tests/config-edit.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/config-edit.test.ts`:

```typescript
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
```

Add this helper near the top of the file, after `tmpCfg`:

```typescript
import { mkdirSync as mkdirSyncFs } from "node:fs";
import { dirname } from "node:path";
function mkdirSyncFor(p: string) { mkdirSyncFs(dirname(p), { recursive: true }); }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test "dist/tests/config-edit.test.js"`
Expected: On a clean checkout these pass immediately because Task 1's implementation already preserves profiles. If either FAILS, fix `configEdit` per Task 1's code (the preservation logic is the `if (!(profile in profiles))` guard). This task exists to lock the preservation contract with explicit tests.

- [ ] **Step 3: Write minimal implementation**

No production change. The Task 1 implementation already satisfies these. If a failure occurred, the only acceptable fix is restoring the exact guard `if (!(profile in profiles)) { profiles[profile] = { api_token: "" }; changed = true; }` - never an unconditional assignment.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test "dist/tests/config-edit.test.js"`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit (gated)**

```bash
git add tests/config-edit.test.ts dist/tests/config-edit.test.js
git commit -m "test(cli): lock config edit profile-preservation contract"
```

---

### Task 3: Tighten loose permissions, editor precedence, no token leak, spawn-failure safety

**Files:**
- Modify: `tests/config-edit.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/config-edit.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test "dist/tests/config-edit.test.js"`
Expected: These pass against Task 1's implementation (chmod-always, resolveEditor precedence, try/catch around spawn, no token handling are all already implemented). If any FAILS, fix `configEdit`/`resolveEditor` to match Task 1's exact code - do not weaken an assertion. This task locks the security and robustness contract.

- [ ] **Step 3: Write minimal implementation**

No production change expected. Any fix must restore Task 1's exact `chmodSync(path, 0o600)` placement (unconditional, after the optional write), the `resolveEditor` precedence order, and the `try { spawnEditor(...) } catch { launchFailed = true; }` block.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build && node --test "dist/tests/config-edit.test.js"`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit (gated)**

```bash
git add tests/config-edit.test.ts dist/tests/config-edit.test.js
git commit -m "test(cli): lock config edit perms, editor precedence, no-leak, spawn-failure"
```

---

### Task 4: Wire `edit` into the CLI dispatch and usage strings

**Files:**
- Modify: `src/cli/commands/registry.ts:14` and the `config` handler
- Modify: `src/cli/index.ts` (USAGE block)
- Test: `tests/config-edit.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/config-edit.test.ts`:

```typescript
import { runCli } from "../src/cli/index.js";

test("descript config edit runs end to end and exits 0", async () => {
  const t = tmpCfg();
  // No real editor: force a non-darwin platform path is not available through runCli,
  // so set EDITOR to "true" (the /usr/bin/true no-op) to avoid opening anything.
  const out: string[] = [];
  const code = await runCli(["config", "edit", "--profile", "smoke"], {
    env: { EDITOR: "true", HOME: t.dir, XDG_CONFIG_HOME: join(t.dir, ".config") },
    stdout: (s) => out.push(s), stderr: (s) => out.push(s)
  });
  assert.equal(code, 0);
  assert.match(out.join(""), /Set the "api_token" value for profile "smoke"/);
  t.cleanup();
});

test("unknown config subcommand still exits 2 with set|list|edit usage", async () => {
  const out: string[] = [];
  const code = await runCli(["config", "wat"], { env: {}, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
  assert.equal(code, 2);
  assert.match(out.join(""), /set\|list\|edit/);
});
```

Note - the end-to-end test relies on `defaultConfigPath()` honoring `XDG_CONFIG_HOME`. `defaultConfigPath()` currently uses `os.homedir()` and ignores `XDG_CONFIG_HOME`, so this test would write under the real home. To keep it hermetic without changing credential resolution, change the first end-to-end test to assert through the injected path instead - replace its body with:

```typescript
test("descript config edit runs end to end and exits 0", async () => {
  const t = tmpCfg();
  const { configEdit: ce } = await import("../src/cli/commands/config.js");
  const out: string[] = [];
  const code = ce({ flags: { profile: "smoke" }, io: { stdout: (s) => out.push(s), stderr: (s) => out.push(s), json: false }, env: { EDITOR: "true" }, configPath: t.path, spawnEditor: () => {}, platform: "linux" });
  assert.equal(code, 0);
  assert.match(out.join(""), /Set the "api_token" value for profile "smoke"/);
  t.cleanup();
});
```

Keep the `unknown config subcommand` test as written - it does not touch the filesystem.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test "dist/tests/config-edit.test.js"`
Expected: FAIL - the `unknown config subcommand` test fails because the current usage string is `set|list`, not `set|list|edit`; and `config edit` is not dispatched.

- [ ] **Step 3: Write minimal implementation**

In `src/cli/commands/registry.ts`, line 14, extend the import:

```typescript
import { configSet, configList, configEdit } from "./config.js";
```

Replace the `config` handler body:

```typescript
  async config(ctx) {
    const sub = ctx.args[0];
    if (sub === "set") return configSet({ flags: ctx.flags, io: ctx.io });
    if (sub === "list") return configList({ flags: ctx.flags, io: ctx.io });
    if (sub === "edit") return configEdit({ flags: ctx.flags, io: ctx.io, env: ctx.env });
    fail(ctx.io, "Usage: descript config set|list|edit [--profile name] [--token value] [--editor cmd]");
    return 2;
  },
```

In `src/cli/index.ts`, in the `USAGE` template, replace the line:

```
  config set|list                Manage API token profiles
```

with:

```
  config set|list|edit           Manage API token profiles (edit opens the file in your editor)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS - full suite. Note - if the pre-existing non-hermetic `cli.test.ts` "missing token" test fails because a real `~/.config/descript/credentials.json` exists, that is the separately-tracked defect, not a regression from this task. Record it in the commit-scope summary, do not fix it here.

- [ ] **Step 5: Commit (gated)**

```bash
git add src/cli/commands/registry.ts src/cli/index.ts tests/config-edit.test.ts dist/src/cli/commands/registry.js dist/src/cli/index.js dist/tests/config-edit.test.js
git commit -m "feat(cli): dispatch config edit and update usage"
```

---

### Task 5: Rework the descript-setup skill

**Files:**
- Modify: `skills/descript-setup/SKILL.md` (full replacement)

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `skills/descript-setup/SKILL.md` with:

```markdown
---
name: descript-setup
description: Configure and verify the Descript API token. Use when the user wants to connect Descript, set an API token, switch Descript Drives or profiles, or when a Descript command failed with an auth error.
---

# Descript Setup

Configure the Descript API token securely and verify it.

## Token handling - mandatory

Never request, accept, display, store, or run any command that contains the
Descript API token. The token is the user's secret. Every step that touches
the token is performed by the user, in the user's own terminal or text
editor. If the user offers to paste the token into chat, decline and point
them at one of the paths below. A token that appears in conversation must be
treated as compromised and rotated.

## When to Use
- First-time Descript connection
- Switching between Drives (iDD, Pro Marketing, distribution entities) via profiles
- After a 401 unauthorized error from any Descript command
- NOT for running edits or imports (use the other descript skills)

## Get a token
A Descript token is created in Descript Settings, API tokens. It is scoped to
one Drive. Pick a profile name per Drive, for example idd, promarketing, or a
distribution entity.

## Path A - guided local edit (recommended)
Tell the user to run, in their own terminal -

  descript config edit --profile <name>

This creates the credentials file with the right structure and locks it to
owner-only, then opens it in their text editor. The user sets the api_token
value, saves, and closes. Then verify -

  descript status --profile <name>

Expect - Authenticated to Descript (drive ..., API v1). The token is never
shown to or handled by Claude.

## Path A fallback - by hand (macOS)
If the user prefers to edit manually -
1. Reveal hidden files - in Finder press Cmd+Shift+period, or use Go to
   Folder with Cmd+Shift+G and enter ~/.config/descript
2. Open credentials.json in a text editor and set the api_token for the
   profile under "profiles"
3. In Terminal, lock the file - chmod 600 ~/.config/descript/credentials.json
4. Verify - descript status --profile <name>

## Path B - 1Password
1. Store the token as a 1Password item, for example named "Descript API - iDD"
2. Copy its secret reference from 1Password, of the form
   op://<vault>/<item>/credential
3. The user runs, in their own terminal (1Password CLI installed and signed
   in with op signin) -

   descript config set --profile <name> --token "$(op read "op://<vault>/<item>/credential")"

   The token flows from 1Password through the op CLI into the local
   owner-only file. It never appears in chat. The literal token does not
   appear in shell history because the command stores the op reference, not
   the secret.
4. Verify - descript status --profile <name>

## Headless and automation
The same token works as DESCRIPT_API_TOKEN, or via the plugin api_token
config exported to the CLI as CLAUDE_PLUGIN_OPTION_API_TOKEN. Select a Drive
with --profile <name> or DESCRIPT_PROFILE. For 1Password-driven automation,
use op run or op read to populate DESCRIPT_API_TOKEN at invocation.

## Profiles
List configured profiles - descript config list. Each Drive gets its own
profile and, for Path B, its own 1Password item.
```

- [ ] **Step 2: Verify no stale verification text remains**

Run: `grep -n 'status":"ok"\|--token <TOKEN>' skills/descript-setup/SKILL.md`
Expected: no matches (the stale `{"status":"ok"}` instruction and the bare paste-the-token instruction are both gone).

- [ ] **Step 3: Verify the guardrail and three paths are present**

Run: `grep -n 'Token handling - mandatory\|Path A - guided local edit\|Path B - 1Password' skills/descript-setup/SKILL.md`
Expected: three matches.

- [ ] **Step 4: Commit (gated - note the status-fix dependency in the scope summary)**

```bash
git add skills/descript-setup/SKILL.md
git commit -m "docs(skill): rework descript-setup for no-chat token paths and guardrail"
```

State in the scope summary that the "Expect - Authenticated to Descript (...)" line is correct only once the pending status fix lands.

---

### Task 6: Full build and suite verification

**Files:** none (verification only)

- [ ] **Step 1: Clean build**

Run: `npm run clean && npm run build`
Expected: tsc exits 0, no type errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: All `config-edit.test.js` tests pass (9 tests across Tasks 1-4). Any failure isolated to the pre-existing non-hermetic `cli.test.ts` "missing token" case is the separately-tracked defect, not a regression - confirm by checking that `tests/config-edit.test.js` and `tests/status.test.js` are fully green.

- [ ] **Step 3: Manual smoke (optional, user-run only)**

The user, in their own terminal, may run `descript config edit --profile scratch` to confirm the editor opens the prepared file. Do not run this on the user's behalf with a real profile.

- [ ] **Step 4: Final scope summary**

Present the complete set of staged commits from Tasks 1-5, the status-fix dependency note, and the pre-existing-defect note. Await explicit approval before any push or tag. Do not version-bump or tag - that remains a separate decision.

---

## Self-Review

**Spec coverage:**

- Guardrail principle - Task 5 SKILL.md "Token handling - mandatory" block. Covered.

- Component 1 `configEdit` behaviour (profile default, path resolution, mkdir, skeleton, preserve, no-mutate, unconditional chmod 0600, editor precedence, spawn try/catch, no token echo, return 0) - Tasks 1-3. Covered.

- Component 1 wiring (registry dispatch, usage strings) - Task 4. Covered.

- Component 2 SKILL.md three paths + headless + profiles + corrected verification - Task 5. Covered.

- Component 3 tests, all seven spec cases hermetic - Tasks 1-3 (cases 1-7) plus Task 4 (dispatch). Covered.

- Non-goals (no resolveCredentials refactor, no fixing cli.test hermeticity, no version bump) - respected; Tasks 4 and 6 explicitly defer the pre-existing defect and the tag/bump.

- Dependency on status fix - flagged in header, Task 4 Step 4, Task 5 Step 4, Task 6 Step 4.

**Placeholder scan:** `<name>`, `<vault>`, `<item>` appear only inside the SKILL.md user-facing instruction content where they are intentional fill-ins, not plan gaps. No TBD/TODO/"handle edge cases" present. All code steps show complete code.

**Type consistency:** `ConfigEditCtx`, `configEdit`, `resolveEditor`, `CfgFile` (reused existing module-private interface), `spawnEditor(cmd, args)` signature, and the `{ path, profile, editor, launched }` emit payload are used identically across Tasks 1-4. `runCli` signature matches existing usage in `tests/cli/cli.test.ts`.
