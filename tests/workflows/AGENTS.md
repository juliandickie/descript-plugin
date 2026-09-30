<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# workflows

## Purpose

Targeted tests for each orchestration module. Heavier than the per-endpoint client tests because workflows compose multiple HTTP calls, file IO, and parsing.

## Key Files

| File | Description |
|------|-------------|
| `andWait.test.ts` | `importAndWait`, `editAndWait`, `publishAndWait`. Asserts submit-then-poll-then-normalise flow, success and failure shapes. |
| `poll.test.ts` | `pollJob` backoff schedule, terminal states (`stopped`), max-attempts behaviour. |
| `upload.test.ts` | The three-step direct-upload flow (signed-URL, PUT, import submission). Asserts the three calls happen in order with the right shapes. |
| `batch.test.ts` | `parseManifest`, `planBatch`, `runBatch`. URL-only rejection at parse time, concurrency, per-item failure isolation, aggregate counts. |
| `exportBatch.test.ts` | Shared batch loop used by `descript export` and `descript download-published`. Per-item publish (or skip), download, write, report shape. The largest workflow test file. |
| `exportPublished.test.ts` | Single-composition download. Published-metadata fetch, MP4 download, WebVTT-to-SRT-to-Markdown conversion. |
| `filenameSanitize.test.ts` | The Drive-sync rule set. Covers every disallowed character, the curly-quote normalisation, trademark glyph removal, length cap at 200, `untitled` fallback. |
| `webvtt.test.ts` | WebVTT parser plus SRT and Markdown emitters. Cue identifiers, `STYLE` blocks tolerated, speaker labels on change, optional `END` marker. |

## For AI Agents

### Working In This Directory

- Tests cover both happy path and per-item-failure-isolation paths. The latter is critical for `batch` and `exportBatch`, the contract is that one failed item must not abort the batch.

- WebVTT tests use captured real-world subtitles from Descript renders, not synthetic minimal cases. New tests should follow the same pattern.

- Filename sanitisation tests must include the exact characters from Julian's global CLAUDE.md (`< > ? # % * : |`, `/`, `\`, `&`, curly quotes, trademark glyphs) plus length-cap edge cases.

- Report-shape tests assert the `{ items, succeeded, failed, ok }` aggregate matches between `descript export` and `descript download-published` so the `--report` round-trip works.

### Common Patterns

- Each workflow test composes its own `mockFetch` queue rather than sharing fixtures, so tests stay independent.

- Use `mkdtempSync` from `node:fs` for any test writing files.

## Dependencies

### Internal

- `../../src/workflows/`.

- `../helpers/mockFetch.ts`.

### External

- `node:test`, `node:assert/strict`, `node:fs`, `node:os`, `node:path`.

<!-- MANUAL: -->
