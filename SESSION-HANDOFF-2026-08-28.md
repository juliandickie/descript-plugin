# Session Handoff - 2026-08-28

Previous handoff - none (first handoff file in this repo; the v0.3.x-v0.4.x era used field reports and CHANGELOG only, and v0.5.0 landed 2026-08-27 in this same session without a formal handoff).

**Nothing in flight.** Both v0.5.0 and v0.6.0 are fully landed - main pushed, tags pushed, branches deleted, plugin cache on 0.6.0, all three catalog descriptions swept. The working tree holds only the long-standing untracked local-only files (AGENTS.md set, docs/help-docs, docs/plans, docs/field-reports, docs/specs ADR) plus rebuilt-but-uncommitted dist drift from post-release test runs, which the next release commit reconciles as usual.

## Goal

Bring the descript plugin to parity with the live Descript API and productize the multi-language subtitle workflow iDD needs for course production (UISC and beyond) - translation, per-language SRT export, and a mapping discipline that survives the API's lack of language metadata.

## State (verified against git and live systems as of 2026-08-28 13:44 AEST, session 6ce84287)

- code/descript-plugin - main = 58453e1 (docs: standalone marketplace v0.6.0), in sync with origin. Tag v0.6.0 = 6dff34a, pushed. Tag v0.5.0 = e3303d9, pushed. No open branches, no PRs. Suite 273/273 (verified by controller run, not report).
- Installed plugin cache - 0.6.0 (updated via `claude plugin update descript@outfit`; running sessions keep their loaded copy until restart).
- Catalogs - outfit main = 026d6b0, ai-loadout main = 60f0c58, both pushed, marketplace.json + README lockstep; descript-plugin standalone marketplace in 58453e1.
- v0.6.0 shipped (10 commits cb4b6b5..6dff34a): `descript translate` (creation-time language mapping, regional variants, exits 0/2/3/4/5 where 5 = job billed but mapping capture failed, do not re-run), export folder-collision fix (" [slug]" suffix via batch-scoped claimFolder), per-project publish serialization with submission-scoped already-running retry (30s x 10 inside publishAndWait, policy owned by exportBatch), resolved_model/conversationId surfaced, MCP descript_translate (12 tools), descript-translate skill (billable, confirm-gated like descript-edit), CLAUDE.md/README/api-reference current.
- v0.5.0 shipped 2026-08-27 (12 commits): transcript export, models catalog, publishes surfacing, import --workspace, requestRaw, spec refresh. See CHANGELOG.
- Deliverables on disk - ~/Desktop/Descript-Exports/UISC-Sensa-01-01-SRTs/ (64 language-coded SRTs + LANGUAGE-INDEX.md with slug map; fr labels CONFIRMED by Julian), .../fr-variant-test/ (labeled fr-CA/fr-FR caption pairs), .../v0.6.0-release-smokes/. Zips were also delivered in-chat.
- Test project 21b69b38 (Garry Vee clip) now has 3 compositions (original, fr-CA 7e59905c, fr-FR 7f874eaf) and 2 private publishes - throwaway, Julian may delete.

## Decisions (final positions, superseding mid-session discussion)

- Composition names are NEVER tagged with language codes (Julian): many languages accrue per project and names feed Vimeo's 128-char filename cap. Mapping lives EXTERNALLY - translate's JSON report + per-project LANGUAGE-INDEX files. Language goes into exported deliverable FILE names near the front per the iDD naming convention (UNFINALIZED - do not build filename tooling against it yet).
- `descript translate` is captions-only; dubbing stays with raw `descript agent` + its own confirmation. One language per invocation.
- The `descript languages` guessing helper was REJECTED - superseded by capture-at-creation doctrine.
- Underlord CANNOT enumerate regional variants reliably (release smoke verdict: labeled fr-FR as bare "French", same pattern for es/pt pairs, 1.5 credits) - the app's Language dropdown is the ONLY regional ground truth for pre-existing translations. Runbook lives in the descript-translate skill.
- Regional-variant prompts DO work for creating translations (live-verified: "French (France) - the France regional variant specifically" produced genuine fr-FR distinct from resident fr-CA).

## Tried and failed (do not rediscover)

- Distinguishing fr-FR vs fr-CA of formal narration by content fingerprinting - FAILS (no Quebecois lexical markers; both variants glue punctuation; mixed intraoral spellings). Informal content shows strong markers ("ma job", "cette job-la", "par annee").
- Undocumented language params on POST /export/transcript (language, translation_language, locale) - all 400.
- Language metadata anywhere in public REST or Descript's own MCP - none exists.
- Export at concurrency > 1 within one project - vendor serializes publishes per project; now handled in-code, but the historic failure mode was 55/64 items lost to 429s.
- descript export with two same-titled compositions pre-v0.6.0 - silent overwrite; fixed, but old reports' folder paths remain authoritative over recomputed names.

## Julian's feedback this session (apply everywhere)

- "you should always capture worthwhile content from the temp scratchpads and have it in a permanent location... we can then at least decide to delete or archive rather than loose it" - now a standing memory; deliverables move to ~/Desktop/<Topic>/ or the repo BEFORE moving on.
- No visible language tags on composition names (see Decisions).
- iDD naming convention draft: [Course Acronym] - [CC] - [LL] - [Language ISO code - Language full name] - [Lesson Name] - [Course Name] - [Educator] with course name trimmed; language near the front because Vimeo's SRT picker truncates. Links in memory project_idd_language_naming_convention.md (checker sheet, two Drive folders, example folder, convention doc).

## Recipes and footguns

- Bulk per-language SRT export: `bin/descript export <pid> --composition-ids <ids> --formats srt --concurrency 1 --output-dir <dir>` then read outputDir per item from export-report.json (collision suffixes make title-guessing wrong). Re-exports of already-published compositions are download-only and fast (publish keying).
- New translation: `bin/descript translate <pid> <cid> --language "French (Canada)" --model claude-haiku --json` - RECORD newCompositions from the output immediately. Exit 4 = agent asked a question (write a more complete prompt); exit 5 = billed but unmapped, do NOT re-run, recover via projects get + the agent response.
- Agent prompts must be SELF-CONTAINED (conversation_id is response-only; a clarifying question costs a full billable round, observed 5.4 credits).
- Ghost publish locks: a 5xx on submission can leave a server-side job holding the per-project lock ~8 minutes; the in-code wait covers ~5 minutes, then the item fails - wait and `descript export --resume <report>` recovers.
- The review-package/task-brief scripts must run from the repo directory (cwd resets between Bash calls).
- Tag push in this repo needs `git push origin refs/tags/vX.Y.Z` while the same-named branch exists.

## Open work, ranked

1. Finalize the iDD language naming convention (Julian + docs in memory project_idd_language_naming_convention.md) - prerequisite for filename tooling and the UISC rollout at scale.
2. UISC multi-language rollout: apply translate + export to the remaining UISC Sensa lessons (chapter by chapter; budget ~10-15 credits per language per lesson for NEW translations, hours of serial render per lesson sweep for publishes).
3. v0.7.0 candidates (docs/plans/2026-05-21-v0.5.0-backlog.md Themes 1/2/3/5/7 still parked, plus): `--name-template` for export once the convention is final; ES/BS-SR medium-confidence labels in UISC LANGUAGE-INDEX could be confirmed via the app dropdown in 30 seconds.
4. Optional belt-and-braces: one live `descript translate` command smoke (~10-15 credits) - the underlying flow is live-verified, the productized command is not.
5. Housekeeping: the 43 untracked local-only files (AGENTS.md set, docs/) remain by convention; test project 21b69b38 is deletable.

## Questions Julian needs to answer

- Confirm es-419 vs es-ES and bs vs sr-Latn labels in the UISC set via the app dropdown (medium confidence from vocabulary; 30-second check) - or accept as-is.
- Which language set does the UISC rollout actually target (all 60+, or the course's launch languages)?
- Naming convention: ISO code alone or "ISO - Full name" in filenames (his draft shows both)?

## Kickoff prompt for the next session

Working directory /Users/juliandickie/code/descript-plugin (single repo, main). Deliverables live at /Users/juliandickie/Desktop/Descript-Exports/.

READ FIRST, in order: SESSION-HANDOFF-2026-08-28.md (this file), CLAUDE.md, docs/field-reports/2026-08-27-translated-srt-findings.md, and memory entries project_descript_plugin_v050 + project_idd_language_naming_convention + reference_descript_publish_serialization - treat those over any assumption.

Exact state: main = 58453e1 in sync with origin, tags v0.5.0 + v0.6.0 pushed, no branches, suite 273/273, plugin cache 0.6.0 (state verified 2026-08-28 13:44 AEST, session 6ce84287). DONE: everything through v0.6.0 incl. catalogs. OPEN: naming convention finalization, UISC rollout, v0.7.0 candidates (ranked list in the handoff).

DO NOT TOUCH: the untracked AGENTS.md files and docs/help-docs|plans|field-reports|specs content are deliberately local-only; dist/ drift reconciles at the next release commit; test project 21b69b38 is Julian's to delete.

Standing rules: verify on rendered/live output never a status line; Sonnet subagents with explicit model; never push unasked mid-session; no em dashes, no colons in headings, straight quotes; capture deliverables out of scratchpads to permanent locations immediately; one publish per project at a time (export handles it, but pass --concurrency 1 for single-project sweeps out of caution); agent prompts self-contained; record translate mappings the moment they are produced.

First concrete action: ask Julian which open-work item leads (naming convention finalization vs UISC rollout), then for the convention session start from the doc links in memory project_idd_language_naming_convention.md.
