<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# scripts

## Purpose

Developer-only utilities. Not shipped to plugin users, not part of the CLI surface, not run by `npm test`. Compiled to `dist/scripts/` by `npm run build` so they can be invoked through `node dist/scripts/.../something.js`.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `smoke/` | Live smoke tests against the real Descript API (see `smoke/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- Scripts here are TypeScript and follow the same `tsconfig.json` (strict, ES2023, nodenext). They get compiled alongside `src/` and `tests/`.

- Anything that calls the live Descript API must be opt-in via an `npm` script (so plugin users do not accidentally trigger paid operations). The existing pattern is `npm run smoke:concurrency`.

- Outputs (JSON results, logs) write to a subdirectory `results/` that is gitignored.

- Scripts must read the token through `resolveCredentials` from `src/config/credentials.ts`, not from a hard-coded env name, so the smoke harness honours the same flag/env/file/plugin precedence as the CLI.

### Adding a New Script

1. Place TS source under `scripts/<area>/<name>.ts`.

2. Reference compiled output `dist/scripts/<area>/<name>.js` from a new `npm` script.

3. Confirm the script does not run inside `npm test` (do not put it in a `*.test.ts` file, do not put it in the `dist/tests/**` glob).

4. Document in `CHANGELOG.md` under the next version's dev-tooling section.

## Dependencies

### Internal

- `../src/client/` for the HTTP client and types.

- `../src/config/credentials.ts` for token resolution.

### External

- Node runtime, no third-party packages.

<!-- MANUAL: -->
