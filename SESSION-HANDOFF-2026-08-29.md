# Session Handoff - 2026-08-29

Previous handoff - SESSION-HANDOFF-2026-08-28.md (v0.6.0 landing).

**In flight - two things.** (1) v0.7.0 is landed on main and tagged but the CATALOG SWEEPS ARE NOT DONE - outfit and ai-loadout marketplace.json + README descriptions and the standalone marketplace description still say 0.6.0, and the installed plugin cache is still 0.6.0. Held deliberately because Julian was away overnight; they are the next session's first mechanical act (or this session's, if it resumes). (2) The iDD production brain is mid-scoping - architecture decisions taken, but Julian owes answers to 8 numbered questions (below) before anything is built.

## Goal

Two streams this session. First, ship descript-plugin v0.7.0, the export name template implementing the iDD language filename standard (which this session also finalized, locked, and recorded with Julian). Second, scope the iDD production brain - a cross-system manifest so Drive, Descript, Vimeo, and ClickUp names and ids stop needing manual search.

## State (verified against git and live systems as of 2026-08-29, session 3312df98-9da2-4784-a92f-c7fa13b71c0a)

- code/descript-plugin - main = 7d6f734, pushed, tag v0.7.0 pushed (release commit 437e8cb; feature 1204d2e; branch v0.7.0-name-template deleted after ff-merge). Suite 304/304 verified on main before push. Untracked local-only set unchanged.
- NOT done - catalog sweeps (outfit, ai-loadout, standalone marketplace description) and `claude plugin update descript@outfit` cache refresh.
- iDD language filename standard - LOCKED and recorded (naming standard Google Doc "Course production" tab t.etw1wpusmqwd with verified 66x3 reference table; canonical local at ~/Desktop/iDD-Naming-Convention/; decision artifact https://claude.ai/code/artifact/ee4cf9a5-c1b8-42a4-a7af-e3fede72d814 - the artifact watch lapsed overnight, harmless).
- Production brain scoping - Julian's direction captured (see Decisions), landscape mapped (ClickUp Course Index list 901609505574 read, Course Publishing Master Docs located), 8 questions outstanding.

## Decisions (final positions)

- iDD language filename standard (Julian, locked 2026-08-28): [Course Acronym] - [CC] - [LL] - [CODE Simplified Language Name] - [Lesson Name].ext. Code + bracket-free simplified name ALWAYS; Latin American Spanish written plain ES (never ES-419 in filenames; canonical es-419 stays in mapping records); English SRTs carry EN English; casing FR-CA / PT-BR / ZH-Hans / SR-Latn; lesson names stay English; language files drop the course-name and educator tail; over-128 = trim the LESSON NAME only.
- v0.7.0 design: `--names <file>` manifest (fields + composition-to-language map), batch pre-flight BEFORE any publish, flat files under renderedName, resume reuses renderedName, warn-never-trim on 128. {slug} rejected in export mode. download-published naming deliberately out of scope.
- Production brain (Julian): a brain REPO (local canonical) - but the ClickUp Course Index list (901609505574) is the intended course-level MASTER together with the per-course "Course Publishing Master" Google Docs. Round 1 = UISC seed + lookups + names-manifest generation. Sheet sync wanted, open whether existing sheet or new (Claude recommended existing; unconfirmed).
- Underlying doctrine unchanged: Descript compositions stay language-neutral; mapping captured at creation time.

## Tried and failed (do not rediscover)

- Publishing an artifact update after an external republish requires the full read-the-saved-file dance TWICE (once before the fetch does not count; fetch, then Read every line, then publish). Budget ~35k tokens or just accept it.
- The Browser pane stalls on scroll/screenshot when hidden ("pane is currently hidden" timeouts). Classic headless Chrome + sips crops (memory recipes) is the reliable eyes-on path for local HTML.
- sips --cropOffset segment offsets behaved inconsistently; the whole-page capture + fewer, larger crops worked.
- Docs API table deletion needs the range [table start, table END] (end_index INCLUSIVE of the table's own end, 2765-4700 worked where 2765-4699 threw "invalid deletion range").

## Julian's feedback this session (apply everywhere)

- "ES-149 is weird I would rather ES Spanish Latino" - opaque region numbers never reach filenames; prefer plain readable forms and keep canonical codes in the mapping layer.
- Simplified names over official ones when both are understandable ("Spanish Latino" not "Spanish (Latin America)"). No brackets in name segments.
- Master references: the ClickUp Course Index list + Course Publishing Master Docs are how he thinks about course-level truth - do not assume the lesson index Sheet is master.
- He wants understanding OUTLINED BACK to him before big builds ("outline what you understand already and then I will fill in the gaps").

## Recipes and footguns

- v0.7.0 usage: `descript export <pid> --composition-ids <ids> --formats srt --concurrency 1 --names names.json` where names.json = {"acronym": "UISC-AAS200E", "cc": "01", "ll": "01", "lesson": "...", "languages": {"<cid>": "fr-CA", "<cid>": "en"}}. Pre-flight exits 2 listing every problem before any publish. Bare "es" is rejected on purpose.
- The language vocabulary lives in src/workflows/languageNames.ts, GENERATED from ~/Desktop/iDD-Naming-Convention/generate-options-doc.mjs data - regenerate there first if the standard ever changes, never hand-edit both.
- Tag push in this repo: delete the same-named branch first or push refs/tags/vX.Y.Z explicitly (worked again this session).
- ClickUp connector (claude.ai): clickup_search ignores list scoping; use clickup_get_list / clickup_get_custom_fields with list_id directly. The Course Index list's custom fields ARE the course-level manifest (Descript Project Link, Google Drive Folder, Vimeo Folder, Course Publishing Master, LearnDash links, production phases).
- Course Publishing Master Docs: search Drive for name contains 'Publishing Master' - one per course, "[Course] - [Educator] - Course Publishing Master".

## Open work, ranked

1. Release residuals: catalog sweeps (outfit + ai-loadout marketplace.json/README, standalone marketplace description) + plugin cache update to 0.7.0.
2. Production brain: get Julian's answers to the 8 questions, then write the scoping brief and build round 1 (repo, likely code/idd-production-brain; UISC seed; lookup skill; names-manifest generator; sheet sync).
3. UISC multi-language rollout (translate + export, now with --names) - needs Julian's language-set decision.
4. Optional billable translate command smoke (~10-15 credits), still pending from last session.
5. es-419/es-ES and bs/sr-Latn UISC labels still medium confidence pending Julian's 30-second app dropdown check.

## Questions Julian needs to answer (the brain scoping 8)

1. What is inside a Course Publishing Master Doc - structure and role?
2. Lesson-level authority - Sheet vs Publishing Master when they disagree; ClickUp is course-level master, what is lesson-level master?
3. Are lessons tracked anywhere in ClickUp, or is the Sheet the only lesson-level surface?
4. Vimeo - who uploads, and are video ids recorded anywhere after upload?
5. LearnDash - in or out of round 1?
6. The 3 lookups that hurt most today (prioritizes round 1).
7. Sheet sync - existing lesson index Sheet (recommended) or a new one?
8. Home and shape - code/idd-production-brain repo, brain pattern (corpus + secretary + CLI)?

## Kickoff prompt for the next session

Working directory /Users/juliandickie/code/descript-plugin (single repo, main). Naming standard deliverables at ~/Desktop/iDD-Naming-Convention/.

READ FIRST, in order: SESSION-HANDOFF-2026-08-29.md (this file), CLAUDE.md, docs/plans/2026-08-28-v0.7.0-name-template.md, and memory entries project_descript_plugin_v050 + project_idd_language_naming_convention + project_idd_production_brain - treat those over any assumption.

Exact state: main = 7d6f734 pushed, tag v0.7.0 pushed, no branches, suite 304/304 (verified 2026-08-29, session 3312df98). DONE - v0.7.0 code, tests, docs, skills, landed and tagged; the language filename standard locked and recorded everywhere. OPEN, ranked - 1) catalog sweeps + plugin cache to 0.7.0, 2) production brain (answers to the handoff's 8 questions, then scope + build round 1), 3) UISC rollout, 4) optional translate smoke.

DO NOT TOUCH: untracked AGENTS.md files and docs/help-docs|plans|field-reports|specs are deliberately local-only; test project 21b69b38 remains Julian's to delete.

Standing rules: verify on rendered/live output never a status line; Sonnet subagents with explicit model; never push unasked mid-session; no em dashes, no colons in headings, straight quotes; capture deliverables to permanent locations immediately; one publish per project at a time (--concurrency 1 in-project); agent prompts self-contained; record translate mappings at creation; ClickUp Course Index list 901609505574 + Course Publishing Master Docs are Julian's intended course-level masters.

First concrete action: run the catalog sweeps and cache update for v0.7.0 (mechanical), then pick up the production brain with Julian's answers to the 8 questions in this handoff.
