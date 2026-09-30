<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# docs

## Purpose

Reference material, committed on 2026-09-30 at Julian's direction (it was local-only before then). Contains the OpenAPI spec the CLI was built against, Descript help-doc captures used to write skill instructions, dated field reports from real runs, dated plans for upcoming work, and dated design specs for shipped features.

## Key Files

| File | Description |
|------|-------------|
| `descript-openapi.json` | The OpenAPI 3 specification for the Descript API. Authoritative source for endpoint shapes, request bodies, response unions. The CLI's `src/client/types.ts` is hand-derived from this. Refreshed 2026-08-27 (adds /agent/models, /export/transcript; see field report of same date). Prior baseline in legacy/. |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `field-reports/` | Dated post-flight reports on real runs and discovered behaviours (see `field-reports/AGENTS.md`). |
| `help-docs/` | Captured Descript help-centre articles used as Underlord/Agent prompting reference (see `help-docs/AGENTS.md`). |
| `plans/` | Dated implementation plans for individual features (see `plans/AGENTS.md`). |
| `specs/` | Dated design documents for shipped features (see `specs/AGENTS.md`). |

## For AI Agents

### Working In This Directory

- Treat `descript-openapi.json` as ground truth when reconciling discrepancies between the CLI's type definitions and observed API behaviour. When the live API contradicts both, capture the divergence in a new field report.

- Plans, specs, and field reports use ISO date prefixes (`YYYY-MM-DD-name.md`) so directory listings sort chronologically. Keep this convention.

- Field reports describe what actually happened in a run, especially API surprises (e.g. the `--access-level drive` rejection in `2026-05-20-v030-followup-backlog.md`). Reference them in CHANGELOG entries.

- Help-doc markdown is verbatim from Descript's help centre. Filenames may contain spaces and apostrophes. Treat these as immutable inputs, do not rewrite them.

- `docs/help-docs/` stays local-only and is gitignored: it holds verbatim copies of Descript's help-centre articles, which are Descript's copyrighted content and must not be republished in this public repo. Skills should point at the live pages on help.descript.com instead.

- The rest of `docs/` is committed and public. Keep client names, private media URLs and people's names out of it; use placeholders.

### Adding to docs

When wrapping up a feature, write the spec to `specs/YYYY-MM-DD-feature.md`, the plan to `plans/YYYY-MM-DD-feature.md`, and any post-run learnings to `field-reports/YYYY-MM-DD-topic.md`. The spec gets written before code, the field report after.

## Dependencies

### Internal

- None. Documentation only.

### External

- `descript-openapi.json` is downloaded from Descript's API documentation.

- `help-docs/*.md` are captures from descript.com/help.

<!-- MANUAL: -->
