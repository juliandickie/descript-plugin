<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# descript-download-published

## Purpose

Read-only companion to `descript-export`. Re-fetches the deliverables (MP4, SRT, Markdown) for previously-published compositions. No publish, no API write, no cost. The right entry point for chapter-generation iteration. Backs `descript download-published`.

## Key Files

| File | Description |
|------|-------------|
| `SKILL.md` | Skill manifest plus slug-input shapes (single, `--slugs`, `--report`) and format selection. |

## For AI Agents

### Working In This Directory

- Unrestricted. No `disable-model-invocation`, no confirmation gate. The endpoint only reads, no API write, no rendering, no cost.

- Three input shapes:
  - Single slug positional: `descript download-published <slug>`.
  - Multiple slugs: `descript download-published --slugs s1,s2,s3`.
  - From a prior report: `descript download-published --report /path/to/export-report.json`.

- The slug is the last path segment of a Descript share URL, after `/view/`.

- Default formats are `mp4,srt,md`. For chapter-generation iteration use `--formats md` to skip the MP4 download.

- Writes `download-report.json` to `<output-dir>` with the same shape as `export-report.json`. The closed loop with `--report` works in both directions.

### Common Patterns

- For "re-do that chapter prompt on the same transcript", run with `--formats md` against a saved report path.

- Filename sanitisation matches `descript-export` (see `src/workflows/filenameSanitize.ts`).

- Per-item failures isolate, errors are reported in the JSON output.

## Dependencies

### Internal

- `../../src/cli/commands/registry.ts` (`download-published` handler).

- `../../src/workflows/exportBatch.ts` (shared batch loop with `descript-export`).

### External

- Descript `/published_projects/{slug}` endpoint plus media CDN.

<!-- MANUAL: -->
