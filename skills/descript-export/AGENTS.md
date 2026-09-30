<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# descript-export

## Purpose

End-to-end export pipeline. Publishes one or many compositions, downloads the rendered media, converts the WebVTT subtitles into SRT and Markdown transcripts. Model-invocable with mandatory in-skill confirmation, because each invocation triggers one publish per composition (creates a hosted share URL). Backs `descript export`.

## Key Files

| File | Description |
|------|-------------|
| `SKILL.md` | Skill manifest plus scope-confirmation prompts (single composition, whole project, multi-project) and per-format guidance. |

## For AI Agents

### Working In This Directory

- The confirmation gate is mandatory. Each composition gets one publish call, which creates a share URL. Confirm scope and deliverables before invoking.

- Three input shapes:
  - Single: `descript export <project-id> <composition-id>`.
  - Whole project: `descript export <project-id>` (optionally narrow with `--composition-ids c1,c2`).
  - Multi-project: `descript export --projects pid1,pid2`.

- Default formats are `mp4,srt,md`. Skip with `--formats md` or `--formats srt,md` to save time and disk.

- The "just the transcripts" prompt requires explicit user choice. Descript renders the MP4 server-side regardless (no transcript-only publish path). Ask whether to download the MP4 now or skip and re-fetch later via `descript download-published <slug> --formats mp4`.

- Default concurrency is 5, empirically validated by `scripts/smoke/concurrency.ts`. Override with `--concurrency N` only for explicit reasons.

- Per-cue Markdown is the dense format for downstream chapter generation (~750 anchors on a 30-minute podcast). The default `END` marker can be omitted with `--no-end-marker` for human-readable transcript use cases.

- Every run writes `<output-dir>/export-report.json` with per-item slugs, titles, output paths. Save this for closed-loop iteration via `descript download-published --report <path>`.

### Common Patterns

- `--access-level private` is the recommended default for export workflows where nothing should leak.

- Per-item failures isolate, the batch keeps going. Check the report for `failed` items.

## Dependencies

### Internal

- `../../src/cli/commands/registry.ts` (`export` handler).

- `../../src/workflows/exportBatch.ts`, `../../src/workflows/exportPublished.ts`, `../../src/workflows/webvtt.ts`, `../../src/workflows/filenameSanitize.ts`.

- `../descript-publish/` (publish under the hood).

- `../descript-download-published/` (read-only companion).

### External

- Descript API `/jobs/publish` plus `/published_projects/{slug}` plus media CDN.

<!-- MANUAL: -->
