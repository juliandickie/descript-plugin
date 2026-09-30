<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# cli

## Purpose

CLI argument parsing, output formatting, and the command dispatch surface. The single user-facing entrypoint for the plugin. Every skill and the MCP shim ultimately route through `runCli`.

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | `parseArgv` for flag/positional parsing, `runCli` for dispatch, the USAGE help string covering every command. Top-level entry called by `bin/descript` and `mcp/server.ts`. |
| `output.ts` | The `IO` interface (`stdout`, `stderr`, `json`) plus `emit` (text or JSON) and `fail` (error to stderr). All command output flows through these to keep behaviour testable. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `commands/` | The handlers for each command (see `commands/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- USAGE string in `index.ts` is the source of truth for what the CLI accepts. Update it whenever a command lands or a flag changes. The `descript-api-reference` skill mirrors this surface, keep them in lock-step.

- `runCli` accepts `RunOptions` for injectable `stdout` / `stderr` / `env`. Tests rely on this to avoid stdio side effects, do not bypass and call `process.stdout.write` directly inside command handlers.

- `parseArgv` is intentionally minimal. `--flag value`, `--flag=value`, `--flag` (boolean). Positional args go in `args`. No short flags. No support for negation (`--no-foo` is a literal flag name, the handler checks `flags["no-foo"] === true`).

- Exit codes are part of the contract. See parent `src/AGENTS.md` for the table.

### Output Conventions

- Human-readable strings to stdout by default.

- `--json` switches to a JSON line per call. Skills always pass `--json`.

- Errors and usage messages go to stderr via `fail()`.

## Dependencies

### Internal

- `./commands/registry.ts` for the command map.

- `./output.ts` everywhere.

### External

- None.

<!-- MANUAL: -->
