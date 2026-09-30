<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# mcp

## Purpose

Tests of the MCP shim's JSON-RPC handling. Asserts the `initialize`, `tools/list`, and `tools/call` paths plus parse-error and unknown-method paths.

## Key Files

| File | Description |
|------|-------------|
| `server.test.ts` | `handleRpc` and `handleLine` exercised against a fake executor that returns canned `{code, stdout, stderr}` rather than invoking the real CLI. Covers the protocol layer in isolation. |

## For AI Agents

### Working In This Directory

- These tests use a mock `Executor` (the type exported from `src/mcp/server.ts`). Do not exercise `runCli` directly here, that is what `tests/cli/cli.test.ts` is for.

- Cover (1) every tool in `TOOLS` is callable with sensible default args, (2) `isError: true` is set when the executor returns a non-zero code, (3) notifications (no `id`) produce no response, (4) parse errors produce `-32700`, (5) unknown methods produce `-32601`.

- Protocol-version assertion locks the value reported by `initialize`. Bump in lock-step with the shim.

### Common Patterns

- Use `Object.freeze` on canned executor responses so tests can assert against the same object the shim mutates.

## Dependencies

### Internal

- `../../src/mcp/server.ts`.

### External

- `node:test`, `node:assert/strict`.

<!-- MANUAL: -->
