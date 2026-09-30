<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# workflows

## Purpose

Orchestration above the client. Each workflow composes multiple client calls into a higher-level outcome: submit-then-poll, three-step signed-URL upload, batch processing, end-to-end export with WebVTT-to-Markdown conversion. CLI commands call workflows, never the client directly (with the trivial exception of `status` and `jobs` reads).

## Key Files

| File | Description |
|------|-------------|
| `poll.ts` | `pollJob(getJob, id, opts?)`. Backoff loop polling `GET /jobs/{id}` until `job_state === "stopped"`. Used by every `*AndWait` workflow. |
| `importAndWait.ts` | Submit an import, poll, normalise the final job into `{ok, projectUrl, error}`. Also exports `normalizeImportJob` reused by `upload.ts`. |
| `editAndWait.ts` | Submit an agent edit, poll, normalise into `{ok, agentResponse, aiCreditsUsed, mediaSecondsUsed, error}`. Cost-reporting fields are mandatory in the output. |
| `publishAndWait.ts` | Submit a publish, poll, normalise into `{ok, shareUrl, downloadUrl, error}`. |
| `upload.ts` | The three-step direct-upload flow (signed-URL request, file PUT, import job submit). Used by `descript import --file`. |
| `batch.ts` | `parseManifest`, `planBatch`, `runBatch`. Validates the manifest, produces a dry-run plan, executes with `concurrency` workers. Rejects file sources at parse time (URL-only). Aggregates per-item outcomes. |
| `exportBatch.ts` | Shared batch loop for `descript export` and `descript download-published`. Per-item publish (or skip) + download + write. Writes `export-report.json` / `download-report.json` with the same shape. Default concurrency 5. |
| `exportPublished.ts` | Download one published composition's deliverables (MP4 + SRT + Markdown). Reads published metadata, fetches the rendered media, dispatches WebVTT conversion. |
| `webvtt.ts` | Parses Descript's WebVTT subtitles. Emits SRT (industry-standard) and per-cue Markdown with `[HH:MM:SS]` timestamps and optional `[HH:MM:SS] END` marker. The per-cue format is intentional, dense anchors for downstream LLM chapter generation. |
| `filenameSanitize.ts` | Applies the Drive-sync rules from Julian's global CLAUDE.md (drop `< > ? # % * : |`, replace `&` with "and", `/` and `\` with `-`, drop curly quotes, drop trademark glyphs, truncate to 200 chars, fall back to `untitled`). |

## For AI Agents

### Working In This Directory

- Workflows are stateless functions that take a `DescriptClient` (or a `getJob`-style function for poll) plus a request object, and return an outcome object. No classes, no shared state.

- The `*AndWait` shape is repeated three times for a reason. Each workflow:
  1. Submits via the client.
  2. Polls via `poll.ts`.
  3. Normalises the final job state into a domain object with an `ok` discriminator.

  Reuse this shape for any new async-job workflow.

- `exportBatch.ts` is shared between `descript export` (which publishes first) and `descript download-published` (which skips the publish step). Switch via the `command` parameter and the optional `publish` config.

- Concurrency: `exportBatch` and `batch.runBatch` both use a simple bounded-worker loop. Per-item failures isolate, the batch keeps going. Aggregated results contain per-item `ok` flags.

- WebVTT handling is custom (no library). The format is straightforward but Descript uses cue identifiers and `STYLE` blocks the parser tolerates. Per-cue Markdown output is the headline feature for chapter-generation iteration.

- Filename sanitisation is centralised in one module so the Drive-sync rules from Julian's global CLAUDE.md are applied uniformly to every file written to disk (downloaded media and report JSON).

### Common Patterns

- Outcomes use a discriminated `{ ok: true, ... } | { ok: false, error: string }` shape so the CLI can branch on success/failure without try/catch.

- Polling backoff is fixed, not adaptive. See `poll.ts` for the schedule.

- Reports (`export-report.json`, `download-report.json`) share a shape: `{ command, items: [{ slug, title, ok, paths, writtenFormats, failedFormats, error? }], succeeded, failed, ok }`. Identical shape so `--report` works in both directions.

## Dependencies

### Internal

- `../client/` for every API call.

### External

- `node:fs` (`mkdirSync`, `writeFileSync`, `createWriteStream`), `node:path`, `node:stream/promises` (`pipeline`).

<!-- MANUAL: -->
