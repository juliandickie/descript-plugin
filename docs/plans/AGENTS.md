<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# plans

## Purpose

Dated implementation plans for individual features. Written before code. Captures scope, sequencing, and decisions for the upcoming change. After the feature ships, the matching design spec in `../specs/` and the field report in `../field-reports/` close the loop.

## Key Files

| File | Description |
|------|-------------|
| `2026-05-17-descript-plugin.md` | Initial v0.1.0 plan covering the full Descript API surface, CLI, skill set, and MCP shim. |
| `2026-05-19-descript-setup-secure.md` | v0.2.0 plan for the secure setup rework (`config edit`, locked credentials file, no-token-in-chat guardrail). |
| `2026-05-20-descript-export.md` | v0.3.0 plan for `descript export` and `descript download-published`. |

## For AI Agents

### Working In This Directory

- Plans are pre-implementation thinking. They go stale as code changes. Do not update them after a feature ships, write a field report or a new plan instead.

- A new plan precedes any non-trivial feature. Match the dated naming convention (`YYYY-MM-DD-feature.md`).

- When picking up an in-flight plan, treat it as the intent of the original author. Confirm divergences with Julian before deviating from the plan in code.

- Plans link forward to the eventual spec (`../specs/YYYY-MM-DD-...-design.md`) and field reports.

## Dependencies

### Internal

- Pair with files in `../specs/` and `../field-reports/`.

### External

- None.

<!-- MANUAL: -->
