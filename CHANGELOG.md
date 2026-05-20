# Changelog

## 0.4.1 - 2026-05-21

`descript export --resume <path>` ships. Recovers an interrupted or partial export by replaying a prior `export-report.json` without re-publishing already-published compositions. Implementation follows the design spec at `docs/specs/2026-05-21-export-resume-design.md`.

**Semantics** (per-item, per-format)

- `ok: true` items where all requested formats exist on disk are recorded as already complete with `resumed: false, reason: "already complete"`. No API calls fire.

- `ok: true` items where some files were deleted re-download via the prior slug. The publish step is skipped (slug already records a successful publish).

- `ok: false` items where the prior report records a slug retry only the failed formats via the slug path. No republish, no fresh server-side render.

- `ok: false` items where the slug is empty run the full publish-then-download path using the prior report's `projectId` and `compositionId`.

- Items missing both slug and projectId+compositionId fail with a clear "cannot resume" reason.

- All-items-already-complete batches exit 0 with `all_skipped: true` in the new `resume-report.json`.

**Resume report shape**

`<output-dir>/resume-report.json` carries `schema_version: 1`, `command: "export"`, `ok`, `resumed_from`, `all_skipped`, and `items` (each item carries `resumed: boolean`, `reason?: string`, `skipped: ExportFormat[]`, optional `partially_resumable: true`). Distinct filename from `export-report.json` so the prior report is not overwritten.

**Parse-time validation (exits 2 before any API call)**

- Non-existent path, malformed JSON, or missing `items` array.

- `--resume` combined with positional `<project-id>`, `--projects`, or `--composition-ids`. Mutex enforced.

- `--formats` set fully disjoint from the union of formats any item in the prior report attempted. Clear "run a fresh export instead" message.

**Workflow extensions**

- `ExportPublishedOptions` gains optional `skipFormats?: ExportFormat[]`. When set, the workflow excludes those formats from its inner loop and records them in `skipped[]` on the result.

- `ExportPublishedResult` and `ExportBatchReportItem` gain `skipped: ExportFormat[]` (always present, defaults `[]`). Backward-compatible with existing callers that ignore the field.

- `ExportBatchOptions` gains optional `writeReport?: boolean` (default `true`). The resume CLI handler sets it to `false` so it can write `resume-report.json` itself.

- New `src/workflows/exportResume.ts` module - `reconstructResumeItems`, `validateRequestedFormatsAgainstReport`, `buildResumeReport`. Pure functions plus `existsSync` checks.

**Pre-mortem 3 hardening** (per design spec)

The `getPublishedProjectMetadata` call returns a freshly-signed download URL on every invocation, which is what makes the "files deleted, slug-based re-download" path work. The HTTP layer at `src/client/http.ts:53,68-86` already retries on 429 via Retry-After. Item failure reasons include `slug_unreachable` for 404 / sustained 403 / other 4xx, distinguishing "Descript no longer hosts this artifact" from "transient permission glitch".

**Deferred**

- `--formats media` alias for audio publishes - still no use case has surfaced.

- `descript download-published --resume` - out of scope; the spec covers export resume only.

## 0.4.0 - 2026-05-21

Feature surface expansion. Closes the gap between Descript's documented API surface (per `docs/help-docs/Descript API.md`) and the plugin's CLI. 23 new CLI flags across three commands, plus the audio-publish write-mode smoke harness. No breaking changes; existing scripts continue to work.

This release was executed in parallel via three file-scoped worker agents (import, list-projects, list-jobs verticals) with the coordinator handling cross-cutting work. All workers stayed within their non-overlapping write scopes. Total test count went from 161 to 207.

**Import flag expansion** (3 new flags, per v0.4.0 plan Tasks 1-3)

- `descript import --folder <path>` adds `folder_name` to the import request, placing new projects under a nested folder (e.g. `Clients/Acme/Videos`).

- `descript import --language <code>` adds an ISO 639-1 language code to media items, overriding Descript's auto-detection.

- `descript import --project-id <id>` imports additional media into an existing project. The request shape omits `project_name` and `add_compositions`. Use the existing `--name` flag (without `--project-id`) to continue creating new projects.

**List-projects filter expansion** (11 new flags, per v0.4.0 plan Task 4)

- `descript projects list --name <str>` (case-insensitive substring), `--folder-path`, `--created-by` (UUID or `me`), `--created-after`, `--created-before`, `--updated-after`, `--updated-before`, `--sort` (`name|created_at|updated_at|last_viewed_at`), `--direction` (`asc|desc`), `--limit 1-100`, `--cursor` for pagination.

- New exported `ListProjectsQuery` interface in `src/client/types.ts`. Enum violations on `--sort` and `--direction` fail fast at parse time.

**List-jobs filter expansion** (6 new flags, per v0.4.0 plan Task 5)

- `descript jobs list --project-id`, `--type` (`import/project_media|agent` only - `publish` is not accepted by the API), `--created-after`, `--created-before`, `--limit 1-100`, `--cursor`.

- Enum violations on `--type` (including the common error `--type publish`) fail fast at parse time before any API call.

**Model picker pass-through with documented help text** (per v0.4.0 plan Task 6, per Architect's iteration-1 recommendation on the v0.3.3 ADR)

- `descript agent --model <name>` continues to pass any string through unvalidated. The CLI does not maintain an enum that would drift behind Descript's model list.

- The USAGE help text now lists the documented models as of 2026-05-20 (Auto, Claude Haiku 4.5, Claude Sonnet 4.6, Claude Opus 4.6, Claude Opus 4.7, GPT 5.2, Gemini 3 Pro, Gemini 3.1 Pro) with the explicit caveat that any string is accepted. For credit conservation the Haiku 4.5 model is the cost-efficient default. See `docs/help-docs/Underlord (beta) Your AI co-editor in Descript.md` for the upstream table.

**Audio-publish write-mode smoke** (per v0.4.0 plan Task 7)

- `npm run smoke:concurrency -- --mode write --confirm` (requires `DESCRIPT_SMOKE_MODE_WRITE=1` env var, both opt-in mechanisms required). Submits 5 publish jobs at varying concurrency and immediately cancels each to avoid wasting server-side renders. Measures 429 incidence and confirms the rate-limit recovery path via `Retry-After` headers.

- Refuses to run without both the env var AND the `--confirm` flag. Continues to exclude from `npm test` and CI.

**Composition-ID format documentation** (per v0.4.0 plan Task 10)

- `descript-api-reference` SKILL.md continues to document that `composition_id` accepts UUID, 5-character short ID, or full Descript project URL. The CLI passes through unchanged; the API normalises.

**Retry-After audit** (per v0.4.0 plan Task 8)

- Confirmed the implementation at `src/client/http.ts:53,68-86` and `tests/client/http.test.ts:36-53` is complete and shipped in v0.3.1. No new code or tests needed. `descript-api-reference` SKILL.md references the implementation by line range.

**Deferred to v0.4.1**

- `--resume` on `descript export` requires a dedicated design pass per field report §5.1.

- `--formats media` alias for `--formats mp4` not shipped (no audio-export use case has surfaced).

## 0.3.3 - 2026-05-20

Documentary-only release implementing the Stream B model-invocation policy decision (`docs/specs/2026-05-20-model-invocation-policy.md`). Closes the deferred question from the v0.3.0 followup field report §5.4 and the original v0.2.0 §3.6 complaint about the publish skill's gate being "over-defensive". No source code or test changes; `dist/` produces no behavioural diff.

- **`skills/descript-publish/SKILL.md` is now model-invocable.** `disable-model-invocation: true` removed from frontmatter. Confirmation pattern matches `descript-edit` and `descript-export`. Single-composition publishes are now reachable conversationally instead of via Bash-only, resolving the long-standing asymmetry where `descript-export` (which wraps publish) was model-invocable but `descript-publish` itself was not.

- **Publish defaults the access-level confirmation to `private`.** The confirmation step explicitly defaults to `--access-level private`; elevation to `unlisted` or `public` requires affirmative user language. This mirrors the existing default-private posture in `descript-export` and bounds the model-invocable path's blast radius (no external leakage at private).

- **`skills/descript-batch/SKILL.md` stays operator-only** via `disable-model-invocation: true`. Batch's blast radius (bulk write across many compositions, possible AI-credit billing via `agent_prompt` items) is categorically different from a single publish. The CLI's `batch plan` then `batch run --confirm` dance is the load-bearing safety mechanism; the skill flag is the honest signal of risk class.

- **Root `AGENTS.md`, `CLAUDE.md`, and `skills/descript-api-reference/SKILL.md` updated** to reflect the new gate matrix. New contributor rule of thumb - "Operator-gate any skill whose blast radius extends beyond a single composition, or that can spend AI credits transitively via `agent_prompt` items."

## 0.3.2 - 2026-05-20

Correctness backlog from the v0.3.0 followup field report (§2.1, §2.2, §2.3, §2.4, §3.1, §3.2). No CLI surface changes, no breaking changes. Bug fixes plus regression tests for previously-undocumented invariants.

- **`exportBatch.processOne` rejects items carrying both `slug` AND `projectId+compositionId`** (v0.3.0 followup §2.1). The two shapes are mutually exclusive by contract (slug = download mode, projectId+compositionId = publish-then-download mode). The current CLI never constructs such items, but the contract is now enforced at the boundary so a future caller cannot accidentally produce ambiguous behaviour.

- **Empty-slug guard after `slugFromShareUrl`** (v0.3.0 followup §2.2). If a publish job returns a share URL with no path segments (malformed URL, contract drift), `processOne` now returns a structured per-item failure with "could not extract slug from share URL" rather than letting an empty slug propagate to a downstream `published_projects/` 404.

- **`parseFormats` rejects empty `--formats` values at parse time** (v0.3.0 followup §2.4). `--formats ""` and `--formats " , , "` previously produced an empty format list and ran the batch silently with zero output. They now fail fast with a clear usage error and exit 2 before any API call.

- **`SPEAKER_RE` false-positive risk decision** (v0.3.0 followup §2.3). The existing comment block in `src/workflows/webvtt.ts` already documents the known false-positive risk (cue bodies starting with capitalised colon-bearing prefixes like "Time:", "Note:", "Q:"). No real-world failure has surfaced in production. Per the v0.3.2 decision rule, the regex stays as-is and the existing documentation remains the disclosure mechanism. Will revisit if a real failure appears.

- **End-to-end round-trip test for `export` then `download-published --report`** (v0.3.0 followup §3.1). New test in `tests/cli/cli.test.ts` locks the JSON contract between the two commands - export writes `export-report.json`, download-published reads it back via `--report` to regenerate transcripts using the same slugs. A future schema change to the report file that breaks this loop is now caught.

- **Three `parseVtt` edge case tests** (v0.3.0 followup §3.2). NOTE block at EOF without trailing blank line, timestamp-line followed immediately by EOF with no text lines, NOTE body containing a timestamp-looking pattern. None caused bugs in shipped code; the tests document the defensive parser behaviour against future refactors.

## 0.3.1 - 2026-05-20

Docs-only release. Closes the Underlord capability documentation gap surfaced in `docs/field-reports/2026-05-20-agent-docs-gap-and-v021-status.md` §2.1, plus the v0.3.0 followup polish items in §4. No source code or test changes; `dist/` is unchanged.

- **`skills/descript-edit/SKILL.md` rewritten in pointer-first form.** Surfaces the three highest-impact affordances inline (omitting `--composition-id` targets the whole project; Underlord queries as well as edits; AI credit cost is small and confirmable, Haiku 4.5 is the cost-efficient default) and points at `docs/help-docs/Underlord (beta) Your AI co-editor in Descript.md`, `How to write effective prompts for Descript's AI features.md`, and `Track and understand your media minutes and AI credits.md` for the full capability surface, model list, prompt framework, and per-operation cost table. Mis-scoping the agent endpoint (the v0.2.1 followup failure mode) is now structurally harder.

- **`skills/descript-api-reference/SKILL.md` rewritten in pointer-first form.** Per-endpoint highest-impact delta plus help-docs pointers. Includes the v0.2.1 followup §2.3 composition-ID format note (UUID, 5-char, full URL all accepted), the republish-keying behavior, the list-jobs `type` filter restriction (`import/project_media` or `agent` only, not `publish`), the 30-day jobs lookback, and the `Retry-After` honor implementation citation (`src/client/http.ts:53,68-86` and `tests/client/http.test.ts:36-53`).

- **`skills/descript-publish/SKILL.md` republish-keying note added.** Same `(project_id, composition_id, media_type)` reuses the prior share URL; Video and Audio publishes of the same composition produce two distinct share URLs.

- **README "Relationship to the official Descript CLI" section.** Positions this plugin against `@descript/platform-cli` per v0.2.1 followup §2.3. Both surfaces wrap the same API and can coexist.

- **Plugin manifest description gets a sixth activation area** for local MP4 + SRT + Markdown export. Per v0.3.0 followup §4.1. The capability shipped in v0.3.0 but was not surfaced in the marketplace listing.

- **`scripts/smoke/concurrency.ts` docblock cleanup.** Removes the unimplemented `--mode write` reference. The write-mode harness is planned for v0.4.0 alongside the rate-limit audit.

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
