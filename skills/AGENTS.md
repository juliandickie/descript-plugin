<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# skills

## Purpose

Nine model-facing skills wrapping the `descript` CLI. Each skill targets one CLI command (or a related cluster) and carries the instructions Claude needs to invoke that command safely. Skills are the surface Claude sees, the CLI is the surface that executes. Skills never duplicate API logic, they shell out.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `descript-setup/` | Configure and verify the API token (`descript config edit`, `descript status`). See `descript-setup/AGENTS.md`. |
| `descript-import/` | Import media into Descript (`descript import`). See `descript-import/AGENTS.md`. |
| `descript-edit/` | Underlord agent edits, cost-bearing (`descript agent`). See `descript-edit/AGENTS.md`. |
| `descript-publish/` | Publish to share URL (`descript publish`). Operator-only. See `descript-publish/AGENTS.md`. |
| `descript-export/` | Publish + download MP4 + SRT + Markdown (`descript export`). See `descript-export/AGENTS.md`. |
| `descript-download-published/` | Read-only deliverable re-fetch (`descript download-published`). See `descript-download-published/AGENTS.md`. |
| `descript-jobs/` | Inspect, list, cancel jobs (`descript jobs ...`). See `descript-jobs/AGENTS.md`. |
| `descript-batch/` | Bulk pipeline runner (`descript batch plan|run`). Operator-only. See `descript-batch/AGENTS.md`. |
| `descript-api-reference/` | Background knowledge skill, not user-invocable. See `descript-api-reference/AGENTS.md`. |

## For AI Agents

### Working In This Directory

- Each skill is a directory with at minimum `SKILL.md`. Frontmatter at the top of `SKILL.md` controls model invocation, user invocation, and discovery descriptions. Read it before changing skill behaviour.

- Cost and risk classification (see root `AGENTS.md`):
  - Operator-only (carry `disable-model-invocation: true`): `descript-publish`, `descript-batch`.
  - Cost-bearing, model-invocable with mandatory in-skill confirmation: `descript-edit`.
  - Risk-bearing, model-invocable with mandatory in-skill confirmation: `descript-export`.
  - Free and unrestricted: `descript-setup`, `descript-import`, `descript-jobs`, `descript-download-published`.
  - Reference-only, not user-invocable: `descript-api-reference`.

- Skills shell out to `descript ...`. They do not parse JSON responses themselves beyond simple inspection, the CLI returns either a friendly message or a `--json` payload.

- The skill `name` field in frontmatter must match the directory name exactly (Claude Code uses both interchangeably for routing).

- The skill `description` field is the single most important triggering signal. Optimise it for the situations the user is likely to phrase. Include trigger verbs ("export", "publish", "import"). Include "Descript" so model invocation routes here over generic skills.

### Adding a New Skill

1. Decide whether the underlying CLI command exists. If not, add it under `src/cli/commands/registry.ts` first.

2. Create `skills/descript-<verb>/SKILL.md` with frontmatter (`name`, `description`, plus `disable-model-invocation: true` if operator-only).

3. Write instructions in second-person imperative ("Run: ...", "Report: ...").

4. If cost-bearing, include a mandatory in-skill confirmation step.

5. Register in `.claude-plugin/plugin.json` if the skill folder is not auto-discovered (currently the `skills` pointer covers the directory).

### Common Patterns

- Always end the recommended command with `--json` so structured output flows back.

- Where the API returns billing fields (`ai_credits_used`, `media_seconds_used`), require the skill to surface them.

- Confirmation steps in cost-bearing or risk-bearing skills must be explicit prose, not a flag. The user must say yes in chat.

## Dependencies

### Internal

- `../bin/descript` (compiled CLI) for command execution.

- `../docs/help-docs/` for background context on Underlord and AI billing.

### External

- Claude Code skill runtime.

<!-- MANUAL: -->
