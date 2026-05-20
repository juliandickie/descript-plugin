---
name: descript-export
description: Export Descript compositions to local MP4, SRT, and Markdown transcript files. Use when the user wants to download finished compositions and transcripts for chapter generation, archival, or offline work. Handles single compositions, all compositions in a project, or fan-out across multiple projects.
---

# Descript Export

End-to-end pipeline: publish a composition (or many), download the rendered media, write SRT and Markdown transcripts from the WebVTT subtitles. Model-invocable with mandatory in-skill confirmation because each call triggers one publish per composition (server-side render, free on standard plans, but each publish creates a hosted share URL).

## When to Use
- "Download this composition", "give me the MP4 + transcript", "export everything in project X for chapter generation"
- NOT for: re-pulling transcripts from a composition that has already been published (use descript-download-published - read-only, free, no fresh publish)

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
