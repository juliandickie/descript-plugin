# Field Report - Multi-Language SRT Export Findings (2026-08-27)

Status - FINDINGS ONLY (live-tested against the iDD drive, UISC Sensa 01-01 project bdf9663e-0c92-4ba5-b455-ee335279068e)

Author - Claude, under Julian Dickie's direction

## The question

Can the API export .srt files in translated languages, or only the original-language transcript?

## Verified findings

1. **Translation creates one sibling composition per language.** The test project holds the English master (4c87dfb7), four snippet compositions, and roughly 60 translated compositions, each named with the translated title, all at identical duration. The Descript UI presents these as a Language dropdown on one document; the API sees flat sibling compositions. The UI's Export panels (Transcript and Subtitles tabs) expose a Language picker that the public API does not have.

2. **POST /export/transcript is Original-language only.** Pointing it at a translated composition returns the ENGLISH transcript (verified - Spanish and Japanese composition exports were byte-identical English; the master's export differed only in segmentation). Translations live in the caption layer, not the transcript layer, and this endpoint reads the transcript layer. Probes for undocumented `language`, `translation_language`, and `locale` request fields all return 400 (additionalProperties enforced server-side).

3. **The publish path DOES deliver translated subtitles.** GET /published_projects/{slug} for a published translated composition returns that language's caption track as WebVTT (verified - the Spanish composition's existing publish returned genuine Spanish captions with caption-card timing). Therefore `descript export <pid> --composition-ids <translated-ids> --formats srt` (publish-then-download) and `descript download-published <slug> --formats srt` (free, for already-published compositions) are the working multi-language SRT paths today.

4. **Caption-card quality difference.** The publish WebVTT carries the UI's subtitle segmentation (max chars per line, lines per card). The transcript endpoint's srt is transcript-derived segmentation. For subtitle files, the publish path output is the higher-fidelity artifact.

## Operational notes

- The API gives compositions no language field - translated compositions are identifiable only by their translated names. A pipeline needs a name-to-ISO-code classification step (or a maintained manifest).
- Bulk multi-language export means one publish per language composition (share URL each, default private). Treat a whole-project language sweep as a batch operation - scope review first.
- The paired compositions in the test project are DELIBERATE regional variants, not duplicates (confirmed 2026-08-27 against https://help.descript.com/repurpose/translate-captions.md). Descript supports regional caption variants - Spanish (Latin America) and Spanish (Spain), Chinese (Simplified) and (Traditional), Portuguese (Brazil) and (Portugal), French (Canada) and (France), English and English (UK). So "Escaneamento" (ba9f0834) vs "Digitalização" (591f7f20) are pt-BR vs pt-PT, and the two French compositions (9952c645, 3f4699bc) are the fr-CA/fr-FR pair. Regional variants apply to CAPTIONS only - dubbed voiceover stays the standard version of the language.
- Regional pairs sharpen the mapping problem: the two French titles differ only in hyphenation, so title-based language classification cannot reliably distinguish regional variants. Disambiguate by inspecting the caption WebVTT content, by creation order, or by keeping a manifest at translation time.
- Re-translation OVERWRITES the existing translated composition including any manual caption edits (vendor doc). If the team hand-corrects translated captions, export the corrected SRTs before anyone re-runs a translation.

## Dubbing capability (captured 2026-08-27, iDD context)

Vendor pages captured verbatim to docs/help-docs/ - "Dub speech to add translated voiceover.md" and "Translate your captions into another language.md" (new help.descript.com markdown docs, distinct from the older hc/en-us captures).

- Dub speech generates a translated voiceover as a NEW AUDIO TRACK using stock voices; optional Lip sync adjusts mouth movements. Spends AI credits (~15/min dubbing, ~50/min lip sync per the credits table).
- 28 stock-voice dubbing languages (Bulgarian through Ukrainian - full table in the captured doc). Regional caption variants do NOT apply to dubbed audio - the voiceover stays the standard version of the language.
- **iDD runs a Business plan** (Julian, 2026-08-27). That unlocks: Recommended voices for dubbing (13 languages - Chinese Simplified, Dutch, French, German, Hindi, Italian, Japanese, Korean, Polish, Portuguese, Spanish, Swedish, Turkish), Translation proofread, corrections to translated compositions (Business/Enterprise drives only), and Lip sync.
- Workflow notes from the doc: languages already translated show a green dot in the Translate panel; re-translating overwrites including manual edits; after correcting a translated composition, Regenerate must be run so dubbed audio matches the corrected text; Change Speakers can recast a dubbed composition's voice after the fact.
- The test project's ~50 dub-*.wav media files confirm some UISC translations were dubbed, not caption-only.

## Full-sweep outcome (2026-08-28)

The 64-language sweep on the test project completed 64/64. Timeline - first pass at concurrency 5 delivered 9/64 (serialization failures below); a serial `--resume` pass delivered 52 more overnight; one final paced resume caught the last 3 (a 502 on submission left a ghost publish running server-side, which blocked the next two serial submissions until it finished - wait ~8 minutes and resume again). Each composition now holds a private share URL (publish keying will reuse them, so future re-exports of these languages are download-only and fast). Every SRT was eyes-verified in its own script. Language mapping shipped as LANGUAGE-INDEX.md - regional pairs zh-Hans/zh-Hant certain (script), pt-BR/pt-PT high confidence (Escaneamento vs Digitalizacao), es-419/es-ES and bs/sr-Latn medium (vocabulary), the fr pair UNVERIFIED from content (no CA lexical markers surface in dental narration - the UI language dropdown is the ground truth). Follow-up 2026-08-28: a labeled fr-CA reference (Julian translated a casual clip to French (Canada) only, project 21b69b38) shows strong Quebecois markers in informal content ("prendre ma job", "cette job-là", "par année") but NONE of the fingerprints discriminate the formal UISC pair - both sweep files glue punctuation (Canadian style) and mix intraoral spellings, so Descript's fr-FR and fr-CA outputs are near-identical for formal narration. Title-template comparison would work if a second UISC lesson were translated to one labeled French variant; otherwise the app dropdown labels remain the only ground truth. RESOLVED 2026-08-28 by Julian's UI check - French (France) = 9952c645 ("Certification ultime en numérisation intra-orale", "Bienvenue à tous" opener); French (Canada) = 3f4699bc ("de numérisation intraorale", "Bonjour à tous" opener). Corrected set at ~/Desktop/Descript-Exports/UISC-Sensa-01-01-SRTs/ with slug map in its LANGUAGE-INDEX.md.

## Translation triggering and metadata (verified 2026-08-28)

- NO translation-language metadata exists on compositions in either the public REST API or Descript's own MCP server (get_project returns the identical shape - id, name, duration, media_type only, live-compared on project 21b69b38). Language of an existing translated composition is not machine-readable after the fact.
- Translations CAN be triggered via API/CLI/MCP: the Underlord agent endpoint (POST /jobs/agent = `descript agent` = MCP descript_agent, or Descript's official prompt_project_agent). The vendor translate doc's own example prompt is "Add German captions to this video". Translate captions = 10 AI credits per use. Regional variants should be promptable ("Translate the captions into French (Canada)") since Underlord drives the same Translate panel - NOT yet live-verified from the API.
- The reliable automation pattern therefore: trigger the translation VIA the API and capture the mapping at creation time - snapshot compositions before, run the agent job, diff compositions after; the new composition id maps to the language you requested, and result.agent_response describes what was done. Never rely on inferring language from titles afterward.

## Regional-variant prompt - LIVE-VERIFIED 2026-08-28 (test project 21b69b38)

- Prompted `descript agent --model claude-haiku` with "Add captions ... then translate those captions into French (France) - the France regional variant specifically, not French (Canada)". The agent created NEW composition 7f874eaf whose captions are systematically France French (assistante, "ce job" masculine, "par an") while the resident fr-CA composition 7e59905c remained fully intact (adjointe, "ma job", "cette job-là", "par année"). Same source, same engine, cleanly differentiated - regional variant selection via prompt WORKS.
- The agent's response embedded the new composition id in a target tag - creation-time mapping confirmed as the automation pattern.
- First attempt cost 5.397 credits and returned a clarifying QUESTION (composition had no captions to translate); the API cannot continue conversations (conversation_id is response-only, absent from the request schema - verified against the refreshed spec), so the recovery is a fresh self-contained compound prompt ("add captions, then translate"), which succeeded for 3.855 credits. Total ~9.3 credits. Write agent prompts self-contained; a question costs a full round.
- `--model claude-haiku` alias live-verified: result.resolved_model = claude-haiku-4.5.
- Both French variants of the same video carry IDENTICAL composition titles ("759K vues ..."), proving titles cannot distinguish regional variants even in principle.

## Plugin bug found during verification - same-title output collision

`descript export` derives each composition's output folder from the sanitized composition TITLE. Two compositions with identical titles (exactly what regional translation variants produce) collide: the second item's files silently overwrite the first's, and the report still says ok for both. This produced a false "the agent overwrote fr-CA" alarm until per-slug downloads into distinct directories disproved it. v0.6.0 fix: suffix the output folder with the composition short id (or slug) whenever titles collide - arguably always.

## Publish jobs serialize PER PROJECT (live-verified 2026-08-27)

The 64-composition sweep at the export default concurrency 5 failed 55/64: Descript rejects a publish submission with `429 rate_limited - "A publish job is already running for this project. Please wait for it to complete."` while any publish for the SAME project is in flight, and the resulting retry storm then trips the general rate limiter. Only one publish job per project runs at a time. The recovery that works: `descript export --resume <export-report.json> --concurrency 1` after the last in-flight job clears (job state via `descript jobs get <publish-job-id>`). Observed render time roughly 4-6 minutes per 12-minute composition, so a whole-project language sweep is an hours-long serial batch - schedule accordingly.

## Plugin implications (v0.6.0 candidates)

- **Export should clamp concurrency to 1 per project** (or group by project and serialize within, parallelize across projects). The current default of 5 self-inflicts the 429 storm on any single-project multi-composition export - this is effectively a bug against vendor behavior.
- descript-transcript SKILL.md should state plainly: Original language only; route translated-subtitle requests to the publish/export path.
- A `descript languages <project-id>` helper (list translated compositions with a best-effort language guess) would close the mapping gap.
- The export skill could document the translated-composition workflow explicitly, including the serial-publish constraint and time budget.

## Underlord translation-enumeration query - verdict (2026-08-28, v0.6.0 release smoke)

Pre-approved smoke, run against the UISC Sensa 01-01 project (bdf9663e-0c92-4ba5-b455-ee335279068e):

```
descript agent --project-id bdf9663e-0c92-4ba5-b455-ee335279068e --model claude-haiku --prompt "Do not change anything. List every translation that exists in this project: for each translated composition give its composition id and the EXACT language variant it was translated to, including regional variants such as French (France) versus French (Canada)." --json
```

Cost 1.542 AI credits, resolved_model claude-haiku-4.5, conversation_id 749a9e75-7abe-4d34-bcfe-a1e7f06ef5c0, 69 compositions enumerated.

**Verdict - FAILS the exact-match bar.** Checked against the known ground truth (Julian's UI check, recorded above): composition 3f4699bc came back correctly as "French (Canada) (fr-CA)", but 9952c645 came back as plain "French (fr)" - never the required "French (France)". Underlord resolved one half of the regional pair explicitly and genericized the other rather than naming both regional variants. The identical asymmetric pattern repeats for the other two country-flavor regional pairs in the same response - Spanish came back "Spanish (es)" / "Spanish (Spain) (es-ES)" and Portuguese "Portuguese (pt)" / "Portuguese (Portugal) (pt-PT)" - in both cases only the non-default member of the pair gets an explicit country label; the other is flattened to the bare language code. (Chinese Simplified/Traditional came back fully disambiguated, but that pair's label wording carries the distinction on its own, not a country qualifier, so it is not a counterexample.)

Conclusion: the existing-translations runbook does NOT collapse to one query per project. Underlord's enumeration is useful for a first-pass list of WHICH compositions are translations (and non-regional languages came back clean), but not trustworthy for the exact regional label on a country-flavor pair. The app's Language dropdown remains the only reliable ground truth for regional variants.

**Side finding - `project_changed: true` reported despite no write.** The job result's own `project_changed` field came back `true` even though the prompt only asked for a listing ("Do not change anything"). Composition count was checked via `projects get` both before and after the query and held at 69 in both cases - no composition was created or removed. Treat the API's `project_changed` flag as a vendor-reported hint, not proof a mutation occurred; verify state directly (composition count, or a full diff) when it matters.
