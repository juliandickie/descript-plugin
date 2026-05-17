---
name: descript-edit
description: Run an Underlord agent edit on a Descript project. Use when the user wants Descript AI to edit a project - add Studio Sound, captions, remove filler words, trim or cut content, rearrange clips, create a highlight reel, or any natural-language editing instruction. Also handles creating a new project from a prompt alone.
---

# Descript Agent Edit

Run a one-shot Underlord agent edit.

## When to Use
- "Add studio sound and captions", "remove filler words", "make a 30s highlight"
- NOT for: importing (descript-import) or publishing (descript-publish)

## Instructions
1. The Descript API is one-shot. Frame the entire instruction in a single prompt with all needed detail. There is no follow-up conversation.
2. This SPENDS AI credits and media seconds. Before submitting, state the project and prompt and get explicit user confirmation.
3. Run: `descript agent --project-id <ID> --prompt "<one-shot instruction>" --json`. The agent command also accepts --composition-id (target a specific composition), --model, and --project-name (create a new project from the prompt instead of editing an existing one - use this instead of --project-id when there is no project yet).
   Add --no-wait to submit without polling (headless).
   For headless pipelines, add --callback-url <https url> (Descript POSTs completion) and --team-access for new projects created via --project-name.
4. Report agentResponse, aiCreditsUsed, and mediaSecondsUsed from the result so cost is visible.
5. On failure, surface the error and do not silently retry (a retry re-spends credits).
