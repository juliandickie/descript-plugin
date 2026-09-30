<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# smoke

## Purpose

Live smoke tests against the real Descript API. These are not unit tests, they are diagnostic harnesses for empirically establishing API behaviour that cannot be derived from documentation, like concurrency ceilings and rate-limit handling.

## Key Files

| File | Description |
|------|-------------|
| `concurrency.ts` | Discovers the safe parallel-request ceiling for read-mode operations. Reads from the iDD test project, ramps concurrency through 1/2/3/5/7/10, reports 429 incidence. Empirically the default `--concurrency` of 5 in `descript export` was set from this script. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `results/` | Gitignored output directory. Empty placeholder with `.gitkeep`. |

## For AI Agents

### Working In This Directory

- Every script here costs real money OR triggers real API calls. Always read the script before running it. Never run a smoke script as part of automated agent work without explicit user approval.

- Read-mode smokes (concurrency, project listing) are safe to run repeatedly. Write-mode smokes (publish, agent) are not, gate them behind a `--confirm` flag and refuse to run without it.

- Results write to `./results/`, never to git-tracked paths. The `.gitignore` excludes the contents of that directory but keeps `.gitkeep`.

- The harness must call `resolveCredentials()` so token sources match the CLI.

### Running

```
npm run smoke:concurrency
```

Excluded from `npm test` and CI. Requires a configured Descript API token (any of the four sources accepted by `resolveCredentials`).

## Dependencies

### Internal

- `../../src/client/` (DescriptClient).

- `../../src/config/credentials.ts` (`resolveCredentials`).

### External

- Live Descript API.

<!-- MANUAL: -->
