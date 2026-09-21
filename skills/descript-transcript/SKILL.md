---
name: descript-transcript
description: Export a transcript from a Descript project composition as txt, markdown, html, rtf, docx, or srt. Free, synchronous, creates no share URL and spends no credits. Use when the user wants a transcript, captions file, or subtitle file from a Descript project and does not need rendered media.
---

# Descript Transcript Export

## When to Use
- "Get me the transcript of X", "export SRT captions", "give me the markdown transcript"
- Transcript or captions ONLY. If the user also wants the rendered media file (mp4), route to descript-export instead - that path publishes first. Never publish just to obtain a transcript.
- ORIGINAL language only. The transcript layer stays in the source language even on translated compositions (verified 2026-08-27). For translated subtitles route to descript-export (existing translations, publish path) or descript-translate (create a new translation).

## Instructions
- Single composition: `descript transcript <project-id> <composition-id> --format markdown --json`
- Omit the composition id to export the project's first composition.
- Formats: txt, markdown, html, rtf, docx, srt. docx is binary and requires `--out <path>`; the other formats print to stdout unless `--out` is given.
- Speaker labels default to `changes`; override with `--speaker-labels off|changes|every_paragraph`.
- `--markers` includes markers. Timecodes (adds `[HH:MM:SS]` marks): `--timecodes-every <sec>`, `--timecodes-offset <sec>`, `--timecodes-on-paragraphs`, `--timecodes-on-speakers`, `--timecodes-on-markers`.
- `--out <path>` creates missing parent folders.
- MCP tool `descript_transcript` takes the same options as a `timecodes` object, for example `{"on_paragraphs": true, "on_speakers": true}` (keys `on_paragraphs`, `on_speakers`, `on_markers`, `frequency_seconds`, `offset_seconds`). It rejects unknown arguments rather than ignoring them. Plugin versions up to 0.7.0 silently drop `timecodes` on the MCP tool - on those versions use the CLI flags, and always confirm the marks are present in the output.
- Find project and composition ids with `descript projects list --json` and `descript projects get <id> --json`.

## Cost and Safety
- Free. No AI credits, no media seconds, no share URL, no job created. Read-only against the project. No confirmation needed.
