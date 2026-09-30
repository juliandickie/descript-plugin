<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# bin

## Purpose

A single thin shell entrypoint that delegates to the compiled CLI. Declared in `package.json` as `"bin": { "descript": "bin/descript" }`. After `npm install`, the `descript` command resolves here.

## Key Files

| File | Description |
|------|-------------|
| `descript` | 4-line Node shebang script. Imports `runCli` from `../dist/src/cli/index.js`, runs it with `process.argv.slice(2)`, exits with the returned status. |

## For AI Agents

### Working In This Directory

- The shim must stay minimal. All argument parsing, command dispatch, output, and error mapping live in `src/cli/`. If you find yourself adding logic here, it belongs in `src/cli/index.ts` instead.

- The shim imports from `../dist/`, not `../src/`. This is deliberate, the runtime user has no compiler. Anyone running the CLI from source must `npm run build` first.

- The file must be executable. After `chmod` resets (e.g. on cross-platform git checkout) re-mark it `chmod +x bin/descript`.

- Node 24 is required (`engines.node` in `package.json`). The shim uses top-level await which needs Node >=14, but other parts of the runtime rely on newer features.

## Dependencies

### Internal

- `../dist/src/cli/index.js` (built from `src/cli/index.ts`). The shim breaks if `dist/` is missing or stale.

### External

- Node runtime only.

<!-- MANUAL: -->
