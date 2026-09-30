<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# specs

## Purpose

Design documents for shipped features. Captures the final shape (CLI surface, manifest schemas, output formats, error behaviour) that landed in code. Read these before changing a shipped feature, write a new one before designing a non-trivial new feature.

## Key Files

| File | Description |
|------|-------------|
| `2026-05-17-descript-plugin-design.md` | Full original design for v0.1.0, CLI surface across all 11 endpoints, skill set, MCP shim, batch runner. |
| `2026-05-19-descript-setup-secure-design.md` | v0.2.0 secure setup design (`config edit`, file-locked credentials, no-token-in-chat enforcement). |
| `2026-05-20-descript-export-design.md` | v0.3.0 export design (single/project-wide/multi-project shapes, WebVTT-to-Markdown rules, concurrency defaults, filename sanitisation). |

## For AI Agents

### Working In This Directory

- Specs document what shipped, not what was originally planned. The companion in `../plans/` records the plan, the spec records the result.

- When updating a feature, read the existing spec first to understand the original constraints (cost gates, schema contracts, public-facing flag names). Surprises here usually mean the spec is out of date - prefer writing an addendum (new dated spec) over editing the original.

- A spec is the right place to capture user-visible decisions like flag defaults, output file naming, error codes. The reasoning belongs here, not in the field report.

- Filename pattern is `YYYY-MM-DD-feature-design.md`.

## Dependencies

### Internal

- Pair with `../plans/` (pre-implementation intent) and `../field-reports/` (post-implementation learnings).

### External

- None.

<!-- MANUAL: -->
