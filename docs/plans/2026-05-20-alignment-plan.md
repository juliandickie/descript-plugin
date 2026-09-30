# Plan - Descript Plugin Alignment to Field Reports and Help Docs

Status - **PENDING APPROVAL** (consensus achieved at iteration 2, awaiting Julian's scope-review checkpoint before v0.3.1 tagging)

Date - 2026-05-20

Author - Claude (via ralplan consensus loop), under Julian Dickie's direction

Inputs - All three field reports in `docs/field-reports/` and all twelve help docs in `docs/help-docs/`, cross-referenced against the current plugin state at v0.3.0 (`src/`, `skills/`, `docs/descript-openapi.json`, CLI USAGE).

Iteration history -

- Iteration 1 - Architect returned APPROVE_WITH_CONCERNS (5 recommended revisions). Critic returned ITERATE (5 required revisions, 4 acceptance-criteria flags).

- Iteration 2 - All iteration-1 revisions absorbed - (a) v0.3.1 SKILL.md tasks rewritten pointer-first to honor own pre-mortem 2; (b) v0.4.0 Task 7 (`--resume`) moved to v0.4.1 with a required design pass; (c) v0.4.0 Task 10 (Stream B) extracted as its own v0.3.3 release; (d) v0.4.0 Task 6 (model picker) revised to pass-through with help-text list, no escape-hatch flag; (e) v0.4.0 Task 9 (Retry-After) re-scoped to audit-and-document because the feature is already implemented (verified at `src/client/http.ts:53,68-86` and `tests/client/http.test.ts:36-53`). Architect verdict - APPROVE. Critic verdict - APPROVE.

Three minor Architect nits remain, classified by both Architect and Critic as PR-description level. They land as PR comments on the v0.3.1, v0.3.3, and v0.4.0 PRs, not in another planning iteration -

- v0.3.3 Task 2 - confirmation prompt shape on any new in-skill confirmation should match the existing `descript-edit` pattern.

- v0.4.0 Task 6 - the eight-model help-text list is a drift-prone snapshot, mitigated by the "pass any string" caveat.

- v0.3.1 dist/ rebuild wording - harmonise "no behavioural diff" and "docstring-only diff" to one phrasing in the PR description.

---

## RALPLAN-DR Summary

### Principles

1. The CLI is the API contract. Skills wrap the CLI. Plugin docs point at upstream capability documentation, they do not summarise it.

2. Cost gates and risk gates are different. Cost rides confirmation (in-skill prompt). Risk rides confirmation OR `disable-model-invocation`, decided per-operation.

3. Zero runtime dependencies stays a hard rule. New deps land in `devDependencies` only.

4. Field reports are the input contract for plans. Plans cite specific field-report sections by number. Resolved items get marked resolved in a future field report, not deleted.

5. Additive over breaking. Where a flag rename or API behavior change would break existing scripts, add an alias or hold the change to a major version.

### Decision Drivers (top 3)

1. **Restore user trust by closing the Underlord capability docs gap** (v0.2.1 followup §2.1). Mis-scoping the agent is the single most user-visible failure mode in the plugin's docs and the cheapest to fix.

2. **Ship the v0.3.0 backlog as a coherent point release** (v0.3.0 followup §2-§4). Each item is small, but unshipped they accumulate.

3. **Decide `disable-model-invocation` policy for publish and batch in isolation** (Stream B, v0.3.0 followup §5.4). Extracting this from the v0.4.0 code release gives the decision its own forum.

### Viable Options

**Option A (chosen) - Four-stream release ladder (v0.3.1 docs, v0.3.2 correctness, v0.3.3 Stream B ADR, v0.4.0 features, with v0.4.1 reserved for `--resume`)**

Pros - High-value low-risk docs change ships within days. Stream B gets its own release boundary, preventing v0.4.0 timing pressure from biasing the decision toward additive-only outcomes. `--resume` gets the design pass that field report §5.1 explicitly demanded.

Cons - Five potential version bumps in 4-8 weeks. More bookkeeping than a bundle. v0.3.3 is small (ADR + skill updates).

**Option B - Single v0.4.0 bundle**

Pros - One release, one tag, one diff. Tighter audit trail.

Cons - Mixes docs, correctness, features, and a contentious model-invocation decision in one PR. If Stream B blocks, everything blocks. Field-report §5.1 design pass for `--resume` gets crowded.

**Option C - Minimal docs-only v0.3.1, defer everything else**

Pros - Lowest risk, fastest first ship.

Cons - Strands the v0.3.0 followup backlog. Trust-restoration is partial without the correctness fixes that prove the field-report system works end-to-end.

### Picked

**Option A**. The Architect and Critic in iteration 1 both flagged that Stream B inside v0.4.0 pre-decides the brainstorm range and that `--resume` belongs after a design pass. Extracting both gives each its own boundary and resolves the principle-driver tensions.

### Pre-mortem (3 scenarios)

1. **Stream B brainstorm produces a recommendation that needs code (not just an ADR).** Mitigation - v0.3.3 is structured as "ADR plus optional skill updates". If the ADR concludes that code changes are required, the code work moves to v0.4.0 with the decision already in hand (not pending). v0.3.3 still ships the ADR as the artefact that records the decision regardless.

2. **v0.3.1 docs pass tries to fully document Underlord and drifts behind Descript updates.** Mitigation (now executable) - SKILL.md files added in v0.3.1 are pointer-first. The acceptance criterion is "no inline enumeration of capability classes, model lists, or filter parameter lists that already live in `docs/help-docs/`". When Descript updates an upstream article, the corresponding `docs/help-docs/*.md` is replaced wholesale and the SKILL.md pointer continues to work. The contradiction the Critic flagged in iteration 1 is now resolved by aligning Task 1 + 2 with this mitigation.

3. **v0.4.0 list-projects filters land but the real API behaviour diverges from `docs/help-docs/Descript API.md`.** Mitigation - every new filter has a mock test against the documented shape, plus a manual smoke (one filter at a time) against the iDD test Drive before tagging. A divergence becomes a dated field report and the filter ships with a documented caveat.

---

## Scope

Four releases that together close the field-report backlog, plus a fifth held in reserve for `--resume`.

- **v0.3.1** - Docs alignment, pointer-first. No code-behavior changes.

- **v0.3.2** - v0.3.0 correctness backlog.

- **v0.3.3** - Stream B model-invocation policy ADR + any documentary skill updates the ADR concludes are needed.

- **v0.4.0** - Feature-surface expansion (filters + model picker + import flags + audio smoke + Retry-After audit).

- **v0.4.1 (reserved)** - `--resume` after a dated design pass per field-report §5.1.

---

## v0.3.1 - Docs alignment (target ship - within days of plan approval)

Goal - surface Underlord's actual capability via pointers to the upstream docs already in-tree. Fix the polish items in v0.3.0 followup §4. No code-behavior changes.

### Tasks

1. **Rewrite `skills/descript-edit/SKILL.md` in pointer-first form.** The file lists at most three highest-impact affordances inline -

   - The bulk-metadata operation pattern (one Underlord prompt can iterate across every composition in a project, conditional on natural-language criteria, per the v0.2.1 followup §2.1 empirical demo).

   - Omitting `--composition-id` targets the whole project. This is the single most impactful surfaceable detail.

   - AI credit cost is small per call and is confirmable. For credit conservation, Haiku 4.5 is the cost-efficient model choice.

   Then file pointers to the upstream-canonical sources -

   - `docs/help-docs/Underlord (beta) Your AI co-editor in Descript.md` (capability classes, model picker table, beta caveats).

   - `docs/help-docs/How to write effective prompts for Descript's AI features.md` (Action, Context, Tone, Format, Constraints framework; the note that the API has no `@` mention affordance).

   - `docs/help-docs/Track and understand your media minutes and AI credits.md` (credit cost table).

   The SKILL.md MUST NOT enumerate the eight Underlord capability classes or the eight-model list inline. Those live in the help-docs file. Drift is now prevented at the source rather than mitigated post-hoc.

2. **Rewrite `skills/descript-api-reference/SKILL.md` in pointer-first form.** Per-endpoint, surface the single highest-impact delta a Claude session needs at decision time -

   - import - direct upload supported via `--file`; multitrack and `folder_name` and `language` are pending CLI flags in v0.4.0.

   - agent - composition_id accepts UUID or 5-char or full URL; omitting it targets whole project.

   - publish - republish is keyed by `(project_id, composition_id, media_type)`; Video and Audio of the same composition produce two share URLs.

   - jobs - `type` filter accepts only `import/project_media` or `agent` (NOT `publish`); 30-day max lookback.

   - projects - filter and sort surface lives in `docs/help-docs/Descript API.md` (CLI flags pending v0.4.0).

   - rate limiting - the client already honors `Retry-After` on 429 (`src/client/http.ts:53,68-86`).

   The file MUST NOT enumerate filter parameter lists, model lists, or capability classes that live in `docs/help-docs/`.

3. **Update `skills/descript-publish/SKILL.md`** to add the republish-keying behavior note (so callers know that re-publishing the same composition with the same media type overwrites the prior share URL).

4. **Update `README.md`** with a "Relationship to the official Descript CLI" section per v0.2.1 followup §2.3. Paragraph stating that `@descript/platform-cli` is Descript's official CLI, that this plugin wraps the same API but adds skills, an MCP shim, batch, export, and download-published, and that both can coexist.

5. **Update `.claude-plugin/plugin.json`** description (v0.3.0 followup §4.1) to add local MP4/SRT/MD export as a sixth proactive activation area.

6. **Fix `scripts/smoke/concurrency.ts` docblock** (v0.3.0 followup §4.3). Remove the `--mode write` reference. Schedule write-mode for v0.4.0.

7. **CHANGELOG entry** for v0.3.1.

### Acceptance criteria

- `skills/descript-edit/SKILL.md` references `docs/help-docs/Underlord (beta) Your AI co-editor in Descript.md` AND `docs/help-docs/How to write effective prompts for Descript's AI features.md` AND `docs/help-docs/Track and understand your media minutes and AI credits.md` by relative path.

- `skills/descript-edit/SKILL.md` does NOT enumerate the eight Underlord capability classes or the eight-model list inline (greppable check - no list of "Captions, Clips, Animations" sequence, no list of "Haiku 4.5, Sonnet 4.6, Opus" sequence).

- `skills/descript-api-reference/SKILL.md` references each help-docs file at least once by relative path AND surfaces the highest-impact delta per endpoint group (import, agent, publish, jobs, projects, rate limiting).

- `skills/descript-api-reference/SKILL.md` does NOT enumerate filter parameter lists that already live in help-docs (greppable check - no `name|folder_path|created_by|...` sequence).

- `README.md` has the official-CLI section.

- Plugin manifest description lists 6 proactive activation areas.

- CHANGELOG entry dated.

- No source code changes, no test changes.

- `npm run build` produces no behavioural diff in `dist/` (any diff is limited to docstring comments).

### Verification

- `npm test` still passes unchanged.

- `git diff dist/` after `npm run build` shows only docstring changes if any.

- Manual smoke - open the plugin in a fresh Claude Code session, ask "rename every composition in this project to add a suffix". Verify Claude reaches for `descript-edit`, not Bash or a deterministic workaround.

---

## v0.3.2 - v0.3.0 correctness backlog (target ship - 1-2 weeks after v0.3.1)

Goal - close the low-priority correctness gaps from v0.3.0 followup §2 and add the round-trip integration test from §3.1.

### Tasks

1. **Enforce slug+pid mutex in `exportBatch.processOne`** (v0.3.0 followup §2.1) - reject items that carry both slug and projectId+compositionId at the boundary. Mirror the existing "missing both" failure shape.

2. **Add empty-slug guard after `slugFromShareUrl`** (v0.3.0 followup §2.2) - if the share URL has no path segments, return a structured failed-item result with "could not extract slug from share URL".

3. **Tighten `SPEAKER_RE` or document the false-positive risk** (v0.3.0 followup §2.3). Decision rule - if no real-world failure has surfaced by the time v0.3.2 lands, document the risk in the file's existing comment block and skip the regex change. If a real failure has surfaced, tighten per option B (negative lookahead for digit-colon-digit) and add a regression test.

4. **Reject empty `--formats` value at parse time** (v0.3.0 followup §2.4) - after the dedup loop in `parseFormats`, return null + emit a usage error if `out.length === 0`.

5. **Add end-to-end export→download-published round-trip test** (v0.3.0 followup §3.1) - one test in `tests/cli/cli.test.ts` that calls `runCli(["export", ...])`, then `runCli(["download-published", "--report", ...])`, against the same temp dir. Assert specifically -

   - The export report file exists at `<tmp>/export-report.json`.

   - The report's `items[0].slug` is a non-empty string.

   - The download-published run produces the expected transcript files using that slug (`.md` and `.srt` for the per-cue Markdown contract).

   - The download-published report at `<tmp>/download-report.json` has the same item shape (slug, ok, paths, writtenFormats) as the export report.

6. **Add the three parseVtt edge case tests** (v0.3.0 followup §3.2) - NOTE block at EOF without trailing blank line, timestamp-line followed by EOF without text lines, NOTE body containing a timestamp-looking pattern.

7. **Bump `package.json` and `plugin.json` to 0.3.2.**

### Acceptance criteria

- Every correctness fix has a regression test.

- Round-trip test asserts the four specific items listed in Task 5.

- All existing tests still pass.

- No flag or CLI surface changes.

### Verification

- `npm test` passes.

- Round-trip test exercises both commands against the same temp dir with `mockFetch`.

---

## v0.3.3 - Stream B model-invocation policy ADR (target ship - 1 week after v0.3.2)

Goal - decide whether to remove `disable-model-invocation` from `descript-publish` and `descript-batch`, or keep it and document the Bash bypass. Land the decision as a dated ADR and apply any documentary skill updates the ADR concludes are needed. Per v0.3.0 followup §5.4.

### Tasks

1. **Run a dedicated ralplan brainstorm session** producing a dated spec at `docs/specs/YYYY-MM-DD-model-invocation-policy.md`. The brainstorm inputs are the v0.3.0 followup §5.4 narrative and the existing v0.3.0 confirmation-gate pattern in `descript-export` and `descript-edit`.

2. **Apply the ADR's documentary outcome** - if the ADR concludes "remove the gates", update `skills/descript-publish/SKILL.md` and `skills/descript-batch/SKILL.md` to remove `disable-model-invocation: true` and add explicit in-skill confirmation steps. If the ADR concludes "keep the gates", update both SKILL.md files to add a "Bash bypass note" explaining that the gate is not a runtime barrier.

3. **Update root `AGENTS.md`** and `CLAUDE.md` cost-and-risk section if the ADR changes the classification.

4. **CHANGELOG entry** for v0.3.3.

5. **Bump `package.json` and `plugin.json` to 0.3.3.**

### Acceptance criteria

- `docs/specs/YYYY-MM-DD-model-invocation-policy.md` exists with sections - Decision, Drivers, Alternatives Considered, Why Chosen, Consequences, Follow-ups.

- The ADR's decision is reflected in `skills/descript-publish/SKILL.md` AND `skills/descript-batch/SKILL.md`.

- If the decision requires code (not just docs), the code work is explicitly NOT in v0.3.3 - it moves to v0.4.0 with the decision in hand.

- All existing tests still pass.

### Verification

- `npm test` passes.

- Grep `disable-model-invocation` across `skills/` returns the count the ADR specified (currently 2, may go to 0 or stay at 2).

---

## v0.4.0 - Feature-surface expansion (target ship - 3-4 weeks after v0.3.3)

Goal - close the gaps between the API's documented surface (per `docs/help-docs/Descript API.md`) and the plugin's CLI surface.

### Tasks

1. **`--folder <path>` on `descript import`** - adds `folder_name` to `ImportRequest`. Mock test, skill update, help text.

2. **`--language <code>` on `descript import`** - adds `language` to media items. Default omitted (Descript auto-detects). Mock test, skill update.

3. **`--project-id` on `descript import` for existing-project import** - currently the CLI always creates new projects. Add support for importing additional media into an existing project. Mock test, skill update.

4. **List-projects filters** - add `--name`, `--folder-path`, `--created-by`, `--created-after`, `--created-before`, `--updated-after`, `--updated-before`, `--sort`, `--direction`, `--limit`, `--cursor` to `descript projects list`. Update `ListProjectsResponse` type. Mock tests for each filter.

5. **List-jobs filters** - add `--project-id`, `--type` (import or agent, not publish), `--created-after`, `--created-before`, `--limit`, `--cursor` to `descript jobs list`. Mock tests.

6. **Model picker - pass-through with documented help text.** The CLI passes `--model` through unvalidated. The `--help` output lists the documented models (Auto, Claude Haiku 4.5, Claude Sonnet 4.6, Claude Opus 4.6, Claude Opus 4.7, GPT 5.2, Gemini 3 Pro, Gemini 3.1 Pro) WITH the explicit caveat "Descript adds models; pass any string and let the API validate". This pattern resolves the iteration-1 Architect concern about `--allow-unknown-model` being a band-aid - the truth lives at the API.

7. **Audio-publish write-mode smoke** (v0.3.0 followup §4.3) - `scripts/smoke/concurrency.ts` gains a `--mode write` flag. Mechanism - the script reads `DESCRIPT_SMOKE_MODE_WRITE` env var OR a `--confirm` flag, refuses to run without one, publishes 5 short compositions, cancels mid-flight, captures rate-limit headers. Opt-in twice (env var or flag, plus a literal confirmation prompt).

8. **Retry-After audit + documentation** - confirm the existing implementation at `src/client/http.ts:53,68-86` and `tests/client/http.test.ts:36-53` covers the documented header behavior from `docs/help-docs/Descript API.md`. If gaps exist (e.g. `X-RateLimit-Remaining` not surfaced), add. Update `descript-api-reference` skill text. NOT a fresh implementation - the feature ships in v0.3.0.

9. **`--formats media` alias for `--formats mp4`** (v0.3.0 followup §4.4) - optional, additive alias. Cost is one line of code. Ship only if a real audio-export use case has surfaced by v0.4.0 freeze. Otherwise skip and reschedule.

10. **Composition-ID format normalisation documentation** - confirm the API accepts UUID or 5-char or full URL (per `docs/help-docs/Descript API.md`). The CLI already passes through unchanged. Document in `descript-api-reference` SKILL.md.

### Acceptance criteria

- Every new flag (Tasks 1-5) has a mock test AND a help-text entry.

- No breaking changes to any existing flag. Existing scripts continue to work.

- Task 6 (model picker) - help text lists the eight documented models AND the caveat "pass any string for forward-compat". No enum validation in the CLI's `badEnum` helper.

- Task 7 (write-mode smoke) - the script REFUSES to run without both the env var AND the literal `--confirm` flag. Tested by running without either, asserting exit code is non-zero and no API call is made.

- Task 8 (Retry-After audit) - produces a doc note in `descript-api-reference` SKILL.md citing the http.ts implementation by line range. If a gap is found, a fix lands as part of Task 8.

- Task 9 (`--formats media` alias) - decided at freeze. If shipped, the alias is documented in the export skill.

### Verification

- `npm test` passes.

- New filters validated against `docs/help-docs/Descript API.md` parameter list before tagging.

- One manual smoke run per new filter against the iDD test Drive before tagging.

---

## v0.4.1 (reserved) - `--resume` after design pass

Goal - implement `--resume <path>` on `descript export` after a dedicated design pass.

### Tasks

1. **Dated design spec at `docs/specs/YYYY-MM-DD-export-resume-design.md`** addressing -

   - Resume semantics - re-run items with `ok: false`, OR re-run items whose output files are missing on disk, OR both?

   - Composition with `--report` (same file used for read and resume).

   - Interaction with `--concurrency` and partial-completion writes.

   - Failure mode - what happens if the report references items the user no longer has access to?

2. **Implementation per the spec.**

3. **Test coverage** - resume after mid-batch failure, resume against a complete report (no-op), resume against a missing report (clear error).

### Acceptance criteria

- Design spec exists before any code is written.

- All semantic decisions in the spec are reflected in the implementation.

- Test coverage matches the spec's failure modes.

### Verification

- `npm test` passes.

- Manual smoke - kill an export mid-flight, `--resume` against the partial report, verify only missing items re-run.

---

## Cross-cutting governance

- Every release - dated `docs/plans/YYYY-MM-DD-vX.Y.Z.md`, dated `docs/specs/YYYY-MM-DD-vX.Y.Z-design.md`, CHANGELOG entry, version bump in both `package.json` and `plugin.json`.

- Every release - scope-review checkpoint with Julian before tagging or pushing (per global CLAUDE.md "scope check-in before destructive batched changes").

- Every release - rebuild `dist/` and commit (zero-install convention). For v0.3.1 (docs-only), `dist/` rebuild should produce no behavioural diff; any non-trivial diff is a flag to investigate.

- Help docs (`docs/help-docs/`) are inputs not outputs. If Descript updates an article, replace the file wholesale rather than patching.

- Field reports (`docs/field-reports/`) are append-only. v0.3.3 ships with a new dated field report listing which v0.3.0-followup items shipped and which were deferred. v0.4.0 ships with a v0.3.x retrospective.

---

## Build sequence

1. **v0.3.1** - docs-only. One execution session. No risk. Ship same day as plan approval (with Julian's scope-review checkpoint).

2. **v0.3.2** - correctness. 1-2 days of code work. Each fix is isolated and can branch from main independently.

3. **v0.3.3** - Stream B ADR session + documentary updates. 1 week including the brainstorm.

4. **v0.4.0** - feature expansion. 2-3 weeks. Filter and model-picker work is mostly mechanical, gated by `docs/help-docs/Descript API.md` shape.

5. **v0.4.1** - `--resume` after design pass. 1-2 weeks including spec.

---

## ADR (Architecture Decision Record)

- **Decision** - Four-stream release ladder (v0.3.1 docs, v0.3.2 correctness, v0.3.3 Stream B ADR, v0.4.0 features), with v0.4.1 reserved for `--resume` after a design pass.

- **Drivers** -

  1. Restore user trust fastest by closing the agent docs gap (Decision Driver 1).

  2. Sequence Stream B with its own boundary so v0.4.0 tag pressure doesn't bias the decision toward additive-only outcomes (Decision Driver 3).

  3. Honor field-report §5.1's explicit "design pass before implementation" instruction for `--resume`.

  4. Preserve additive-over-breaking (Principle 5) - patch releases don't add CLI flags, the minor release does.

- **Alternatives considered** -

  - Single v0.4.0 bundle (Option B). Faster delivery, higher review burden, mixes docs and code in one PR, blocks on Stream B, bundles `--resume` without its design pass.

  - Minimal docs-only v0.3.1, defer everything (Option C). Strands the v0.3.0 followup backlog.

  - Three-release ladder with Stream B inside v0.4.0 (iteration 1 plan). Pre-decides Stream B brainstorm range and crowds `--resume`.

- **Why chosen** - Splitting Stream B and `--resume` out resolves the principle-driver tensions the Architect and Critic both flagged in iteration 1. The cheapest highest-value change (docs) ships within days. The hardest decisions get their own forum.

- **Consequences** - Up to five version bumps in 6-8 weeks. Five potential plan/spec doc sets. More bookkeeping than a single bundle, justified by the principle-driver tensions a bundle would carry.

- **Follow-ups** - Stream B brainstorm scheduled for v0.3.3. `--resume` design pass scheduled for v0.4.1. Re-run the concurrency smoke after publish write-mode work lands in v0.4.0.

---

## Resolved open questions (from iteration 1)

1. **v0.4.0 scope size** - resolved. With Stream B extracted as v0.3.3 and `--resume` extracted as v0.4.1, v0.4.0 is now filter-and-model-picker work plus three import flags plus one smoke addition plus one audit. Coherent boundary.

2. **`--allow-unknown-model` escape hatch** - resolved. Replaced with pass-through pattern and help-text list, per Architect iteration-1 recommendation. The truth lives at the API.

3. **Stream B preferred direction** - intentionally unresolved. The v0.3.3 brainstorm session decides this on its own merits, not as a pre-commitment from this plan.

4. **v0.3.1 dist/ diff** - resolved. Acceptance criterion added - any diff beyond docstrings is a flag to investigate. Likely zero diff.
