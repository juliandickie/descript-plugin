---
name: descript-edit
description: Run an Underlord agent edit on a Descript project. Use when the user wants Descript AI to edit a project - add Studio Sound, captions, remove filler words, trim or cut content, rearrange clips, create a highlight reel, rename or retag compositions in bulk, query the project, or any natural-language editing instruction. Also handles creating a new project from a prompt alone.
---

# Descript Agent Edit

Run a one-shot Underlord agent edit.

## Three affordances worth surfacing up front

1. **Omitting `--composition-id` targets the whole project.** This is the bulk-operations mode. One prompt iterates across every composition, conditional on natural-language criteria. Empirically demonstrated by Julian renaming 40 of 42 compositions in a single Underlord prompt (the agent skipped the 2 that already met the rule). See `docs/field-reports/2026-05-20-agent-docs-gap-and-v021-status.md` §2.1.

2. **Underlord queries as well as edits.** Read-only prompts work ("which compositions are shorter than 30 seconds", "list every composition that has not been published"). Edit is the default framing in the upstream docs but the capability surface is broader.

3. **AI credit cost is small per call and is confirmable.** A typical chat message uses a few credits; a tool action uses 5-30 depending on the operation. For credit conservation, Haiku 4.5 is the cost-efficient model choice. Cost is a parameter to confirm, not a reason to dismiss the capability.

## When to Use

- "Add studio sound and captions", "remove filler words", "make a 30s highlight", "rename every composition that ends in X", "which compositions are not yet published"

- NOT for - importing (descript-import) or publishing (descript-publish)

## Instructions

1. The Descript API is one-shot. Frame the entire instruction in a single prompt with all needed detail. There is no follow-up conversation.

2. This SPENDS AI credits and media seconds. Before submitting, state the project, the prompt, and (if relevant) the model, then get explicit user confirmation.

3. Run - `descript agent --project-id <ID> --prompt "<one-shot instruction>" --json`. The agent command also accepts `--composition-id` (target a specific composition; omit to target the whole project), `--model`, and `--project-name` (create a new project from the prompt instead of editing an existing one). Add `--no-wait` to submit without polling (headless). For headless pipelines, add `--callback-url <https url>` (Descript POSTs completion) and `--team-access` for new projects created via `--project-name`.

4. Report `agentResponse`, `aiCreditsUsed`, and `mediaSecondsUsed` from the result so cost is visible.

5. On failure, surface the error and do not silently retry (a retry re-spends credits).

## Canonical capability reference

The full Underlord capability list, model picker, example prompts per class, and beta caveats live in the upstream help docs. Always defer to those when reasoning about what Underlord can do.

- `docs/help-docs/Underlord (beta) Your AI co-editor in Descript.md` - capability classes with example prompts, model picker table, beta caveats ("can overpromise, make incorrect assumptions"). Underlord is beta; verify output, especially on complex multi-step prompts.

- `docs/help-docs/How to write effective prompts for Descript's AI features.md` - Action, Context, Tone, Format, Constraints prompt framework. Note that the API has no `@` mention affordance, so API callers describe context in prose ("the scene starting at 1:30", "every clip on track 2", "the speaker labeled Ben").

- `docs/help-docs/Track and understand your media minutes and AI credits.md` - per-operation credit cost table. Cite this when surfacing cost estimates to the user.

- `docs/help-docs/Descript API.md` - the agent endpoint's "Common use cases" section and request schema.

If a capability is documented upstream but not yet in these notes, try it anyway; the upstream docs invite exploration beyond the listed examples.
