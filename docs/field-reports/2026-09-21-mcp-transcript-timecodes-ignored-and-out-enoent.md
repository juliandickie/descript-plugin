# 2026-09-21 - MCP `descript_transcript` ignores `timecodes`, and `--out` fails on a missing folder

Additive field note. Two gaps found on 21 September 2026 while exporting transcripts through
the MCP tool from a Claude desktop session running the installed v0.7.0 plugin. Both are
fixed on branch `fix/mcp-transcript-timecodes` (see "Fix" below); this note records what was
observed and why it happened.

## 1. The MCP tool accepted `timecodes` without error and then ignored it

Calling `descript_transcript` with

```json
{ "project_id": "<pid>", "composition_id": "<cid>", "format": "markdown",
  "speaker_labels": "changes", "timecodes": { "on_paragraphs": true, "on_speakers": true } }
```

returned success, and the exported Markdown had no `[HH:MM:SS]` marks. The file was 531 bytes
with the argument and 531 bytes without it.

The CLI honours timecodes. The same composition through

```bash
node bin/descript transcript <pid> <cid> --format markdown --speaker-labels changes --timecodes-on-paragraphs --out <path>
```

produced 564 bytes, with timecodes.

**Cause.** `src/mcp/server.ts` builds the CLI argv for `descript_transcript` by hand, naming
each argument it forwards (`project_id`, `composition_id`, `format`, `speaker_labels`,
`markers`, `out`). `timecodes` was never in that list, so it was dropped. The tool's
`inputSchema` is `{ type: "object", additionalProperties: true }`, so nothing upstream
rejected it either. The result is the worst shape a gap can take: a plausible argument, a
success response, and output that is quietly wrong.

**The same shape exists in the other hand-built mappers.** `descript_jobs`,
`descript_projects`, `descript_published`, `descript_batch` and `descript_translate` also
forward only named keys and drop the rest without a word. Only `descript_transcript` is
hardened in this change. The others are a follow-up (the `passthrough` tools are not
affected, they forward every key as a flag).

**Related CLI gap.** The Descript API's `timecodes` object has five fields
(`frequency_seconds`, `offset_seconds`, `on_markers`, `on_paragraphs`, `on_speakers`, all in
the pinned `docs/descript-openapi.json`). The CLI and `TranscriptTimecodeOptions` carried
only four. `on_speakers` had no flag, so it could not be requested from any surface.

## 2. `--out` fails with ENOENT when the parent folder does not exist

`descript transcript ... --out /some/new/folder/t.md` called `writeFileSync` directly. With
a missing parent the run ended in a raw `ENOENT: no such file or directory, open ...` AFTER
the API call had already succeeded. Transcript export is free, so no money was lost, but the
error read like a Descript failure rather than a local path problem, and agents writing into
a fresh per-course folder hit it on the first file every time.

## Fix

- `descript_transcript` accepts `timecodes` as the API-shaped object and maps it onto the
  CLI's `--timecodes-*` flags, so the MCP tool and the CLI share one code path
  (`buildTimecodes` in `src/cli/commands/registry.ts`). No API logic is duplicated in the shim.
- New CLI flag `--timecodes-on-speakers`, and `on_speakers` added to `TranscriptTimecodeOptions`.
- `descript_transcript` now REJECTS what it does not understand, before the CLI runs: an
  unknown top-level argument, a `timecodes` value that is not an object, an unknown
  `timecodes` key, or a wrong value type. Each returns `isError: true` with the allowed list.
  `handleRpc` catches a throwing argv builder for this.
- `transcript --out` creates missing parent folders (`mkdir -p` behaviour) before writing.

## Verification

- `npm test`, 310 of 310 passing, including an end-to-end test that drives
  `tools/call` through the real executor and asserts the `timecodes` object in the API
  request body.
- Live, 21 September 2026, rebuilt `dist/src/mcp/server.js` over stdio against project
  `6e60e6c4-162c-4088-92d1-0caec4c85251`, writing into a folder that did not exist.
  Without `timecodes`, 61,983 bytes and 0 `[HH:MM:SS]` marks. With
  `{"on_paragraphs": true, "on_speakers": true}`, 65,558 bytes and 325 marks.
  `{"on_paragraf": true}` and a top-level `timecode` both returned `isError: true` with the
  allowed keys listed, and no API call was made.

## Not done here

- The installed plugin cache (`~/.claude/plugins/cache/outfit/descript/0.7.0`) is untouched
  and still has the gap until a release ships. Until then use the CLI form above for timecodes.
- Hardening the other hand-built MCP mappers against unknown arguments.
- No version bump, tag or release. That is a separate decision.
