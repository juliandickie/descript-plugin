<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# descript-import

## Purpose

Import media into Descript and create a project. URL imports, local-file uploads (three-step signed-URL flow handled automatically by the CLI), and full `add_media` + `add_compositions` shapes including multitrack. Backs `descript import`.

## Key Files

| File | Description |
|------|-------------|
| `SKILL.md` | Skill manifest plus URL, local-file, and full-shape command examples. |

## For AI Agents

### Working In This Directory

- Import is free of AI-credit cost. The skill is model-invocable without confirmation gates.

- Local-file uploads go through `--file <path>`. The CLI runs the three-step direct-upload flow under the hood (see `src/workflows/upload.ts`). Skills do not orchestrate the steps themselves.

- For URL imports use `--url`. For raw shapes (multitrack, mixed, multi-file) use `--media '<JSON>' --compositions '<JSON>'`.

- Async pipelines use `--no-wait` plus optional `--callback-url`. Without `--no-wait` the CLI polls to completion.

- `--team-access edit|comment|view|none` controls Drive sharing for new projects (enum-validated by the CLI).

### Common Patterns

- Recommend `--name` so projects have human-readable titles.

- `--content-type` defaults to `video/mp4`. Override for audio or other media (`audio/mpeg`, etc.).

- Output is the project URL on success (`Imported into <url>`) or a structured error.

## Dependencies

### Internal

- `../../src/cli/commands/registry.ts` (`import` handler).

- `../../src/workflows/importAndWait.ts` and `../../src/workflows/upload.ts` (orchestration).

### External

- Descript API `/jobs/import/project_media` endpoint.

<!-- MANUAL: -->
