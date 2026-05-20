# Changelog

## 0.3.0 - 2026-05-20
- New `descript export <project-id> [composition-id]` command. Publishes one or many compositions (single composition, all compositions in a project, or fan-out across multiple projects via `--projects pid1,pid2`), then downloads the rendered media and writes SRT and Markdown transcripts from the WebVTT subtitles. The Markdown matches the field report's Section 5 format (per-cue paragraphs, `[HH:MM:SS]` timestamps, speaker label on speaker change, optional `[HH:MM:SS] END` marker via the default).

- New `descript download-published <slug>` command. Read-only companion that re-fetches the deliverables for a previously-published composition. Accepts a single slug, `--slugs s1,s2,...`, or `--report <path>` to read slugs back from a prior `export-report.json`. No publish, no API write, no cost. Right entry point for chapter-generation iteration.

- Every run writes `<output-dir>/export-report.json` or `download-report.json` containing per-item slugs, titles, output paths, written formats, and failed formats. Single-composition runs produce the same report shape as multi-composition runs so the closed loop with `--report` works uniformly.

- `--formats mp4,srt,md` flag (default all three). Skip formats to save time and disk - `--formats md` for chapter-gen iteration skips the MP4 download entirely. `--no-end-marker` omits the `[HH:MM:SS] END` line from Markdown for human-readable transcript use cases.

- `--concurrency N` flag with default 5, set empirically via the new `npm run smoke:concurrency` dev script (read-mode smoke against the iDD test project cleared 1, 2, 3, 5, 7, 10 with zero 429s; bottleneck above 5 is server latency, not rate-limit). Per-item failures isolate; the batch keeps going and the report identifies what failed.

- Filename and folder sanitisation per the project's Drive-sync rules - drops `< > ? # % * : |`, replaces `&` with "and", `/` and `\` with `-`, normalises curly quotes to straight, drops trademark glyphs, truncates to 200 chars. Empty-after-sanitise falls back to `untitled`.

- Two new skills - `descript-export` (model-invocable with mandatory in-skill confirmation, matching the `descript-edit` pattern) and `descript-download-published` (read-only and unrestricted).

- New `npm run smoke:concurrency` dev script for empirically discovering Descript's rate-limit ceiling. Excluded from `npm test` and CI.

## 0.2.1 - 2026-05-20
- Removed `drive` from the `--access-level` enum on `descript publish` and from the batch manifest's `publish.access_level` type. The value was rejected by the Descript API on every Drive tested (the API allows only `public`, `unlisted`, `private`) and Descript's web UI exposes only those three options. The CLI now fails fast at parse time with a clear error instead of after a network round-trip.

- Corrected cost-claim language in `CLAUDE.md` and the `descript-publish` and `descript-batch` skills. Publish is not billable on standard Descript plans (it creates a hosted share URL, which is a risk concern, not a cost concern). Batch is conditionally billable, only when a manifest includes items with `agent_prompt`. Pure import-and-publish batches are not themselves billable; the dry-run gate remains mandatory for risk reasons regardless.

- Kept `drive` in the `PublishedProjectMetadata.privacy` response union, since the API may return that value on previously published items even though it no longer accepts it on new publish requests.

- Added a hermetic CLI test asserting that `--access-level drive` is rejected locally without an API call (mirrors the existing `--resolution` rejection test).

## 0.2.0 - 2026-05-19
- New `descript config edit` subcommand. Creates and locks (0600) the credentials file and opens it in your editor, so the API token never passes through chat.

- Reworked the `descript-setup` skill with a mandatory guardrail against handling the token in chat, plus three secure setup paths (guided edit, manual hidden-folder edit, 1Password pull).

- Fixed `descript status` printing "undefined" against the live `/status` endpoint. It now reports an authenticated confirmation and is crash-safe on empty responses. The `--json` output is unchanged.

- `config set`, `config list`, and `config edit` now fail with a clear message instead of crashing when `credentials.json` is corrupt.

- Added `DESCRIPT_CONFIG_PATH` to point the CLI at an alternate credentials file, honored consistently by token resolution and the config commands.

- Test suite hardened to be hermetic, with no reliance on a real home config and no unmocked network calls.

## 0.1.0 - 2026-05-17
- Initial release. Full Descript API coverage (11 endpoints), polling, direct upload, batch runner, 7 skills, optional in-process MCP shim.
