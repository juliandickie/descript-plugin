<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# tests

## Purpose

Hermetic Node test suite. No live API calls, no real home-directory config, no real filesystem outside a tmpdir per test. Mirrors the `src/` shape so the test file for `src/<area>/<module>.ts` lives at `tests/<area>/<module>.test.ts`. Runs via `node --test` on the compiled JS.

## Key Files

| File | Description |
|------|-------------|
| `smoke.test.ts` | Sanity test, asserts the test runner is wired up. |
| `status.test.ts` | The `descript status` command, including the v0.2.0 "no undefined" output regression. |
| `config-set-list.test.ts` | The `config set` and `config list` subcommands. Tests profile creation, listing with redacted tokens, error on corrupt file. |
| `config-edit.test.ts` | The `config edit` subcommand. Tests 0600 enforcement, `$EDITOR` invocation, refusal to write token to stdout. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `cli/` | The CLI dispatch layer end-to-end (see `cli/AGENTS.md`). |
| `client/` | The typed HTTP client per endpoint group (see `client/AGENTS.md`). |
| `config/` | Credential resolution precedence (see `config/AGENTS.md`). |
| `helpers/` | Shared test helpers, primarily `mockFetch` (see `helpers/AGENTS.md`). |
| `mcp/` | The MCP shim's JSON-RPC handling (see `mcp/AGENTS.md`). |
| `workflows/` | Each orchestration module (see `workflows/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- Hermetic is the hard rule. Tests must not:
  - Touch the real `~/.config/descript/credentials.json` (override via `DESCRIPT_CONFIG_PATH` set to a `tmpdir()` path).
  - Read `DESCRIPT_API_TOKEN` from the real environment (pass a fresh `env` object).
  - Call `fetch` against any real URL (use `helpers/mockFetch.ts`).

- Tests use Node's built-in `node:test` runner, not `jest` or `vitest`. Assertions via `node:assert/strict`.

- The compile-then-run pattern: `npm test` runs `tsc -p tsconfig.json` first, then `node --test "dist/tests/**/*.test.js"`. The `.test.ts` source compiles to `.test.js` under `dist/tests/...`.

- Node 24 specifics: bare `node --test test/` is broken on Node 24 here (see Julian's memory). Always use the globbed form `node --test "dist/tests/**/*.test.js"`.

- Mock files live in `tests/helpers/`, not the directory under test. Reuse `mockFetch` rather than building per-test mocks.

### Common Patterns

- Inject IO via the `runCli` options object: `runCli(argv, { env, stdout, stderr })`. Capture stdout into a string buffer per test.

- Inject the fetch mock by setting `globalThis.fetch` at the top of the test and restoring in a `t.after` hook. `mockFetch` is the helper.

- Use `mkdtempSync(join(tmpdir(), "descript-test-"))` for any test that writes to disk.

- Assert exit codes from `runCli`, not from `process.exit` (the CLI never calls `process.exit` directly when invoked via `runCli`).

## Dependencies

### Internal

- Mirrors `../src/`.

- `../scripts/` is not exercised here (smoke tests are excluded).

### External

- `node:test`, `node:assert/strict`, `node:fs`, `node:os` (`tmpdir`), `node:path`.

<!-- MANUAL: -->
