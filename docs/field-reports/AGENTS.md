<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# field-reports

## Purpose

Post-flight reports on real production runs against the Descript API. Captures behaviour the OpenAPI spec does not document, API quirks worth remembering, and backlog items surfaced by real work. Each file describes one episode, one date, one topic.

## Key Files

| File | Description |
|------|-------------|
| `2026-05-20-agent-docs-gap-and-v021-status.md` | Gaps between Descript's documented agent surface and what the API actually accepts, plus v0.2.1 status. |
| `2026-05-20-mp4-srt-md-export-workflow.md` | End-to-end recipe behind the `descript export` workflow. Source for the per-cue Markdown format used by the chapter-generation tip in the README. |
| `2026-05-20-v030-followup-backlog.md` | Issues surfaced during v0.3.0 (export + download-published) testing. Source for the rejection of `--access-level drive` and the conditional billing clarification in CLAUDE.md. |

## For AI Agents

### Working In This Directory

- Field reports are append-only. Do not edit a dated report to revise its conclusions, write a new dated report that references the old one.

- Reports must capture what was observed (request, response, error) and what changed in the CLI as a result. The CHANGELOG entry references the report by date.

- These are diagnostic artifacts, not user-facing docs. Internal vocabulary and shorthand are fine.

- New report filename pattern: `YYYY-MM-DD-short-slug.md`. Lowercase, hyphens.

## Dependencies

### Internal

- Often referenced from `../specs/` and `CHANGELOG.md`.

### External

- None.

<!-- MANUAL: -->
