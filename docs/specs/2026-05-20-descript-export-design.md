# Descript Export - MP4, SRT, MD Local Export Workflow - Design

Date - 2026-05-20

Status - approved design, pending spec review

## Motivation

The 2026-05-20 field report (`docs/field-reports/2026-05-20-mp4-srt-md-export-workflow.md`) captured a four-step manual workflow that Julian had to run to get the three logical deliverables (MP4, SRT, Markdown transcript) for a single Descript composition. Each step required hand-wired flags, output paths, and a local Node converter script kept outside the plugin source. The friction points and the resulting bugs were enumerated in that report; the cost-language and `--access-level drive` bugs already shipped in v0.2.1.

This design is for v0.3.0, which folds the workflow itself into the plugin so the user can produce the same three deliverables in one command, including batch fan-out across many compositions in a project (or across many projects). It also captures the closed loop with a read-only re-fetch command so iterating on a downstream LLM prompt (chapter generation) does not require re-publishing.

## Goals

1. One command produces the three deliverables (MP4, SRT, Markdown transcript) for a single composition, with sensible defaults and no shell glue.

2. The same command fans out across all compositions in a project (single-project batch) or across multiple projects (multi-project batch), with bounded parallelism and per-item failure isolation.

3. A separate read-only command re-fetches the deliverables from a previously published slug (or many slugs from a prior export report), so re-running downstream content generation does not require a fresh publish.

4. The Markdown transcript matches the format the field report's Section 5 converter produces (per-cue paragraphs, `[HH:MM:SS]` timestamps, speaker label on speaker change, `[HH:MM:SS] END` marker), with the END marker as the only configurable knob (off by default).

5. Filenames and folder names are derived from the composition title and sanitised per Julian's Drive-sync rules (CLAUDE.md), so the output directory can be synced to Google Drive without breakage.

6. Partial failure is loud. If any deliverable on any composition fails, the exit code is nonzero and the per-item report identifies exactly what failed and why. Completed deliverables are not torn down because something else failed.

7. The new skills are model-invocable. The cost-bearing publish path uses the same in-skill confirmation pattern that `descript-edit` already uses, not the heavier `disable-model-invocation` gate.

## Non-goals (explicitly out of scope)

1. Resume of an interrupted batch. v0.3.0 does not maintain checkpoint state. If a batch dies, the user re-runs with `--composition-ids` listing the missing ones. A `--resume` flag is a v0.4.0 decision if real workflows bite.

2. Custom Markdown format flags beyond `--no-end-marker`. The Section 5 defaults are otherwise hardcoded. Adding `--paragraph-mode`, `--speaker-labels`, or `--include-title` is YAGNI in v0.3.0.

3. Interactive stdin prompts in the CLI. The MP4-opportunism conversation lives in the SKILL.md layer, not in the CLI binary. Interactive prompts would break batch and scripted use.

4. The `disable-model-invocation` policy on the existing `descript-publish` and `descript-batch` skills. That is a separate brainstorm (Stream B in the parent decomposition). v0.3.0 establishes the model-invocable-with-confirmation pattern for the new `descript-export` skill; Stream B decides whether to retroactively apply it to publish and batch.

5. Renaming the `mp4` token in `--formats` to `media` to reflect that the primary media file may actually be an `.mp3` for audio publishes. v0.3.0 ships under `mp4`. A rename is a v0.4.0 decision if the audio-publish naming is confusing in practice.

6. Windows-specific path semantics. The plugin's primary platform is Unix (Julian on macOS, no Windows CI). Path joining uses `node:path` so Windows should work, but it is not tested.

## Architecture and layering

```
src/workflows/
  webvtt.ts                  # NEW. parseVtt, toSrt, toMd. Pure functions,
                             # no I/O, no DescriptClient dependency. Direct
                             # TypeScript port of the field report's Section
                             # 5 converter script.
  filenameSanitize.ts        # NEW. sanitize(title): pure function that
                             # applies the CLAUDE.md Drive-sync rules to a
                             # single path segment.
  exportPublished.ts         # NEW. Per-slug pipeline. Takes a
                             # DescriptClient, a slug, an output dir, a
                             # formats array, and an endMarker flag.
                             # Atomic per-file writes via .partial+rename.
                             # Returns a structured per-file report.
  exportBatch.ts             # NEW. Batch fan-out. Takes a list of
                             # (project_id, composition_id) pairs OR a
                             # list of slugs, plus concurrency, plus the
                             # shared export options. Calls publishAndWait
                             # then exportPublished per item (for the
                             # export command) OR exportPublished directly
                             # (for the download-published batch mode).
                             # Accumulates an aggregate report and writes
                             # it to <output-dir>/export-report.json or
                             # <output-dir>/download-report.json.
  publishAndWait.ts          # UNCHANGED.
  poll.ts, batch.ts          # UNCHANGED. Existing.

src/cli/commands/registry.ts # ADD two entries. See Component 5.

skills/descript-export/SKILL.md           # NEW. See Component 6.
skills/descript-download-published/SKILL.md # NEW. See Component 6.

CLAUDE.md                   # ONE-LINE ADDITION to the Cost and Risk
                             # Safety section noting the new export skill's
                             # in-skill confirmation gate.
```

The CLI commands are thin glue. Both commands always go through `exportBatch`. Single-composition mode is a batch of size 1 - this keeps the report-writing path uniform so a single-comp `descript export PID CID` produces the same `export-report.json` that multi-comp and multi-project runs do, and the closed loop with `descript download-published --report <path>` works regardless of how many compositions were originally exported. `exportPublished` is invoked per item from inside `exportBatch`, never directly from the CLI.

## Closed loop between the two commands

Every `export` run writes an `export-report.json` into the `--output-dir` root. The report carries per-composition slugs. To re-pull transcripts later without a fresh publish, `descript download-published --report ./project-X/export-report.json --formats md,srt` reads the slugs back, fans out across them, and writes fresh transcripts. No fresh API writes, no MP4 renders on Descript's side, no MP4 downloads.

This is the design's main efficiency win for downstream content generation (chapter prompts iterated against the same source compositions).

## Component 1 - WebVTT converter (`src/workflows/webvtt.ts`)

Direct port of the field report's Section 5 script into TypeScript. Three pure functions, no I/O.

### Module API

```typescript
export interface Cue {
  start: string;  // "00:00:01.234"
  end:   string;  // "00:00:03.567"
  text:  string;  // multi-line text preserved
}

export function parseVtt(content: string): Cue[];

export function toSrt(cues: Cue[]): string;

export function toMd(
  cues: Cue[],
  title: string,
  options: { endMarker: boolean }
): string;
```

### `parseVtt`

- Skips the `WEBVTT` header line.

- Skips `NOTE` blocks (multi-line, terminated by blank line).

- A cue starts at any line matching `/^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/`.

- Cue text is every line until the next blank line. Multi-line text is preserved as-is with `\n`.

- Cue settings on the timestamp line (positioning, styling - `align:start`, etc.) are dropped silently. Descript does not emit these in observed output but defensive parsing is cheap.

- Returns `[]` for empty input or input with no cues.

- Tolerates Windows line endings via `/\r?\n/`.

### `toSrt`

Numbered cues starting at 1, comma-separated millis, multi-line cue text preserved verbatim, single POSIX newline at EOF.

```
1
00:00:00,000 --> 00:00:02,400
First cue text.

2
00:00:02,400 --> 00:00:04,800
Second cue text.
```

### `toMd`

- `# <title>` H1 at the top, blank line after.

- One paragraph per cue.

- Timestamp `[HH:MM:SS]` per paragraph, truncated (not rounded).

- Speaker detection via regex `/^([A-Z][\p{L}\s.'\-_0-9]+?):\s+/u`. Matches `Ben Sorensen: `, `Dr. Jane Smith-Brown: `, `ID Speaker_1: `, etc.

- Speaker label emitted only on speaker change. First cue always emits the label.

- Trailing space on each paragraph line plus blank line between paragraphs (so Drive sync into Google Docs preserves the structure).

- Final `[HH:MM:SS] END` marker using the `end` time of the last cue when `endMarker: true`. Omitted entirely when `endMarker: false` (the `--no-end-marker` flag path).

- POSIX single newline at EOF (`trimEnd() + "\n"`).

## Component 2 - Filename sanitizer (`src/workflows/filenameSanitize.ts`)

Pure function applied per path segment.

```typescript
export function sanitize(title: string): string;
```

Steps, in order:

1. Normalise typographic ligatures (`ﬁ`, `ﬂ`, `ﬀ`, `ﬃ`, `ﬄ`, `ﬅ`, `ﬆ` to `fi`, `fl`, `ff`, `ffi`, `ffl`, `ft`, `st`).

2. Replace curly quotes with straight quotes.

3. Strip trademark/copyright glyphs (`™`, `®`, `Ⓡ`, `℠`, `©`, `℗`).

4. Replace `&` with the word `and`.

5. Replace `/` and `\` with `-`.

6. Drop entirely: `< > ? # % * : |` and all ASCII control chars (`\x00`-`\x1f`, `\x7f`).

7. Collapse runs of whitespace to a single space, then trim.

8. Truncate to 200 chars.

9. If the result is empty, `.`, or `..`, fall back to `untitled-<slug>` (the composition's slug from the published-metadata response is always ASCII-safe).

## Component 3 - Per-slug pipeline (`src/workflows/exportPublished.ts`)

```typescript
export interface ExportPublishedOptions {
  slug: string;
  outputDir: string;
  formats: Array<"mp4" | "srt" | "md">;
  endMarker: boolean;
  projectFolder?: string;  // multi-project mode passes the sanitized project name
}

export interface ExportPublishedResult {
  ok: boolean;
  slug: string;
  title: string;
  outputDir: string;
  written: Array<"mp4" | "srt" | "md">;
  failed: Array<{ format: "mp4" | "srt" | "md"; error: string }>;
}

export async function exportPublished(
  client: DescriptClient,
  opts: ExportPublishedOptions
): Promise<ExportPublishedResult>;
```

Behaviour:

1. `GET /published_projects/{slug}` once. Read `metadata.title`, `subtitles` (WebVTT), `download_url`, and `publish_type`.

2. Compute the composition folder name: `sanitize(metadata.title)`. Compute the full target directory:
   - With `projectFolder`: `<outputDir>/<projectFolder>/<sanitizedTitle>/`
   - Without: `<outputDir>/<sanitizedTitle>/`

3. `mkdir -p` the target directory.

4. For each format in `formats`, write to `<targetDir>/<sanitizedTitle>.<ext>.partial`, then rename atomically to `<targetDir>/<sanitizedTitle>.<ext>`. The extension for `mp4` is derived per Component 5's extension rule. SRT and MD always use `.srt` and `.md` respectively.

5. Before any write, unlink any pre-existing `.partial` from a prior interrupted run.

6. On per-format failure, record the failure in the result's `failed` array and keep going with the other formats. The `written` array carries only the formats that succeeded.

7. `ok: true` iff `failed.length === 0`.

## Component 4 - Batch fan-out (`src/workflows/exportBatch.ts`)

```typescript
export interface ExportBatchItem {
  // For descript export: client publishes first to get a slug.
  projectId?: string;
  compositionId?: string;
  // For descript download-published: slug already known.
  slug?: string;
  // For multi-project mode, the sanitized project name passed to exportPublished.
  projectFolder?: string;
}

// An item carries EITHER (projectId + compositionId) for publish-then-download
// OR (slug) for download-only. The dispatch is presence-based, not a tagged
// union, to keep the type simple. The implementation must reject items that
// carry both or neither at the boundary (parseManifest-style validation).

export interface ExportBatchOptions {
  items: ExportBatchItem[];
  outputDir: string;
  formats: Array<"mp4" | "srt" | "md">;
  endMarker: boolean;
  concurrency: number;
  // Publish-specific options. Required when items carry projectId+compositionId
  // (export mode). Ignored when items carry slug (download mode).
  publish?: {
    mediaType: "Video" | "Audio";
    resolution: "480p" | "720p" | "1080p" | "1440p" | "4K";
    accessLevel: "public" | "unlisted" | "private";
  };
}

export interface ExportBatchReport {
  ok: boolean;
  command: "export" | "download-published";
  items: Array<ExportPublishedResult & {
    projectId?: string;
    compositionId?: string;
  }>;
}

export async function exportBatch(
  client: DescriptClient,
  opts: ExportBatchOptions
): Promise<ExportBatchReport>;
```

Behaviour:

1. Run items through a bounded-parallelism worker pool of size `opts.concurrency`.

2. For an item carrying `projectId + compositionId` (export mode): call `publishAndWait` with the publish options, then call `exportPublished` with the resulting slug.

3. For an item carrying `slug` (download mode): call `exportPublished` directly.

4. Per-item failures (publish 403, publish timeout, download curl error, parse error, write error) are caught and stored as the failed item's `ExportPublishedResult` with `ok: false` and the failure populated in either `failed[]` (for per-format failures) or by setting all requested formats as failed (for whole-item failures like a publish 403).

5. After all items complete, write the aggregate report to `<outputDir>/export-report.json` (for `command: "export"`) or `<outputDir>/download-report.json` (for `command: "download-published"`).

6. Report's `ok: true` iff every item's `ok: true`.

7. Report items are sorted by the order they appeared in `opts.items`, not by completion time, so reruns are deterministic.

## Component 5 - CLI commands (`src/cli/commands/registry.ts`)

Two new entries in `COMMANDS`.

### `descript export`

```
descript export <project-id> [composition-id] [flags]
descript export --projects <pid1,pid2,...> [flags]
```

Flags:

| Flag | Default | Notes |
|---|---|---|
| `--composition-ids <id1,id2>` | (all comps in project) | Only valid with `<project-id>` form. Narrows a project to a subset. |
| `--output-dir <path>` | `.` | Base path. Folder structure described below. |
| `--formats <mp4,srt,md>` | `mp4,srt,md` | Comma-separated subset. |
| `--no-end-marker` | (END marker included) | Omits the `[HH:MM:SS] END` line from MD. |
| `--concurrency <n>` | `2` (conservative initial; raise after smoke test - see Testing strategy) | Bounded parallelism for publish + download. Target post-smoke-test default is 5 or higher if Descript's rate limits allow. |
| `--access-level <public\|unlisted\|private>` | `private` | Pass-through to publish. |
| `--media-type <Video\|Audio>` | `Video` | Pass-through to publish. |
| `--resolution <480p\|720p\|1080p\|1440p\|4K>` | `1080p` | Pass-through. Ignored for audio publishes. |
| `--profile <name>` | (config-resolved) | Existing convention. |
| `--json` | (off) | Machine-readable stdout. |

Output structure:

- Single composition: `<output-dir>/s(comp-title)/s(comp-title).{mp4,srt,md}`

- Single project multi-comp: `<output-dir>/s(comp-1)/s(comp-1).{...}`, `<output-dir>/s(comp-2)/...`

- Multi-project: `<output-dir>/s(project-1)/s(comp)/s(comp).{...}`, `<output-dir>/s(project-2)/...`

- Report: `<output-dir>/export-report.json` (always at the root, even in multi-project mode)

Where `s()` is the sanitiser from Component 2.

### `descript download-published`

```
descript download-published <slug> [flags]
descript download-published --slugs <s1,s2,...> [flags]
descript download-published --report <path-to-export-report.json> [flags]
```

Flags: same `--output-dir`, `--formats`, `--no-end-marker`, `--concurrency`, `--profile`, `--json` as `export`. No `--access-level / --media-type / --resolution` (no publish step).

`--report` accepts an explicit file path only. No directory-with-default-name resolution (YAGNI).

### Exit codes (match existing convention)

| Code | Meaning |
|---|---|
| 0 | All items written, no failures |
| 2 | Usage error (bad flag value, no slug or PID/CID, malformed report file) |
| 3 | API error from `DescriptApiError` (auth, 403, etc.) |
| 4 | At least one item or per-item format failed; partial success possible |

### Extension derivation for the `mp4` format token

For the primary media file (the one referenced by `mp4` in `--formats`, regardless of actual codec):

1. Try parsing the extension from the `download_url` path. GCS-signed URLs typically include the original filename, e.g., `.../My-Composition.mp3?X-Goog-Signature=...`.

2. If parse fails or yields no extension, fall back to `publish_type` mapping:
   - `video` to `.mp4`
   - `audiogram` to `.mp4`
   - `audio` to `.mp3`

3. SRT and MD are always `.srt` and `.md`.

### `export-report.json` and `download-report.json` shape

```json
{
  "ok": true,
  "command": "export",
  "items": [
    {
      "ok": true,
      "projectId": "abc",
      "compositionId": "def",
      "slug": "ghi-123",
      "title": "MC2 - I'd Pay Double - Ben Sorensen - 9x16 - Card",
      "outputDir": "./MC2 - I'd Pay Double - Ben Sorensen - 9x16 - Card/",
      "written": ["mp4", "srt", "md"],
      "failed": []
    }
  ]
}
```

Partial-failure item:

```json
{
  "ok": false,
  "projectId": "...",
  "compositionId": "...",
  "slug": "def-456",
  "title": "...",
  "outputDir": "...",
  "written": ["srt"],
  "failed": [
    { "format": "mp4", "error": "curl returned 503" },
    { "format": "md", "error": "WebVTT parse error: unexpected line at offset 1842" }
  ]
}
```

## Component 6 - SKILL.md files

### `skills/descript-export/SKILL.md`

```markdown
---
name: descript-export
description: Export Descript compositions to local MP4, SRT, and Markdown transcript files. Use when the user wants to download finished compositions and transcripts for chapter generation, archival, or offline work. Handles single compositions, all compositions in a project, or fan-out across multiple projects.
---

# Descript Export

End-to-end pipeline: publish a composition (or many), download the rendered media, write SRT and Markdown transcripts from the WebVTT subtitles. Model-invocable with mandatory in-skill confirmation because each call triggers one publish per composition (server-side render, free on standard plans, but each publish creates a hosted share URL).

## When to Use
- "Download this composition", "give me the MP4 + transcript", "export everything in project X for chapter generation"
- NOT for: re-pulling transcripts from a composition that has already been published (use descript-download-published - read-only, free, no fresh publish)

## Instructions
1. Confirm scope. One of:
   - Single composition: project id + composition id
   - Whole project: project id only, all compositions
   - Multiple projects: --projects pid1,pid2,...

2. Confirm deliverables. Default is mp4 + srt + md. If the user says "just the transcripts" or "no need for the video", ask explicitly: "Descript renders the MP4 server-side regardless because their API has no transcript-only publish path. Do you want me to also download the MP4 now (one extra download per composition), or skip it (it stays on Descript's CDN - `descript download-published <slug> --formats mp4` will fetch it later)?"

3. Confirm access level. Default is private (export-and-download workflow). Only override if the user specifically needs unlisted or public.

4. Confirm output dir. Default is the current directory. Confirm if not specified.

5. Run:
   ```
   descript export <PID> [CID] \
     --formats <list> \
     --output-dir <path> \
     --access-level private \
     --concurrency 2 \
     [--composition-ids id1,id2] \
     [--no-end-marker] \
     [--profile <name>] \
     --json
   ```
   For multi-project, replace `<PID>` with `--projects pid1,pid2,...`.

6. Report per-composition outcomes. The CLI emits a per-item report (slug, title, output dir, written formats, failed formats). Do not summarize partial success as success - surface every failed format with its error.

7. For iteration ("regenerate just the transcripts after editing my chapter-gen prompt"), use descript-download-published with the slugs from the prior run's export-report.json. That path is read-only and free.

8. A 403 from publish means the Drive's publish settings block the requested access level. Report the hint from the error.
```

### `skills/descript-download-published/SKILL.md`

```markdown
---
name: descript-download-published
description: Download MP4, SRT, and Markdown transcript files for previously-published Descript compositions. Read-only - no publish, no API write, no cost. Use when iterating on transcripts for already-published compositions, or re-fetching files after the original download URLs expired.
---

# Descript Download Published

Read-only companion to descript-export. Fetches published-metadata for one or more slugs and writes the local files. No publish step, no API write, no cost. The right entry point for chapter-generation iteration.

## When to Use
- "Re-fetch transcripts for these compositions", "I already published, just give me the files"
- "Re-do that chapter prompt against the same transcript"
- NOT for: first-time export of a composition (use descript-export - that triggers the publish)

## Instructions
1. Determine the slugs. One of:
   - User provides a single slug (the last path segment of a Descript share URL, after `/view/`)
   - User has an export-report.json from a prior descript-export run - use --report <path>
   - User has a list of slugs - use --slugs s1,s2,s3

2. Run:
   ```
   descript download-published <slug> \
     --formats <list> \
     --output-dir <path> \
     [--no-end-marker] \
     [--profile <name>] \
     --json
   ```
   For batch, use --slugs <list> or --report <path> in place of the positional slug.

3. Report per-slug outcomes. Same fail-loud rule as export - surface every failed format with its error.

4. Download URLs are 24h-signed. This command always re-fetches /published_projects/{slug} to mint a fresh URL before downloading, so old slugs still work. The slug itself does not expire - Descript persists published items indefinitely until deleted in the UI.
```

### CLAUDE.md addition (one sentence appended to Cost and Risk Safety)

```
The descript-export skill triggers a publish per composition and is risk-bearing (creates hosted share URLs); it is intentionally model-invocable WITHOUT disable-model-invocation, gated by the same mandatory in-skill confirmation pattern descript-edit uses. The descript-download-published skill is read-only and unrestricted.
```

## Audio and video media type handling

- `--media-type` defaults to `Video`. Pass-through to the publish API.

- `--resolution` is meaningful only for `Video` and `Audiogram` publishes. With `--media-type Audio`, `--resolution` is silently ignored.

- The published-metadata response carries `publish_type: "audio" | "video" | "audiogram"`, distinct from the request `media_type`. File extension is decided per item from `publish_type` plus the `download_url` path parse, per the extension derivation rule in Component 5.

- For an audio publish titled `Episode 47 - State of Digital Dentistry`, the output is:
  ```
  <output-dir>/Episode 47 - State of Digital Dentistry/
    Episode 47 - State of Digital Dentistry.mp3   ← from "mp4" format token
    Episode 47 - State of Digital Dentistry.srt
    Episode 47 - State of Digital Dentistry.md
  ```

- The `mp4` token in `--formats` is a misnomer for audio publishes (it really means "the primary media file") but ships under that name in v0.3.0. See Non-goal 5.

## Testing strategy

### Pure unit (no mocks, no filesystem)

- `tests/workflows/webvtt.test.ts` - `parseVtt`, `toSrt`, `toMd`. Includes the field report's actual WebVTT as a fixture string inline. Tests parse against `NOTE` blocks, empty input, Windows line endings, multi-line cues. Tests SRT against numbering, comma-separated millis, multi-line preservation. Tests MD against golden output for Julian's single-speaker test composition, multi-speaker speaker-change behaviour, `endMarker` on/off, empty cues.

- `tests/workflows/filenameSanitize.test.ts` - all sanitiser rules with one test per rule plus the empty/`.`/`..` fallback case and the 200-char truncation case.

### Workflow integration (mock fetch, real filesystem via `mkdtempSync`)

- `tests/workflows/exportPublished.test.ts`:
  - Happy path: metadata + curl mock; all three files written with correct content
  - `--formats md,srt`: no MP4 written, no MP4 curl call
  - Partial failure: MP4 curl returns 503; SRT and MD still written; report records mp4 failure; exit nonzero
  - `--no-end-marker`: MD file does not contain `END` line
  - Audio publish: `publish_type: "audio"` plus URL ending `.mp3`; file written as `.mp3`
  - Existing `.partial` from a prior interrupted run is unlinked before new write
  - WebVTT parse error fails both SRT and MD with the same error; report shows both failed

- `tests/workflows/exportBatch.test.ts`:
  - Multi-comp single-project: all comps publish plus download in bounded parallel; report ordering preserved
  - Multi-project: two-level folder structure produced
  - Concurrency=1 (serial) preserves report ordering; concurrency=N (parallel) still preserves report ordering by input position, not completion time
  - One item fails, others succeed: report's `ok: false`, per-item `ok` flags accurate
  - `export-report.json` written at the `--output-dir` root after every run, even on partial failure
  - `download-report.json` shape parity for the read-only batch path

### Concurrency smoke test (dev workflow, not part of `npm test`)

Hermetic tests cannot tell us what Descript's real rate-limit ceiling is. A separate smoke test discovers it empirically and shapes the production default for `--concurrency`.

- Lives at `scripts/smoke/concurrency.ts`.

- Run via `npm run smoke:concurrency` (new script in `package.json`). Reads `DESCRIPT_API_TOKEN` and `DESCRIPT_SMOKE_PROJECT_ID` from env. Optional `DESCRIPT_SMOKE_PROFILE` to select a credential profile.

- Default mode is read-only: fetches the smoke project's published compositions list, then runs `download-published` against the first N slugs at concurrencies `[1, 2, 3, 5, 7, 10]`. Times each run, records any 429 or other API errors, prints a markdown summary.

- Opt-in `--mode write` flag exercises the publish path: submits N publishes in parallel via `--no-wait`, captures the job IDs, then immediately cancels them via `descript jobs cancel <id>` so server-side renders are not wasted. Records 429s and queue rejections.

- Output is a markdown report printed to stdout plus written to `scripts/smoke/results/concurrency-<timestamp>.md` (gitignored). Captures: concurrency level, total wall time, per-request times, any rate-limit errors, the recommended default.

- Excluded from `npm test`. Excluded from CI. Manual dev workflow only because it touches live API and the user's Drive.

- Acceptance criterion for raising the `--concurrency` default above 2: a smoke run at the candidate value completes with zero 429s and zero queue rejections across at least 5 consecutive items.

### CLI integration (`runCli` + `installMockFetch`)

Add to `tests/cli/cli.test.ts`:

- `descript export PID CID --json` exits 0, JSON report on stdout, files in cwd
- `descript export PID` (no CID) fetches the project's compositions and exports all
- `descript export --projects p1,p2` multi-project folder structure
- `descript export PID CID --formats invalid` exit 2 with badEnum-style message
- `descript export PID CID --concurrency 0` exit 2
- `descript export PID CID --concurrency -1` exit 2
- `descript export PID CID --concurrency abc` exit 2
- `descript download-published <slug>` fetches metadata, writes files, exit 0
- `descript download-published --slugs s1,s2` multi-slug fan-out
- `descript download-published --report ./fixtures/export-report.json --formats md` reads report, regenerates MD only, no MP4 curl call
- `descript download-published` (no slug, no --slugs, no --report) exit 2 with usage
- `descript export PID CID --access-level drive` exit 2 (the 0.2.1 rejection still applies)

### README addition

One paragraph in the README's use-cases section:

> For downstream LLM-driven content generation (YouTube descriptions, chapters, summaries), the API-derived per-cue Markdown transcript is denser and more anchor-rich than Descript's UI export. A 30-minute podcast yields ~750 timestamp anchors via this command vs ~50-100 from the UI's paragraph segmentation - useful when the downstream LLM needs many candidate chapter boundaries.

## Field-report items handled by this design

| Item | How |
|---|---|
| 3.3 (built-in WebVTT converter) | Component 1: webvtt.ts module |
| 3.4 (high-level export command) | Components 3, 4, 5: layered export + download-published |
| 3.5 (composition-name filenames) | Component 2: sanitised composition title as folder and filename |
| 3.7 (duplicate download URLs) | Component 3: only the metadata URL is used; saves one API call vs the publish job's URL |
| 3.8 (per-cue density use-case note) | README addition above |

## Open follow-ups (for the implementation plan)

1. Version bump and CHANGELOG entry for v0.3.0 land at the end of the implementation, not start.

2. The implementation plan should sequence the components so each lands in a passing state. Suggested order: Component 2 (sanitiser) plus Component 1 (webvtt) first (pure functions, no dependencies), then Component 3 (exportPublished) with its tests, then Component 4 (exportBatch) with its tests, then Component 5 (CLI commands) with their integration tests, then Component 6 (SKILL.md plus CLAUDE.md), then version bump.

3. The implementation should follow TDD per the discipline established in v0.2.1: write the failing test first, watch it fail, write minimal code to pass, refactor.

4. v0.3.0 is committed to shipping single-comp and batch together (Julian's explicit scope call). The component order above (sanitiser, webvtt, exportPublished, exportBatch, CLI, skills) lets the work land incrementally with each step in a passing state. If implementation hits unexpected complexity, the architecture supports splitting into v0.3.0 (single-comp via exportBatch-of-one) and v0.3.1 (batch arg shapes plus multi-project folder structure) without refactoring - but that split is a fallback, not the plan.

5. Before tagging v0.3.0, run the concurrency smoke test against a real iDD Drive project to set the production `--concurrency` default. Ship with whichever value the smoke test clears (target 5+, fall back to 2 if rate limits are tighter than expected). The default is the only thing that depends on the smoke result; the CLI surface and code path are concurrency-agnostic.
