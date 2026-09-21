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

## 3. Follow-up the same day - the same silent drop, everywhere else

Asked to fix the rest, a wider look found the gap was larger than the five hand-built
mappers named in section 1. Three layers all dropped input without a word.

**Hand-built mappers dropped real, supported options.** `descript_projects` and
`descript_jobs` forwarded only `sub` and `id`, so every list filter the CLI supports
(`name`, `folder_path`, `sort`, `limit`, `project_id`, `type`, date ranges, `cursor`) was
discarded. Live on 21 September 2026, `descript_projects {"name": "Cold Calling", "limit": 5}`
against the installed 0.7.0 returned 20 unfiltered projects. An agent asking "is there a
project called X" got the first page of the whole drive and no hint the filter was ignored.

**The `passthrough` tools were not safe either**, contrary to section 1. They turned every
key into `--<key>` verbatim, so a snake_case argument became a flag the CLI never reads.
`descript_publish {"project_id": "p", "composition_id": "c", "access_level": "private"}`
produced `--composition_id` and `--access_level`, both ignored. For publish that is the
risky one: the caller believes they pinned a composition and an access level and did neither.
Object values were also sent as the literal text `[object Object]`.

**The CLI itself never rejected an unknown flag.** `--timecode-on-paragraphs` (one missing
letter) ran happily and produced a transcript with no timecodes. This is the root: every
surface above it inherits the behaviour.

**Fix, at the root.**

- `src/cli/commands/registry.ts` gains `COMMAND_FLAGS`, the exact set of flags each command
  reads. `runCli` rejects anything else with exit 2, names the offender, lists what is
  allowed, and says nothing was run. A test scans `registry.ts` and fails if a command reads
  a flag that the table does not list, so the table cannot drift.
- `src/mcp/server.ts` has ONE argv builder for all twelve tools. Arguments may be snake_case
  or kebab-case (giving both is an error). Positionals are taken by name, everything else
  must be a flag from `COMMAND_FLAGS` for that command, objects are sent as JSON, values use
  `--flag=value` so a leading `-` survives. Unknown arguments, missing required positionals
  and positionals that look like flags all return `isError` before the CLI runs.
- `descript_projects` and `descript_jobs` now expose every list filter. Tool descriptions
  list the real arguments.
- `jobs get`, `jobs cancel` and `projects get` without an id are usage errors. They used to
  call the API with the literal id `undefined`.

**Behaviour change to know about.** Anything that relied on a flag being ignored now fails
with exit 2. Every flag documented in `README.md`, the CLI usage text and all skills was
checked against the table and is accepted, and the 310 pre-existing tests passed unchanged
with rejection switched on.

**Verification.** `npm test`, 322 of 322. Live over stdio against the rebuilt server:
name filter returns 2 projects (0.7.0 returns 20), `descript_jobs {"limit": 2}` returns 2,
`descript_status` works, `descript_publish` with `acess_level` is refused before any call,
and the CLI typo above exits 2. Only read-only calls were made; nothing was published,
imported or billed.

**Still open, needs a decision.** The CLI usage text says `publish` defaults to
`--access-level private`. It does not. When the flag is omitted the CLI sends no
`access_level`, and the pinned spec says "If omitted, the drive's configured default is
used". The `descript-publish` skill passes the level explicitly, so the skill path is safe,
but a bare `descript publish --project-id X` or a `descript_publish` call without
`access_level` publishes at whatever the drive default is. Either make the CLI send
`private` when the flag is absent, or correct the usage text. Not changed here because it
alters behaviour on a risk-bearing command. Minor: `serverInfo.version` in the MCP
`initialize` reply still says 0.5.0.

## Not done here

- The installed plugin cache (`~/.claude/plugins/cache/outfit/descript/0.7.0`) is untouched
  and still has the gap until a release ships. Until then use the CLI form above for timecodes.
- No version bump, tag or release. That is a separate decision.
