<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# cli

## Purpose

End-to-end tests of the CLI dispatch layer. Drives `runCli` with full argv arrays, asserts exit codes and captured stdout/stderr. Covers usage errors, enum validation (including the parse-time `--access-level drive` rejection), and successful command paths against `mockFetch`.

## Key Files

| File | Description |
|------|-------------|
| `cli.test.ts` | The largest test file in the suite (~429 lines). Covers every command in the CLI registry. Asserts both human and `--json` output, exit codes, enum rejection messages, and JSON-input validation. |

## For AI Agents

### Working In This Directory

- New CLI command? Add a section to `cli.test.ts` covering at minimum: success path (with mock), missing-required-flag path (exit 2), bad-enum path (exit 2).

- Use `mockFetch` from `../helpers/mockFetch.ts`. Set up the queue of expected requests/responses, run the command, verify the queue is empty.

- Capture IO via `runCli(argv, { stdout: s => stdoutBuf += s, stderr: s => stderrBuf += s })`. Always pass a fresh `env` object so tests don't pick up the developer's token.

- The CLI never throws from `runCli`. Errors map to exit codes 1/2/3/4. Assert exit code first, then content.

- The CLI tests do not exercise the workflow layer directly. For workflow-internal behaviour (e.g. backoff timing, WebVTT parsing), use the targeted test in `../workflows/`.

### Common Patterns

- Tests are independent. Each sets up its own mock and tmpdir if needed.

- Avoid asserting against raw stdout text where possible. Pass `--json` and assert against the parsed JSON object.

## Dependencies

### Internal

- `../../src/cli/index.ts` (`runCli`).

- `../helpers/mockFetch.ts`.

### External

- `node:test`, `node:assert/strict`.

<!-- MANUAL: -->
