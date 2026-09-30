# Field Report - v0.3.0 Follow-up Backlog

Date - 2026-05-20

Plugin version - 0.3.0

Author - Julian Dickie, via a Claude Code session

Status - Raw backlog from the v0.3.0 release run. Input for a future planning session. Not itself a plan or a spec.

---

## 1. Context

v0.3.0 shipped today (2026-05-20). The release added `descript export`, `descript download-published`, four new workflow modules (`webvtt.ts`, `filenameSanitize.ts`, `exportPublished.ts`, `exportBatch.ts`), two new skills, and a concurrency smoke test (which determined the new `--concurrency 5` default empirically).

The implementation went through 22 plan tasks executed under the subagent-driven-development discipline, with one implementer + spec reviewer + code-quality reviewer per task. Many issues were caught and fixed inline during the run. The items below are the ones that were either explicitly deferred, marked as "nits worth a follow-up", or surfaced only at the holistic review (commits `689ad5a` through `ffbeb31`).

The items are grouped by category. Each carries observation, evidence, impact, suggested fix, and a priority from the lens of "would this materially improve the next user's experience or the next maintainer's understanding".

---

## 2. Correctness gaps

### 2.1 `exportBatch` accepts items with both `slug` and `projectId+compositionId`

Observation - The design spec (`docs/specs/2026-05-20-descript-export-design.md`, Component 4) explicitly says "the implementation must reject items that carry both or neither at the boundary (parseManifest-style validation)". The shipped code in `src/workflows/exportBatch.ts` (around line 56) silently prefers the slug path when both are present.

Evidence - Reading `processOne`. The `if (!slug)` branch handles missing slug. There is no branch that errors when slug is present AND projectId/compositionId is also present.

Impact - Low for the current CLI (the CLI never constructs such items). Higher if `exportBatch` is ever called from a different entry point. A documented contract that is not enforced is a footgun for future contributors.

Suggested fix - Add an explicit guard at the top of `processOne` that returns a failed-item result with all formats marked failed when both slug and projectId+compositionId are populated. Mirror the existing "missing both" failure shape.

Priority - Low.

### 2.2 `slugFromShareUrl` silently produces empty slug on path-less URLs

Observation - `slugFromShareUrl` in `src/workflows/exportBatch.ts` returns `""` when given a URL with no path segments. That empty slug then propagates to `exportPublished`, which calls `getPublishedProjectMetadata("")`. The Descript API will surface a real error eventually, but the root cause (a malformed share URL from `publishAndWait`) is invisible to the caller.

Evidence - Code reviewer noted this on Task 8. Trace - `https://share.descript.com` (no path) passes through `new URL()`, yields `pathname.split("/").filter(Boolean) = []`, last segment is undefined, function returns `"" ?? ""`.

Impact - Low in practice (Descript's `publishAndWait` returns well-formed share URLs). Higher if Descript's API ever returns a malformed share URL or if the call shape changes. Would manifest as a confusing failure mode where the user sees `published_projects/{}` 404 errors instead of "publish job did not produce a usable share URL".

Suggested fix - Add a non-empty slug guard after `slug = slugFromShareUrl(out.shareUrl)`. Return a structured failed-item result with a clear "could not extract slug from share URL" message.

Priority - Low.

### 2.3 `SPEAKER_RE` false-positive risk on capitalised colon-bearing cues

Observation - The speaker-detection regex in `src/workflows/webvtt.ts` (`/^([A-Z][\p{L}\s.'\-_0-9]+?):\s+/u`) is a verbatim port of the field report's Section 5 production script and is tuned to Descript's `FirstName LastName:` speaker output. It can false-positively match cues whose body starts with a capitalised word followed by a colon and a space.

Evidence - Code reviewer noted this on Task 4. Examples - `"Time: 5:00 pm"` parses `"Time"` as a speaker, `"Note: see below"` parses `"Note"`, `"Q: what time?"` parses `"Q"`.

Impact - Low for Descript's controlled diarisation output. Higher if the body of a real cue happens to start with such a pattern (a speaker actually saying "Note: ..." or "Question: ..."). The output renders as `**Time:** 5:00 pm` instead of the literal text, which is both wrong attribution and silently strips the matched prefix from the cue body.

Suggested fix - One of these. A) Tighten the regex to require at least 2 word characters before the colon (already documented in the file's comment block as a future tightening option). B) Add a negative lookahead for digit-colon-digit patterns like `5:00`. C) Add a minimum two-word heuristic for speaker names. Each option breaks slightly different edge cases. Decide based on real-world failure cases.

Priority - Low to medium. Wait for a real failure to surface before tightening.

### 2.4 `parseFormats` silently accepts an empty `--formats` value

Observation - In `src/cli/commands/registry.ts`, `parseFormats` splits and filters the raw flag value. An empty string or whitespace-only flag value yields `parts.length === 0`, the dedup loop produces `[]`, and the function returns an empty formats list. The batch then runs with zero formats and writes nothing.

Evidence - Code reviewer noted this on Task 12. `--formats ""` and `--formats " , , "` both produce empty arrays.

Impact - Low. A user passing an empty `--formats` would see "0/N items written" and wonder why. Not destructive, but confusing.

Suggested fix - After the dedup loop, return null + emit a usage error if `out.length === 0`.

Priority - Low.

### 2.5 `--projects` combined with `--composition-ids` was silently ignored before the v0.3.0 guard

Observation - The Task 15 reviewer flagged that the two flags combined silently ignored `--composition-ids`. Task 16 added a mutual-exclusion guard that returns exit 2 with "--composition-ids is only valid with the <project-id> form, not --projects". This is now correct but the only test is the negative case (rejection).

Evidence - `tests/cli/cli.test.ts` has the mutex rejection test. The positive case (multi-project without `--composition-ids` works) is implicitly covered by the multi-project test from Task 15.

Impact - None now. Mentioned only because the guard could be inadvertently weakened in a future refactor without obvious test failure.

Suggested fix - No action needed. Listed for completeness.

Priority - None.

---

## 3. Test coverage gaps

### 3.1 No end-to-end round-trip test for export then download-published

Observation - The closed loop between the two new commands (`export` writes `export-report.json`, `download-published --report` reads it back to regenerate just the transcripts) is the flagship efficiency win of v0.3.0. The pieces are tested in isolation but never wired end-to-end.

Evidence - `tests/workflows/exportBatch.test.ts` covers `export-report.json` writing. `tests/cli/cli.test.ts` covers `--report` slug reading from a hand-constructed report. No test does `runCli(["export", ...])` then `runCli(["download-published", "--report", ...])` against the same temp dir.

Impact - Medium. A future schema change to `export-report.json` (renaming a field, changing item shape) could break the round-trip without any existing test catching it. The two commands share a JSON contract; that contract has no integration test.

Suggested fix - Add one test in `tests/cli/cli.test.ts` that runs export then download-published against the same temp dir, asserting the second run produces the expected transcript files using the slug from the first run's report.

Priority - Medium.

### 3.2 `parseVtt` edge case tests

Observation - The Task 2 reviewer flagged three edge cases not covered. None caused bugs in the shipped code, but would catch regressions if the parser were later refactored.

Evidence - Missing tests for - NOTE block at end of file with no trailing blank line (currently parses correctly via the loop exit, but undocumented). Timestamp-line followed immediately by EOF with no text lines (currently produces a cue with empty text). NOTE body containing a timestamp-looking pattern (currently correctly skipped by the NOTE-block consumer).

Impact - Low. Each test is a 3-line addition. The defensive correctness exists in the code; only the regression net is missing.

Suggested fix - Add three small tests to `tests/workflows/webvtt.test.ts`.

Priority - Low.

### 3.3 Audio-publish path is only mock-tested

Observation - The audio publish path (`publish_type: "audio"`, URL ending in `.mp3`, file extension derived from URL or fallback) is covered by mock tests in `tests/workflows/exportPublished.test.ts`. There is no live-API integration test for audio (the concurrency smoke test uses video only).

Evidence - The smoke script publishes with `media_type: "Video"` only. The audio-publish file extension derivation has not been validated against a real Descript audio publish response.

Impact - Low to medium. The mock-tested path is correct against the documented API shape, but Descript's audio publish response might emit URL or content patterns that diverge from the mocks (e.g., audio file is `.m4a` not `.mp3`, URL pathname encoded differently).

Suggested fix - Add a `--media-type Audio` option to the smoke script and run it against a real audio composition once. Validate the resulting extension and file content.

Priority - Low.

### 3.4 Mid-stream failure at higher concurrency

Observation - v0.3.0 added a URL-aware mock helper (`installMockFetchByUrl` in `tests/helpers/mockFetch.ts`) and one test that exercises concurrency=2 with item-B failing. That closes the original Task 9 gap. Higher concurrency (5, 7, 10) with mixed pass/fail is still untested.

Evidence - `tests/workflows/exportBatch.test.ts` has one URL-aware concurrency=2 mid-stream-failure test from the v0.3.0 post-review fix.

Impact - Low. The runPool implementation is simple and correct by inspection. The added test catches the basic race; higher concurrency is unlikely to introduce different failure modes.

Suggested fix - Parameterise the new URL-aware test to run at concurrency 3, 5, and 7 with the same item pattern.

Priority - Low.

### 3.5 `mkdirSync(opts.outputDir)` failure at the batch level

Observation - `exportPublished` catches its own `mkdirSync` failure and returns a structured per-item result (fixed in Task 5 post-review). `exportBatch.ts` line 161 calls `mkdirSync(opts.outputDir, { recursive: true })` UNCAUGHT. If this throws (permission denied, path is a file), the exception propagates through `mapError` and the CLI returns exit 1.

Evidence - Reviewing `exportBatch.ts`. No try/catch around the top-level mkdir.

Impact - Very low. This is a legitimate setup failure (the requested output dir cannot be created), and exit 1 with the underlying error message is the right behaviour. Inconsistent with `exportPublished`'s catch-and-report pattern, but at the batch entry point there is no per-item context to attach the error to.

Suggested fix - None required. Add a code comment explaining the intentional asymmetry, OR add the catch with a synthetic "batch setup" failure result. Cosmetic.

Priority - None.

### 3.6 Report file write failure after items succeeded

Observation - Same shape as 3.5. After items have written their files to disk, `exportBatch.ts` line 171 calls `writeFileSync(reportPath, ...)`. If this throws (disk full at the last second, permission), the items are still on disk but the report is lost. The exception propagates and the CLI returns exit 1, with no record of which items succeeded.

Evidence - Reading `exportBatch.ts`. No try/catch around the report write.

Impact - Very low. Disk failures of this kind are rare and the user's MP4/SRT/MD files are still recoverable from disk by inspection.

Suggested fix - Wrap the report write in a try/catch that logs the failure but does not lose the in-memory report. Optionally retry once.

Priority - None.

---

## 4. Polish and discoverability

### 4.1 `.claude-plugin/plugin.json` description omits the export capability

Observation - The plugin manifest's `description` field enumerates the plugin's five proactive activation areas - importing media, agent edits, publishing, bulk pipelines, job status. Local export to MP4 + SRT + MD is arguably the most marketable v0.3.0 capability and is not in the list.

Evidence - `.claude-plugin/plugin.json:5`.

Impact - Low. The skill activation system reads SKILL.md descriptions, not the plugin manifest description, so this doesn't block triggering. But the plugin marketplace listing shows this description, and a user browsing the marketplace would not know v0.3.0 ships local export.

Suggested fix - Add a sixth bullet to the description - "(6) local export of MP4, SRT, and Markdown transcripts for chapter generation".

Priority - Low to medium.

### 4.2 Skill confirmation pattern is documentary, not testable

Observation - Both new SKILL.md files document a confirmation gate ("Confirm scope, confirm deliverables, confirm access level, confirm output dir") but, like the existing `descript-edit` skill, the gate lives in the model's behaviour, not in the CLI. There is no automated test that exercises the skill text itself.

Evidence - `skills/descript-export/SKILL.md` Instructions section, steps 1-4. No corresponding test in `tests/`.

Impact - Low. The pattern is consistent with the existing `descript-edit` skill so this is not new drift, just worth flagging that "model-invocable with confirmation" is a discipline, not a runtime-enforced contract.

Suggested fix - Open design question. Options include - prompt-based eval harness for skill behaviour, snapshot tests on the SKILL.md content itself, or accept that this layer is verified by user observation. The plugin currently has no test infrastructure for skill behaviour; building it is a separate project.

Priority - Low.

### 4.3 Smoke script docblock mentions an unimplemented `--mode write`

Observation - `scripts/smoke/concurrency.ts` has a docblock comment describing an opt-in `--mode write` flag that "exercises the publish path; the script cancels jobs immediately after submission so server-side renders are not wasted". The script only implements the read mode. The CHANGELOG and the script doc both reference the absent feature.

Evidence - `scripts/smoke/concurrency.ts:4-7`.

Impact - Low. A user reading the doc would expect `--mode write` to work; running it would do nothing (no CLI arg parsing exists).

Suggested fix - Either A) implement the write mode (publish 5, capture job IDs, cancel them, record the response timings of the cancellations), or B) remove the docblock mention. Choosing A would extend the rate-limit measurements to the publish endpoint (which we did not directly test in v0.3.0). Choosing B is cheaper.

Priority - Low.

### 4.4 `--formats` token `mp4` is a misnomer for audio publishes

Observation - The `--formats` flag accepts `mp4|srt|md`. For an audio publish, the "mp4" token actually controls whether an `.mp3` (Descript's audio default) is downloaded. The token name does not reflect the content.

Evidence - `src/cli/commands/registry.ts` FORMAT_VALUES, `src/workflows/exportPublished.ts` extension derivation.

Impact - Low. The output filename has the correct extension; only the CLI flag name is misleading. A user passing `--formats mp4` to an audio export gets an `.mp3` file with no warning.

Suggested fix - Either A) rename the token to `media` (breaking change, would land in v0.4.0). B) Accept both `mp4` and `media` as aliases (additive, can land any time). C) Document the misnomer in the SKILL.md and leave the flag name alone.

Priority - Low.

### 4.5 `?? ""` vs `as string` mixing in `webvtt.ts`

Observation - The `parseVtt` implementation uses `?? ""` for `noUncheckedIndexedAccess` defensiveness in some places and `as string` in others. The two patterns are functionally equivalent given that `split()` returns defined strings, but the inconsistency reads as accidental.

Evidence - Code reviewer noted this on Task 2.

Impact - None. Cosmetic.

Suggested fix - Pick one pattern and apply uniformly. The `?? ""` form is the safer default for future maintainers because it doesn't make claims about runtime invariants.

Priority - None.

---

## 5. Deferred features (carried from the v0.3.0 spec's non-goals)

### 5.1 Resume of an interrupted batch (`--resume`)

Observation - v0.3.0 has no checkpoint state. If a batch dies mid-run (network drop, killed process, machine shutdown), the user re-runs with `--composition-ids` listing the missing items.

Evidence - Spec non-goal 1.

Impact - Medium for large batches. A 50-composition export that dies on item 30 has to re-run items 1-30 (manually identified from the disk state) before continuing.

Suggested fix - Add a `--resume <path-to-report.json>` flag that reads the report, identifies items where `ok: false` or where the output files do not exist on disk, and re-runs only those. Could compose with `--report` (same file used for both read and resume).

Priority - Medium. Worth a real design pass before implementing.

### 5.2 Custom Markdown format flags beyond `--no-end-marker`

Observation - The spec's Section 5 converter has firm choices (per-cue paragraphs, `[HH:MM:SS]` truncated, speaker label on speaker change). v0.3.0 ships these as hardcoded defaults with only `--no-end-marker` configurable. The spec lists `--paragraph-mode`, `--speaker-labels`, `--include-title` as YAGNI deferrals.

Evidence - Spec non-goal 2.

Impact - Low until a real second use case emerges. The chapter-generation workflow that drove the v0.3.0 design is well-served by the defaults.

Suggested fix - None until a use case justifies one. When it does, add flags one at a time, not all at once.

Priority - None.

### 5.3 Interactive CLI prompts

Observation - The MP4-opportunism conversation ("Descript renders the MP4 server-side regardless; do you want me to also download it?") lives in the SKILL.md layer. There is no interactive stdin prompt in the CLI binary.

Evidence - Spec non-goal 3. The SKILL.md step 2 instructs the model to ask, not the CLI.

Impact - Intentional. Interactive prompts would break batch and scripted use.

Suggested fix - None. This is a design choice, not a bug.

Priority - None.

### 5.4 `disable-model-invocation` policy on existing `descript-publish` and `descript-batch`

Observation - v0.3.0 established the model-invocable-with-confirmation pattern for `descript-export`. The existing `descript-publish` and `descript-batch` skills still carry `disable-model-invocation: true`. Stream B of the original brainstorm (when this work was decomposed) was supposed to decide whether to retroactively apply the new pattern to publish and batch.

Evidence - Spec non-goal 4. `skills/descript-publish/SKILL.md` and `skills/descript-batch/SKILL.md`.

Impact - Asymmetric user experience. Claude can run `descript-export` conversationally (with confirmation) but cannot run `descript-publish` even with confirmation; the publish path is operator-only via Bash.

Suggested fix - Run the Stream B brainstorm. Decide whether to remove `disable-model-invocation` from `descript-publish` (model-invocable + confirmation pattern) or keep it (status quo). The same decision applies to `descript-batch` but with the additional wrinkle that batch can include AI-credit-spending agent steps.

Priority - Medium. Worth a dedicated planning session.

### 5.5 Long-term Descript API gap - paragraph-aware transcript endpoint

Observation - Descript's UI exports a Markdown transcript with paragraph segmentation that is NOT exposed in the public API's WebVTT response. v0.3.0 ships with per-cue Markdown (denser, better for chapter generation but different from the UI export).

Evidence - Original field report Section 3.3.

Impact - None for the current use case (chapter generation explicitly prefers per-cue density). Would matter for human-readable transcript use cases.

Suggested fix - Lobby Descript to add a paragraph-aware transcript endpoint. Not engineering work; user-relations work.

Priority - None (not in this codebase's scope).

---

## 6. Suggested next steps for a follow-up session

For whoever picks this up next.

1. Read this report and decide which items to bundle into a v0.3.1 patch release vs. defer to v0.4.0. The correctness gaps (Section 2) are all low priority but cheap to fix; bundling them as v0.3.1 is reasonable. The polish items (Section 4) are mostly one-line changes that could also fit a v0.3.1. The deferred features (Section 5) need real design passes.

2. Test coverage gaps (Section 3) are mostly low priority. 3.1 (round-trip test) is the most valuable because it locks in the JSON contract between the two new commands.

3. The Stream B brainstorm (5.4) is the biggest design decision pending. It affects how Claude interacts with the rest of the plugin and is worth running as a dedicated planning session, not bundled with patch work.

4. Section 5.1 (resume) is the biggest user-facing feature gap. Worth designing properly if real batch failures bite.

5. Before tagging v0.3.1, run the concurrency smoke test again with `--mode write` (if implemented per 4.3) to validate the publish endpoint's rate-limit headroom and refine the `--concurrency 5` default if needed.

---

## 7. Reference

- v0.3.0 release - https://github.com/juliandickie/descript-plugin/releases/tag/v0.3.0
- v0.3.0 design - `docs/specs/2026-05-20-descript-export-design.md`
- v0.3.0 plan - `docs/plans/2026-05-20-descript-export.md`
- Original v0.3.0 field report (driving input) - `docs/field-reports/2026-05-20-mp4-srt-md-export-workflow.md`
- Concurrency smoke results - `scripts/smoke/results/concurrency-2026-05-20T09-09-16-784Z.md` (local-only, gitignored)
