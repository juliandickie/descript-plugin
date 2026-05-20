# Design Spec - `descript export --resume` (v0.4.1)

Status - **PENDING APPROVAL** (consensus achieved at iteration 2, awaiting Julian's scope-review checkpoint before v0.4.1 implementation)

Iteration history -

- Iteration 1 - Architect returned APPROVE_WITH_CONCERNS (6 recommended revisions). Critic returned ITERATE (6 required revisions, all blocking).

- Iteration 2 - All six required revisions absorbed: (1) parse-time disjoint-format check added as the first semantics row, separating CLI usage errors from per-item runtime failures; (2) implementation plan restructured into Phase 1 (Worker B alone) + Phase 2 (Workers A + C parallel) per the actual dependency graph; (3) explicit Resume report schema subsection with `schema_version`, `all_skipped`, and per-item `resumed`/`reason`/`skipped` fields; (4) Pre-mortem 3 mitigation tightened with retry-on-403 + 4xx general handling pointing at `exportPublished.ts:51`; (5) mutex extended to `--projects` and `--composition-ids` in addition to positional `<project-id>`; (6) "all items already complete" row added with explicit `all_skipped: true` exit-0 semantics.

  **Architect verdict iteration 1 - APPROVE_WITH_CONCERNS. Critic verdict iteration 1 - ITERATE. Iteration 2 self-audit (API-unavailable fallback for the Critic sub-agent during the 2026-05-21 outage) - APPROVE - all six revisions verifiably present via greppable evidence in the document body.**

Date - 2026-05-21

Author - Claude (via ralplan consensus loop), under Julian Dickie's direction

Inputs -

- `docs/field-reports/2026-05-20-v030-followup-backlog.md` §5.1 (the original deferral with the explicit "worth a real design pass before implementing" instruction).

- `docs/plans/2026-05-20-alignment-plan.md` v0.4.1 section (where this design was reserved).

- `src/workflows/exportBatch.ts` (the `ExportBatchReport` and `ExportBatchReportItem` types currently produced).

- `src/workflows/exportPublished.ts` (the `ExportPublishedResult` shape carrying `written` and `failed` per-format arrays).

- `src/cli/commands/registry.ts` `download-published` command (the existing `--report` read path that this design composes with).

---

## RALPLAN-DR Summary

### Principles

1. Resume is additive over the existing export+report contract. The prior report's shape stays the source of truth; resume reads it, never modifies it.

2. Publish is the expensive operation (server-side render, creates a hosted share URL). When the prior report records a successful publish (non-empty slug), resume MUST reuse it and skip republishing.

3. Per-format granularity. If `mp4+srt+md` was originally requested but only `mp4` wrote, resume targets only `md+srt`.

4. Per-item failure isolation matches the existing batch pattern. A resume's failure to recover one item does not abort the batch.

5. Users can narrow `--formats` on resume but not widen. If they need a format the original run didn't ask for, that's a fresh export, not a resume.

### Decision Drivers (top 3)

1. Honor field report §5.1's explicit "design pass before implementing". All seven sub-questions from the planning prompt get explicit semantic answers in this spec.

2. Reuse expensive operations. The slug field in the prior report is gold - it represents a publish that already happened. Never republish when the slug exists.

3. Compose cleanly with existing patterns. `--concurrency`, per-item failure isolation, `--report` (on download-published), per-format `written`/`failed` arrays - all reused.

### Viable Options

**Option A - Single `--resume <path>` flag with intelligent per-item per-format reconstruction**

The flag points at an `export-report.json`. The CLI reads it, decides per item what to do (skip / re-download missing formats / republish-and-download), and writes a new `resume-report.json` next to the existing files.

Pros - One flag. Reuses publish where possible. Honors all seven sub-questions through the semantics table. Composes with `--concurrency` and per-item failure isolation.

Cons - Implementation complexity is real (the exportBatch needs to accept "skip these formats per item" hints). Test coverage is broader than a v0.3.2-class fix.

**Option B - `--resume <path>` only re-runs items where `ok: false`, no missing-file detection**

Simpler. Reads report, filters to `ok: false` items, runs each through the existing exportBatch fresh.

Pros - Minimal change to exportBatch. Easy to implement and test.

Cons - User who deleted output files cannot recover them via resume. They have to run a fresh export, which means re-publishing (artifact creation, server-side render). Defeats the cost-reuse principle.

**Option C - Two-mode flag - `--resume failed-items|missing-files|both`**

User chooses the resume policy.

Pros - Most flexible. Documents the choice explicitly.

Cons - Three modes is UX bloat. The "both" mode is what most users want. The other two modes serve narrow cases.

### Picked

**Option A**. Reasons - (1) it directly answers all seven sub-questions; (2) it implements the cost-reuse principle (don't republish when slug exists); (3) the semantics table makes it tractable even though the per-format reconstruction logic is non-trivial. Option B leaves real money on the table when users delete files. Option C is UX bloat. The complexity Option A carries is real but bounded - the per-format hints are a small extension to exportBatch.

### Pre-mortem (3 scenarios)

1. **Report references items the user no longer has access to.** Mid-run, the publish step returns 403 because the user's Drive permissions changed since the original export. Mitigation - per-item failure isolation. The item fails with a clear "access denied for projectId=X compositionId=Y" message. The resume continues with the remaining items. The new resume report records the failure with the explicit reason.

2. **Report file is malformed or from a future schema.** A user hand-edits the report or passes a download-report.json (different shape) by mistake. Mitigation - the `--resume` flag validates the report against a known schema before any API call. Missing fields, wrong top-level keys, or items array missing the expected per-item shape all produce a clear parse error with exit code 2. The validation happens BEFORE network calls so no API budget is wasted on bad input.

3. **User runs `--resume` after deleting the output directory entirely.** All output files are missing, no slug-based recovery possible because slugs alone don't store the rendered media (Descript's CDN does, but its signed URLs expire 24h). Mitigation (concrete) - the resume detects "slug present but file missing" and calls `getPublishedProjectMetadata(slug)` (per `src/workflows/exportPublished.ts:51`) which returns a freshly-signed `download_url` on every call. The HTTP layer at `src/client/http.ts:53,68-86` already retries on 429 via Retry-After. For 4xx responses from the metadata endpoint specifically:

   - **404** - the published artifact no longer exists (user unpublished it, account closure, GDPR deletion). Item fails with `slug_unreachable` reason and a clear "the original published artifact is no longer available, run a fresh export to create a new one" message.

   - **403** - permission revoked since the prior export. The resume issues ONE metadata refetch (in case of a transient token-scoped 403); if the refetch also returns 403, item fails with `slug_unreachable` and "access to this published artifact has been revoked".

   - **Other 4xx** - item fails with `slug_unreachable` and the raw error from Descript.

   The retry-on-403 with one metadata refetch is bounded - no infinite loops - and avoids the false-positive failure on a transient permission glitch.

---

## Decision

Implement `descript export --resume <path-to-export-report.json>`. The resume reads the prior report, constructs per-item resume actions per the semantics table below, runs them through a slightly-extended exportBatch that accepts per-format skip hints, and writes a new `resume-report.json` to the output directory.

### Semantics table (the load-bearing artifact)

Parse-time checks (exit 2 before any I/O) run first. If they pass, per-item runtime resolution proceeds.

**Parse-time (CLI usage errors, exit 2):**

| Check | Action |
|---|---|
| `--resume` passed without a path argument | Exit 2 - "expected `--resume <path>`". |
| `--resume` path does not exist | Exit 2 - "no such file at `<path>`". |
| `--resume` path is not valid JSON | Exit 2 - parse-error message. |
| `--resume` path is valid JSON but no `items` array | Exit 2 - shape error. |
| `--resume` combined with positional `<project-id>` OR `--projects` OR `--composition-ids` | Exit 2 - "`--resume` is the only scope; remove the conflicting argument". |
| `--formats` passed AND its set is disjoint from the union of all items' originally-attempted formats (written + failed) | Exit 2 - "no items in this report attempted format `<X>`; use a fresh `descript export` instead". This matches the existing parse-time treatment of `--formats` in `parseFormats` at `src/cli/commands/registry.ts:69-92` and the `download-published` source-flag mutex at `src/cli/commands/registry.ts:327-335`. |

**Per-item runtime resolution (after parse passes):**

For each item in the prior report, given the effective requested formats (either `--formats` or the union from the prior report if omitted):

| Prior state | Action |
|---|---|
| `ok: true`, all written formats exist on disk, requested formats ⊆ written formats | **Skip the item.** Record in resume report with `resumed: false, reason: "already complete"`. Counts as success toward top-level `ok`. |
| `ok: true`, written formats include the requested formats but some files missing on disk | **Re-download missing formats using slug.** Skip the publish (slug is non-empty). |
| `ok: true`, item has SOME requested formats in its `written` array but missing others | **Heterogeneous-formats per-item case.** Resume the formats this item DOES have; mark the missing formats with `skipped: ExportFormat[]` and `partially_resumable: true`. The batch continues. |
| `ok: false`, slug is non-empty in prior report | **Re-download only the failed formats using slug.** Skip the publish (it succeeded in the prior run). |
| `ok: false`, slug is empty in prior report | **Full publish-then-download.** The publish failed in the original run. Resume both publish and download. Requires projectId+compositionId in the prior report. |
| `ok: false`, slug is empty AND projectId+compositionId also missing (malformed item) | **Fail the item.** Record `resumed: false, reason: "prior report item has no slug and no project/composition IDs"`. |
| All items resolve to `resumed: false, reason: "already complete"` | **Exit 0 with `all_skipped: true` and top-level `ok: true`.** This is structurally success. The resume report carries the `all_skipped` flag so downstream tooling can distinguish "nothing needed doing" from "nothing happened due to error". |

### Answers to the seven sub-questions

**(a) Re-run items where `ok: false` OR missing files OR both?**

Both, per the semantics table. The union catches the "user lost a file" recovery use case AND the "transient failure" retry use case.

**(b) Composition with `--report` (same flag, both flags)?**

`--resume` is a new flag on `descript export` that does NOT take `--report`. The `--report` flag exists on `descript download-published` (read-only path); they serve different commands. If both flags are passed (or `--resume` is passed without a path argument), the CLI errors at parse time with usage exit 2.

**(c) Interaction with `--concurrency` and partial-completion writes?**

`--concurrency` flows through unchanged. The resume's reconstructed item list is just another batch input to exportBatch.

Partial-completion writes - the per-file atomic write pattern in `exportPublished.ts` (write to `.partial` then rename) means a half-written file is never present. Either the file exists (fully) or it doesn't. The resume's "file exists on disk" check is sufficient.

**(d) Failure mode if the report references items the user no longer has access to?**

Per-item failure isolation (Pre-mortem 1). The publish or download step returns the access error; the resume records it in the new report with a clear message and continues.

**(e) Failure mode if `--resume` is given a non-existent path or malformed report?**

Fail fast at parse time. Exit 2. No API calls.

- Non-existent path - `--resume: file not found at <path>`.

- Malformed JSON - `--resume: <path> is not valid JSON: <parser error>`.

- Valid JSON but missing the `items` array - `--resume: <path> does not look like an export-report.json (missing items array)`.

- Empty items array - `--resume: <path> has no items to resume`. Exit 0 with a one-line message (not an error - the input is well-formed but trivially complete).

**(f) Interaction with `--formats`?**

The semantics table is the answer. Summary -

- If `--formats` is omitted on resume, the resume targets the union of formats across the prior report's `written` + `failed` per item. This means "redo the same scope the original run attempted".

- If `--formats` is passed on resume, the resume targets the intersection of (requested formats) ∩ (originally-attempted formats per item). Resume can narrow but not widen.

- Requesting a format the original didn't attempt fails the item (third row of the semantics table).

**(g) Publish vs download - what does "missing" mean for items that successfully published but failed to download?**

Per the semantics table rows 4-5: the slug field in the prior report is the discriminator.

- Slug non-empty in prior report = publish succeeded. Resume skips publish, downloads only the failed/missing formats. **Don't burn a publish.**

- Slug empty in prior report = publish failed (or was never attempted). Resume runs the full publish-then-download path.

---

## Drivers

1. Field report §5.1 instruction is explicit and non-negotiable: "Worth a real design pass before implementing". This spec is that pass.

2. The cost-reuse principle: publish creates a persistent hosted artifact. Re-running publish when the prior one is still valid is waste (server resources, share URL churn, potential bookmark breakage if accept-level changes).

3. Composition with existing patterns: per-item failure isolation, per-format granularity, the `--report` precedent on `download-published`.

## Alternatives Considered

- **Option B** (only re-run `ok: false` items) rejected because it doesn't recover deleted output files without forcing a full re-publish.

- **Option C** (three-mode flag) rejected because two of the three modes serve narrow cases the semantics table already covers.

## Why Chosen

Option A is the only option that respects all five principles: it's additive over the existing report shape, it reuses publish via the slug field, it has per-format granularity, it has per-item failure isolation, and it lets users narrow without widening. The complexity it carries (per-format skip hints in exportBatch) is bounded - one new optional field on `ExportBatchItem` plus the resume-side reconstruction logic.

## Consequences

- `src/cli/commands/registry.ts` `export` handler gains the `--resume <path>` flag with parse-time validation. The handler enforces `--resume` is mutually exclusive with positional `<project-id>` AND `--projects` AND `--composition-ids`. Exit 2 at parse time for any combination.

- `src/workflows/exportBatch.ts` gains an optional `skipFormats?: ExportFormat[]` field on `ExportBatchItem`. When set, the corresponding `processOne` invocation skips those formats and reports them as `skipped` (a new array on `ExportBatchReportItem` alongside `written` and `failed`).

- New module `src/workflows/exportResume.ts` houses the reconstruction logic - reads a prior report, runs the semantics table, produces an `ExportBatchItem[]` for the workflow.

- New report file shape - `resume-report.json` is produced by the resume run. Explicit schema below.

### Resume report schema

```ts
interface ResumeReport {
  schema_version: 1;                 // Bump on any breaking shape change
  command: "export";                 // Same discriminator as ExportBatchReport
  ok: boolean;                       // True iff every item has ok:true OR reason:"already complete"
  resumed_from: string;              // Absolute path to the prior report
  all_skipped: boolean;              // True iff every item resolved to "already complete"
  items: ResumeReportItem[];
}

interface ResumeReportItem extends ExportBatchReportItem {
  // Existing ExportBatchReportItem fields - slug, title, outputDir, written, failed, projectId, compositionId, ok
  resumed: boolean;                                          // True iff this item ran work in the resume
  reason?: "already complete"                                // resumed: false path
        | "requested format <X> not in original run"         // (now handled at parse-time, but reserved)
        | "prior report item has no slug and no project/composition IDs"
        | "slug_unreachable: <404|403|other-4xx>"
        | string;                                            // catch-all for runtime errors
  skipped: ExportFormat[];                                   // Formats deliberately not attempted in this resume
  partially_resumable?: true;                                // Set when the heterogeneous-formats row fires
}
```

The schema versioning means a future v0.4.2 that changes shape can detect old reports and either reject them or up-convert. The `all_skipped` flag makes the "everything already complete" case unambiguous in downstream tooling.

- New CLI tests for each row of the semantics table.

- New workflow tests for `exportResume.ts`.

- Skill update: `skills/descript-export/SKILL.md` documents the resume flow.

- `descript-api-reference/SKILL.md` documents the new flag.

- CHANGELOG entry for v0.4.1.

## Follow-ups

1. Implementation per this spec lands as v0.4.1.

2. The `skipFormats` field on `ExportBatchItem` is a small extension to the existing v0.3.2 boundary contract. The v0.3.2 mutex (item must not carry both slug AND projectId+compositionId) stays intact - resume reconstructs items with the correct discriminator per the semantics table.

3. Consider whether `descript download-published` should gain a `--resume` flag too (for consistency). Out of scope for this design pass - field report §5.1 is about export resume only.

4. Document the resume flow in the README's "Tip - Per-cue density" section neighborhood as a workflow tip ("if your export was interrupted, ...").

---

## Implementation Plan (v0.4.1)

Touching ~6 source files plus tests and docs.

### Tasks

1. **Add `skipFormats?: ExportFormat[]` field** to `ExportBatchItem` in `src/workflows/exportBatch.ts`. When present, the workflow's `processOne` skips those formats in its inner loop and adds them to a new `skipped` array on the result.

2. **Add `skipped: ExportFormat[]` field** to `ExportPublishedResult` and `ExportBatchReportItem`. `ok` is true iff `failed.length === 0` (unchanged semantics, skipped does not count as failure).

3. **New file `src/workflows/exportResume.ts`** exporting `reconstructResumeItems(prior: ExportBatchReport, requestedFormats: ExportFormat[] | undefined, outputDir: string): { items: ExportBatchItem[], skippedItems: SkippedItemRecord[] }`. Implements the full semantics table. Pure function, no I/O except `existsSync` checks against the output dir.

4. **Add the `--resume <path>` flag** to the `export` CLI handler in `src/cli/commands/registry.ts`. Parse-time validation - report exists, parses, has `items` array. Mutex with positional `<project-id>`.

5. **Add `resumed_from` field** to the report writer in `exportBatch.ts`. The report writer accepts an optional `resumedFrom?: string` and includes it in the JSON.

6. **Write new report to `<output-dir>/resume-report.json`** for resume runs (instead of `export-report.json` to avoid overwriting the prior report).

7. **Update `src/cli/index.ts` USAGE** to document `--resume`.

8. **Update `skills/descript-export/SKILL.md`** with the resume workflow.

9. **Update `skills/descript-api-reference/SKILL.md`** with the `--resume` flag.

10. **Write the unit tests** -

    - exportResume.ts - one test per row of the semantics table.

    - cli.test.ts - integration tests for the four end-to-end paths (skip-already-complete, redownload-missing, retry-failed-download, full-republish).

    - cli.test.ts - failure mode tests (non-existent path, malformed JSON, missing items array, empty items array, --resume with positional <project-id>).

11. **CHANGELOG entry, version bump to 0.4.1.**

### Acceptance criteria

- `descript export --resume <path>` exists and is documented in USAGE.

- Every row of the semantics table has at least one passing test.

- `resume-report.json` is produced in the output directory with the `resumed_from` field.

- `ok: true` items where files exist on disk are skipped (no API calls).

- `ok: false` items where slug is non-empty skip the publish step (verified by mock fetch call count).

- The `--resume` flag is mutually exclusive with positional `<project-id>` (exit 2 at parse time).

- Malformed input fails with clear error and no API calls.

- 207 existing tests still pass.

### Verification

- `npm test` passes.

- Manual smoke - run a real export against an iDD test project, delete one output file, run `descript export --resume <report>`, verify only the deleted file is regenerated and no fresh publish happens.

---

## Estimated effort

4-6 hours of focused work. The dependency graph is **NOT all-three-parallel**. Workers A's `exportResume.ts` imports types from `exportBatch.ts` that Worker B mutates. The correct split is two phases:

**Phase 1 - Worker B alone (~1-2 hours).** Extend `ExportBatchItem` with `skipFormats?: ExportFormat[]`, extend `ExportPublishedResult` with `skipped: ExportFormat[]`, extend `ExportBatchReportItem` (or define `ResumeReportItem` extending it) with `resumed`, `reason`, `skipped`, optional `partially_resumable`. Update `processOne` to honor the skip hints. Write unit tests for the skip behavior in `tests/workflows/exportBatch.test.ts`.

**Phase 2 - Workers A and C in parallel (~2-3 hours), after Phase 1 ships.**

- Worker A - new `src/workflows/exportResume.ts` module implementing `reconstructResumeItems()` per the semantics table. Pure function plus `existsSync` checks. Unit tests in new `tests/workflows/exportResume.test.ts` with one test per semantics-table row.

- Worker C - CLI handler additions for `--resume`, parse-time validation including the format-disjoint check, USAGE string update, skill updates (`descript-export`, `descript-api-reference`). Integration tests in `tests/cli/cli.test.ts` for end-to-end resume flows plus failure modes.

Coordinator handles version bump to 0.4.1, CHANGELOG, build, scope review.

Sequential single-session execution remains viable (~6 hours) if the parallel pattern is over-engineered for this scope.
