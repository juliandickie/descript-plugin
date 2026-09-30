<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# commands

## Purpose

Per-command handlers wired into a registry. Each handler validates flags, builds a request, invokes the appropriate workflow or client method, and emits the result.

## Key Files

| File | Description |
|------|-------------|
| `registry.ts` | The `COMMANDS` map plus the `Ctx` interface and `mapError`. Hosts every handler: `status`, `config`, `import`, `agent`, `publish`, `jobs`, `projects`, `published`, `download-published`, `edit-in-descript`, `export`, `batch`. The largest file in the plugin and the single source of truth for command behaviour. |
| `config.ts` | `configSet`, `configList`, `configEdit`. Manages the on-disk credentials file. `configEdit` enforces 0600 permissions, refuses to render the token to stdout, and opens the file in `$EDITOR`. |
| `status.ts` | `formatStatus` plus the human-readable status renderer. Crash-safe on empty responses (see v0.2.0 changelog). |

## For AI Agents

### Working In This Directory

- New commands go in `registry.ts` under `COMMANDS[<name>]`. Keep handlers small, delegate orchestration to `../../workflows/`.

- Enum validation uses the `badEnum(ctx, flag, allowed)` helper. Invalid values fail at parse time with a clear error, before any network call (see v0.2.1 changelog for the `--access-level drive` enforcement).

- JSON file inputs use `readJsonFile(ctx, path)`. Returns `undefined` on failure (caller checks and returns 2).

- Flag parsing patterns:
  - String flag: `typeof ctx.flags.foo === "string" ? ctx.flags.foo : undefined`.
  - Boolean flag: `ctx.flags["no-wait"] === true`.
  - Comma-separated list: see `parseFormats` and the `--projects pid1,pid2` patterns.

- Don't catch `DescriptApiError` inside handlers. Let it bubble to `mapError` in `../index.ts#runCli`.

- Cost-bearing commands (`agent`) and risk-bearing commands (`publish`, `batch run`, `export`) rely on the skill layer for confirmation gating. The CLI itself only enforces `--confirm` on `batch run` and parse-time enum validation.

### Output

Always pass both a human string and the data object to `emit(ctx.io, text, data)`. The `IO` decides whether to print the text or the JSON, but the handler shouldn't branch on `--json`.

## Dependencies

### Internal

- `../../client/` for `DescriptClient`.

- `../../workflows/` for orchestration.

- `../../config/credentials.ts` for token resolution.

- `../output.ts` for `emit` and `fail`.

### External

- `node:fs` (`readFileSync`).

<!-- MANUAL: -->
