<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# mcp

## Purpose

Optional in-process MCP (Model Context Protocol) shim. Re-exposes the CLI commands as MCP tools so Claude can call them via JSON-RPC over stdin/stdout. The shim never duplicates API logic, it parses MCP requests, builds argv, and invokes `runCli` in the same process.

## Key Files

| File | Description |
|------|-------------|
| `server.ts` | The shim. `TOOLS` array (9 tools mirroring CLI subcommands), `passthrough()` helper that converts JSON args into CLI flag pairs, `realExecutor` that calls `runCli` and captures stdout/stderr, `handleRpc` (`initialize`, `tools/list`, `tools/call`), and the stdin line loop. |

## For AI Agents

### Working In This Directory

- The shim must re-use `runCli`. Never replicate argument-parsing or command logic. The whole point of the architecture is that the CLI is the single source of truth and the MCP shim is a thin protocol adapter.

- Tool list in `TOOLS` maps MCP arg objects to CLI argv arrays. Each entry has a `name` (with `descript_` prefix), `description`, and `argv(args)` builder. Most use the generic `passthrough` builder, a few have custom builders for subcommand routing (`jobs`, `projects`, `published`, `batch`).

- Every tool ends with `--json` so the MCP `content.text` is structured.

- `initialize` response advertises `protocolVersion: "2024-11-05"` and capabilities `{ tools: {} }`. Bump the protocol version only when MCP itself bumps.

- Tool errors set `result.isError: true` and put the error message in `content[0].text`. Method-not-found responses use the JSON-RPC error shape (`error.code: -32601`).

- Parse failures use `-32700` and notifications (requests without `id`) return `null` so nothing is written to stdout.

- The line loop reads stdin chunk by chunk and processes complete newline-delimited messages. Lines that fail to parse return a JSON-RPC parse-error. Keep this loop tight, it is the only I/O surface.

- Registration is in `../../.mcp.json` (`${CLAUDE_PLUGIN_ROOT}/dist/src/mcp/server.js`). After any change here, rebuild before testing.

### Common Patterns

- The `Executor` type lets tests inject a mock executor that returns fixed `{code, stdout, stderr}` without invoking the real CLI. See `../../tests/mcp/server.test.ts`.

- New tools land in `TOOLS` plus an argv builder. No registration anywhere else.

## Dependencies

### Internal

- `../cli/index.ts` (`runCli`).

### External

- Node `node:url` (`fileURLToPath`), `process.stdin` async iteration.

<!-- MANUAL: -->
