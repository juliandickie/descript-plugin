<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# descript-api-reference

## Purpose

Reference-only skill. Carries background knowledge of the Descript API endpoint surface and the `descript` CLI subcommands. Loaded by Claude as context when constructing Descript requests. Not user-invocable.

## Key Files

| File | Description |
|------|-------------|
| `SKILL.md` | Skill manifest with `user-invocable: false`. Endpoint summary, CLI surface, job-state semantics. |

## For AI Agents

### Working In This Directory

- `user-invocable: false` is required. This skill is not a callable workflow, it is loaded as background context only.

- Keep this file in sync with the CLI surface (`src/cli/index.ts` USAGE constant) and the OpenAPI in `../../docs/descript-openapi.json`. When new endpoints land, update both this file and the OpenAPI capture.

- Be concise. The skill is loaded into Claude's context every time a Descript task is reached, every line counts toward the budget.

- Cost annotations matter (only `agent` is billable on standard plans, see root `AGENTS.md`). Surface them here so Claude knows which CLI calls require confirmation gates.

### Common Patterns

- Use the same vocabulary as the rest of the codebase (`agent` not "Underlord edit", `publish` not "share").

- Reference skill names not CLI command names for actions the user should take (e.g. "use the `descript-edit` skill", not "run `descript agent`"), since skill names route Claude into confirmation gates.

## Dependencies

### Internal

- Tracks `../../src/cli/index.ts` USAGE.

- Tracks `../../docs/descript-openapi.json` endpoint definitions.

- Tracks the rest of the `../` skill set.

### External

- Descript API surface (the underlying truth this skill summarises).

<!-- MANUAL: -->
