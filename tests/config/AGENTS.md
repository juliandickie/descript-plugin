<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# config

## Purpose

Tests of credential resolution and the credentials file format. Hermetic, every test writes to a fresh tmpdir.

## Key Files

| File | Description |
|------|-------------|
| `credentials.test.ts` | The `resolveCredentials` function. Covers all four source paths (flag, env, file, plugin), precedence ordering, profile resolution, missing-token error, corrupt-file error, `DESCRIPT_CONFIG_PATH` override. |

## For AI Agents

### Working In This Directory

- All four token sources are tested in isolation and in combination. Adding a new source means a new precedence test.

- Tests must NOT touch the real `~/.config/descript/credentials.json`. Always pass `opts.configPath` or `opts.env.DESCRIPT_CONFIG_PATH` to a tmpdir.

- The `redactToken` helper is tested separately for boundary cases (length <= 4 returns `"***"`).

- Companion subcommand tests live one level up (`../config-set-list.test.ts`, `../config-edit.test.ts`) because they drive the CLI rather than the credential resolver. Keep that split.

### Common Patterns

- Tests build `env` objects literal-style rather than mutating `process.env`.

- File-mode assertions use `fs.statSync(path).mode & 0o777` to verify 0600 enforcement in the `config edit` tests one level up.

## Dependencies

### Internal

- `../../src/config/credentials.ts`.

### External

- `node:test`, `node:fs`, `node:os`, `node:path`.

<!-- MANUAL: -->
