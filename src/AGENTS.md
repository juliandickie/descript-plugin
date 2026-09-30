<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# src

## Purpose

TypeScript sources for the plugin. Five layers from top to bottom: CLI (argument parsing and command dispatch), workflows (orchestration layered above the client), client (typed HTTP wrapper around the Descript API), config (credential resolution), and MCP (optional in-process JSON-RPC shim re-exposing the CLI). The CLI is the single entrypoint, every other layer is called by it.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `cli/` | Argument parsing, output formatting, and the command registry (see `cli/AGENTS.md`). |
| `client/` | Typed HTTP client wrapping all 11 Descript API endpoints (see `client/AGENTS.md`). |
| `config/` | Credential resolution and the on-disk credentials file (see `config/AGENTS.md`). |
| `mcp/` | Optional in-process MCP shim that re-exposes the CLI as JSON-RPC tools (see `mcp/AGENTS.md`). |
| `workflows/` | Orchestration above the client (polling, signed-URL upload, batch, export, WebVTT-to-Markdown) (see `workflows/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- Layering rule: `cli/` depends on `workflows/` and `client/` and `config/`. `workflows/` depends on `client/`. `client/` depends on nothing else here. `mcp/` re-uses `cli/` in-process (it imports `runCli`). Never invert these dependencies, never inline workflow logic into client methods, never call the client directly from a CLI command (use a workflow).

- Zero runtime dependencies. Everything is Node 24 builtins (`node:fetch`, `node:fs`, `node:os`, `node:path`, `node:child_process`, `node:url`). Do not add an `npm` runtime dep.

- Strict TypeScript with `noUncheckedIndexedAccess`. Array and object indexed access yields `T | undefined`. Handle that explicitly.

- `verbatimModuleSyntax` is on. Use `import type` for type-only imports, ESM `.js` extensions in import paths (TypeScript resolves them against `.ts` sources, the output paths line up after compile).

- Module type is `nodenext`. The compiled output is ESM.

### Compilation

`npm run build` emits `dist/src/...` mirroring this tree. `bin/descript` imports from `dist/src/cli/index.js`, `.mcp.json` references `dist/src/mcp/server.js`. Both break if the build is stale.

### Common Patterns

- All commands return an exit code (`Promise<number>`). 0 success, 2 usage error, 3 API error (`DescriptApiError`), 4 operation failure, 1 unexpected. See `cli/commands/registry.ts#mapError`.

- All HTTP errors come through `DescriptApiError` from `client/errors.ts`. Includes a `hint` field with user-actionable guidance.

- All workflows that wait for a job to complete take the same shape: submit, poll, normalise the final job into an outcome object. See `workflows/importAndWait.ts`, `workflows/editAndWait.ts`, `workflows/publishAndWait.ts`.

## Dependencies

### Internal

- All four sibling layers reach each other through the rules above.

- `../bin/descript` consumes the compiled CLI.

- `../tests/` mirror this tree.

### External

- Node 24 builtins only.

<!-- MANUAL: -->
