---
name: descript-translate
description: Translate a Descript composition's captions into another language via Underlord, capturing which new composition carries which language. Supports regional variants like French (Canada), Spanish (Latin America), Portuguese (Brazil). Billable - spends AI credits. Use when the user wants a project or lesson translated, wants captions or subtitles in another language that does not exist yet, or asks to add a language to a course video.
---

# Descript Translate

## When to Use
- "Translate this lesson into Spanish", "add French (Canada) captions", "create the German version"
- The translation does not exist yet. If translated compositions already exist, route to descript-export (SRTs via publish) or descript-transcript (original language only) instead - do not re-translate, re-translation OVERWRITES manual caption edits.

## Cost - always disclose and confirm before running
- BILLABLE. Translate captions is about 10 AI credits per run plus a few credits for the agent exchange (about 9-15 total observed). Confirm the language list and cost with the user first. One language per invocation.
- Dubbing and lip sync are NOT part of this command (they cost ~15 and ~50 credits per minute); route explicit dubbing requests to descript-edit with a purpose-built prompt and its own confirmation.

## Instructions
- `descript translate <project-id> [composition-id] --language "French (Canada)" --model claude-haiku --json`
- Regional variants work - name them exactly as Descript's picker does: French (France), French (Canada), Spanish (Spain), Spanish (Latin America), Portuguese (Brazil), Portuguese (Portugal), Chinese (Simplified), Chinese (Traditional), English (UK).
- The command snapshots the project, runs the agent, and diffs - the output names the NEW composition id for the requested language. RECORD that mapping (translated compositions have identical titles across variants; the language is not recoverable from metadata afterward).
- Exit 4 means the job succeeded but created nothing - the agent asked a question (shown in the output). Answer it by re-running with a more complete prompt via descript-edit, or adjust and re-run translate.
- Exit 5 means the job succeeded and credits were SPENT, but the post-job mapping capture failed. Do NOT re-run translate - it would bill again. List compositions with `descript projects get <project-id>` and identify the new one from the agent response (shown in the output).
- For credit conservation default --model claude-haiku.

## After translating
- Export the SRT via the publish path: `descript export <project-id> --composition-ids <new-id> --formats srt --concurrency 1` (see descript-export - publishes serialize per project).
- RECORD the language-to-composition mapping externally (the command's JSON output, and the project's LANGUAGE-INDEX file if one exists). Never rename or tag the composition itself - composition names are length-budgeted for Vimeo (128-char filenames) and stay language-neutral by policy. The language goes into exported deliverable FILE names per iDD's lesson naming convention.

## Identifying EXISTING translations (runbook)
- Title classification first (scripts and vocabulary distinguish most languages), then caption-content classification for uncertain base languages (free where publishes exist), then the Descript app's translation dropdown for regional pairs that resist content analysis (French pairs in formal narration - verified 2026-08-28). Persist whatever you identify in the project's LANGUAGE-INDEX file so it is never re-derived.
