---
name: descript-export
description: Export Descript compositions to local MP4, SRT, and Markdown transcript files. Use when the user wants to download finished compositions and transcripts for chapter generation, archival, or offline work. Handles single compositions, all compositions in a project, or fan-out across multiple projects. For transcript or caption files alone, without rendered media, use descript-transcript instead.
---

# Descript Export

End-to-end pipeline: publish a composition (or many), download the rendered media, write SRT and Markdown transcripts from the WebVTT subtitles. Model-invocable with mandatory in-skill confirmation because each call triggers one publish per composition (server-side render, free on standard plans, but each publish creates a hosted share URL).

## When to Use
- "Download this composition", "give me the MP4 + transcript", "export everything in project X for chapter generation"
- NOT for: re-pulling transcripts from a composition that has already been published (use descript-download-published - read-only, free, no fresh publish)
- Transcript or captions ONLY (no media file needed)? Route to descript-transcript instead - it is free and creates no share URL. This skill's srt/md come from a publish.

## Instructions
1. Confirm scope. One of:
   - Single composition: project id + composition id
   - Whole project: project id only, all compositions
   - Multiple projects: --projects pid1,pid2,...

2. Confirm deliverables. Default is mp4 + srt + md. If the user says "just the transcripts" or "no need for the video", ask explicitly: "Descript renders the MP4 server-side regardless because their API has no transcript-only publish path. Do you want me to also download the MP4 now (one extra download per composition), or skip it (it stays on Descript's CDN - `descript download-published <slug> --formats mp4` will fetch it later)?"

3. Confirm access level. Default is private (export-and-download workflow). Only override if the user specifically needs unlisted or public.

4. Confirm output dir. Default is the current directory. Confirm if not specified.

5. Run:
   ```
   descript export <PID> [CID] \
     --formats <list> \
     --output-dir <path> \
     --access-level private \
     --concurrency 5 \
     [--composition-ids id1,id2] \
     [--no-end-marker] \
     [--profile <name>] \
     --json
   ```
   For multi-project, replace `<PID>` with `--projects pid1,pid2,...`.

6. Report per-composition outcomes. The CLI emits a per-item report (slug, title, output dir, written formats, failed formats). Do not summarize partial success as success - surface every failed format with its error.

7. For iteration ("regenerate just the transcripts after editing my chapter-gen prompt"), use descript-download-published with the slugs from the prior run's export-report.json. That path is read-only and free.

8. A 403 from publish means the Drive's publish settings block the requested access level. Report the hint from the error.

## Resume (v0.4.1+)

If a prior export was interrupted or some output files were deleted, use `--resume <path-to-export-report.json>` instead of repassing project IDs. The CLI -

- Reads the prior `export-report.json`.

- Per item, decides per-format whether to skip (already on disk), re-download (file missing but slug recorded), or re-publish-and-download (publish failed in the original run).

- Writes a new `resume-report.json` in the output dir with the same schema-versioned shape.

Resume rules -

- `--resume` is mutually exclusive with positional `<project-id>`, `--projects`, and `--composition-ids`.

- `--formats` on a resume call narrows the format set; it cannot widen beyond what the original run attempted. The CLI rejects disjoint format sets at parse time with a clear "run a fresh export instead" message.

- Items where the prior report records a successful publish (non-empty slug) skip republish on resume - cost-reuse principle.

See `docs/specs/2026-05-21-export-resume-design.md` for the full semantics table.

## Translated compositions and bulk sweeps
- Translated captions export through THIS path: publish the translated composition, download its SRT. `descript export <pid> --composition-ids <ids> --formats srt --concurrency 1`.
- Publishes serialize PER PROJECT (vendor constraint) - the CLI now chains same-project items automatically, but budget roughly 4-6 minutes of render per 12-minute composition; a whole-project language sweep is an hours-long batch.
- Regional variants produce IDENTICAL composition titles; colliding titles are auto-disambiguated with a " [slug]" folder suffix - read outputDir per item from the report rather than assuming title-named folders.
