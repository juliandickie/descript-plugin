<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# descript-edit

## Purpose

Run a one-shot Underlord agent edit on a Descript project. Cost-bearing (spends AI credits and media seconds). Model-invocable WITHOUT `disable-model-invocation`, gated instead by a mandatory in-skill confirmation step so Claude can run edits conversationally. Backs `descript agent`.

## Key Files

| File | Description |
|------|-------------|
| `SKILL.md` | Skill manifest plus confirmation requirement, prompt-writing guidance, and `--project-id` vs `--project-name` semantics. |

## For AI Agents

### Working In This Directory

- The confirmation gate is mandatory. Before submitting an agent call, restate the project, the prompt, and that AI credits and media seconds will be spent, then get explicit user confirmation. Do not adopt a flag-based bypass.

- Do NOT add `disable-model-invocation` to this skill's frontmatter. The whole point of the in-skill confirmation pattern is that Claude can run edits conversationally without operator gating. See root `AGENTS.md` cost-gate rules.

- The Descript agent API is one-shot. No multi-turn refinement. Frame the whole instruction in a single `--prompt "..."` value with all needed detail.

- `--project-id` edits an existing project. `--project-name` creates a new project from the prompt alone (Underlord generates the source). Mutually exclusive in practice.

- After completion, the skill must report `agentResponse`, `aiCreditsUsed`, and `mediaSecondsUsed` from the result.

### Common Patterns

- Async via `--no-wait` plus `--callback-url <https url>`.

- `--composition-id` targets a specific composition inside the project.

- `--model` selects the agent model (defaults to whatever Descript currently routes).

## Dependencies

### Internal

- `../../src/cli/commands/registry.ts` (`agent` handler).

- `../../src/workflows/editAndWait.ts` (poll + normalise).

- `../../docs/help-docs/How to write effective prompts for Descript's AI features.md` (background on Underlord prompting).

### External

- Descript API `/jobs/agent` endpoint. Bills AI credits and media seconds.

<!-- MANUAL: -->
