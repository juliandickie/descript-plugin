# Descript Setup - Secure Token Configuration - Design

Date - 2026-05-19

Status - approved design, pending spec review

## Motivation

The current `descript-setup` skill (skills/descript-setup/SKILL.md) instructs the user to supply the API token so that `descript config set --token <TOKEN>` can be run. In practice this caused a live token to be pasted into a Claude conversation, where it is recorded in the transcript and must be treated as compromised. The root cause is a skill that routes a secret through the chat channel.

This work removes that pattern and replaces it with paths where the token never enters the conversation - a guided local edit, and a 1Password pull. It also corrects a now-stale verification instruction.

## Goals

1. The token never needs to be typed, pasted, or otherwise surfaced in a Claude conversation.

2. A non-technical user on macOS can complete setup safely, without hand-crafting JSON or mis-setting file permissions.

3. A 1Password path that pulls the token at setup time into the existing local store.

4. The skill explicitly forbids Claude from requesting, accepting, displaying, or running any command that contains the token.

5. Profiles remain first-class so multiple Drives (iDD, Pro Marketing, distribution entities) are supported on every path.

## Non-goals (explicitly out of scope)

1. Resolve-live 1Password (a config holding only an `op://` reference, resolved on every command). This was considered and declined in favour of pull-at-setup. It would require changing the credential-resolution core.

2. Any refactor of `resolveCredentials` or the credential-resolution architecture.

3. Fixing the pre-existing non-hermetic test defect in tests/cli/cli.test.ts. That is a separate, already-identified issue with its own decision pending.

4. Version bump, CHANGELOG, tag, commit, or push. Those remain under the standing scope-check rule and are decided separately.

## Dependency and sequencing

The reworked skill's verification step states the expected output of `descript status` as `Authenticated to Descript (...)`. That output only exists once the separately-pending status fix lands. This design assumes that fix lands first. If the status fix is dropped, the verification wording in Component 2 must revert to describe the raw `--json` body instead. This coupling is intentional and called out so the two changes are not silently entangled.

## Guardrail principle

The skill will carry an explicit, prominent instruction, in imperative form, directed at Claude - never request, accept, display, store, or run any command containing the Descript token. All token-bearing steps are performed by the user, in the user's own terminal or text editor. This principle is the actual fix for the incident and is load-bearing, not advisory.

## Component 1 - `descript config edit` subcommand

### Purpose

Get the user safely to a correctly-structured, correctly-permissioned credentials file in their own editor, so they can place the token themselves without it passing through chat or shell history.

### Location

`src/cli/commands/config.ts`, a new exported function `configEdit`, following the established shape of `configSet` and `configList` (same `emit` / `fail` helpers, same return-code conventions).

### Interface

```
export interface ConfigEditCtx {
  flags: Record<string, string | boolean>;
  io: IO;
  env: Record<string, string | undefined>;
  // injectable seams for tests; default to real implementations
  configPath?: string;
  spawnEditor?: (cmd: string, args: string[]) => void;
  platform?: NodeJS.Platform;
}
export function configEdit(ctx: ConfigEditCtx): number;
```

The injectable `configPath`, `spawnEditor`, and `platform` exist so the command is unit-testable without writing to the real home directory or launching a real editor. This also keeps the new tests hermetic by construction, so they do not add to the existing non-hermetic-test problem.

### Behaviour

1. Resolve the profile name from `--profile`, defaulting to `default`, matching `configSet`.

2. Resolve the config path - injected `configPath` if provided, else `defaultConfigPath()` which is `~/.config/descript/credentials.json`.

3. Ensure the parent directory exists (`mkdirSync` recursive).

4. If the file does not exist, write this skeleton with mode 0600 -

   ```
   {
     "default_profile": "<profile>",
     "profiles": { "<profile>": { "api_token": "" } }
   }
   ```

5. If the file exists, read and JSON-parse it. If the target profile is absent, add `{ "<profile>": { "api_token": "" } }` while preserving every existing profile and the existing `default_profile`. If the target profile is already present, its `api_token` is left exactly as-is, whether empty or non-empty - the user may be rotating and must see the current value, never have it silently cleared. In short, the command only ever creates a missing profile entry, it never mutates an existing one.

6. Unconditionally `chmodSync(path, 0o600)` after any write. This both enforces owner-only on a freshly created file and tightens any pre-existing file that was created with looser permissions. This closes the previously-identified weakness where Node applies the `writeFileSync` mode only on creation. Scope is strictly this one file.

7. Resolve the editor by precedence - `--editor <cmd>` flag, then `env.VISUAL`, then `env.EDITOR`, then platform default. Platform default - on darwin, `open` with args `["-t", path]` (the user's default text editor). On other platforms, if no `$VISUAL` or `$EDITOR`, fall back to `nano`.

8. Attempt to launch the editor via `spawnEditor`. Wrap in try/catch. Whether or not the launch succeeds, always print the file path and the next step. On launch failure, print an explicit "could not open an editor automatically, open this file manually" line with the path. The security-critical work (file exists, correct structure, 0600) is already done by this point, so a failed editor launch still leaves the user in a safe, recoverable state.

9. Never read, write, log, or echo the token. The command's output references the path and the profile only.

### Output

Human form, no token -

`Opening <path> in <editor>. Set the "api_token" value for profile "<profile>", then save and close. Verify with - descript status --profile <profile>`

JSON form (`--json`) - `{ "path": "<path>", "profile": "<profile>", "editor": "<editor>" }`.

### Return codes

`0` on success, including the editor-launch-failed-but-file-prepared case (the user is given a clear manual path and the file is safe). `configEdit` has no required arguments and therefore no usage-error path of its own. The existing registry-level `2` for an unknown `config` subcommand is unchanged.

### Wiring

In `src/cli/commands/registry.ts`, the `config` handler gains `if (sub === "edit") return configEdit({ flags: ctx.flags, io: ctx.io, env: ctx.env });`. The usage string for the `config` command is updated to `set|list|edit`.

## Component 2 - SKILL.md rework

The full replacement content for skills/descript-setup/SKILL.md -

```
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

Formatting note - the SKILL.md body uses hyphen separators rather than colons in headings, consistent with repository text-hygiene conventions.

## Component 3 - tests

New test file tests/config-edit.test.ts, node:test plus node:assert/strict, matching the existing test style. All cases use an injected temp `configPath` and a fake `spawnEditor`, so they are hermetic and never touch `~/.config` or spawn a real process.

Cases -

1. When the file is absent, creates the directory and a 0600 file containing the skeleton with the requested profile and an empty api_token.

2. When the file exists with other profiles, adds an empty entry for the new profile and preserves all existing profiles and default_profile.

3. When the target profile exists with a non-empty api_token, does not modify or clear it.

4. When the file exists with mode 0644, the file is tightened to 0600.

5. Editor precedence - `--editor` beats VISUAL, VISUAL beats EDITOR, and on darwin with none set the launcher is invoked as open with args -t and the path.

6. The token is never written or echoed - the fake editor launcher never receives a token, output contains no secret, and the on-disk api_token remains the empty string the command wrote.

7. When `spawnEditor` throws, the file is still correctly created and locked, the path is printed, and the return code is 0.

Each case follows red then green - the test is written and watched to fail before `configEdit` is implemented to satisfy it.

## Security considerations

1. The token never transits the conversation on any path.

2. Path B's one-liner places `$(op read ...)` in shell history, not the token, so terminal history is not a leak vector.

3. The credentials file is owner-only on every path, including correction of pre-existing loose permissions.

4. The guardrail in the skill is directed at Claude and is mandatory, not advisory.

## Risks

1. `open -t` on darwin returns immediately, so the user might run the verify step before saving. The skill sequences edit and verify as distinct steps and the verify step is explicit, which mitigates this. A user who verifies too early simply sees an auth failure and re-verifies.

2. The 1Password path depends on the user having the op CLI installed and signed in. The skill states this prerequisite explicitly.

3. The verification wording depends on the pending status fix, as noted in Dependency and sequencing.
