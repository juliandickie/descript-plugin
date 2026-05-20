---
name: descript-download-published
description: Download MP4, SRT, and Markdown transcript files for previously-published Descript compositions. Read-only - no publish, no API write, no cost. Use when iterating on transcripts for already-published compositions, or re-fetching files after the original download URLs expired.
---

# Descript Download Published

Read-only companion to descript-export. Fetches published-metadata for one or more slugs and writes the local files. No publish step, no API write, no cost. The right entry point for chapter-generation iteration.

## When to Use
- "Re-fetch transcripts for these compositions", "I already published, just give me the files"
- "Re-do that chapter prompt against the same transcript"
- NOT for: first-time export of a composition (use descript-export - that triggers the publish)

## Instructions
1. Determine the slugs. One of:
   - User provides a single slug (the last path segment of a Descript share URL, after `/view/`)
   - User has an export-report.json from a prior descript-export run - use --report <path>
   - User has a list of slugs - use --slugs s1,s2,s3

2. Run:
   ```
   descript download-published <slug> \
     --formats <list> \
     --output-dir <path> \
     [--no-end-marker] \
     [--profile <name>] \
     --json
   ```
   For batch, use --slugs <list> or --report <path> in place of the positional slug.

3. Report per-slug outcomes. Same fail-loud rule as export - surface every failed format with its error.

4. Download URLs are 24h-signed. This command always re-fetches /published_projects/{slug} to mint a fresh URL before downloading, so old slugs still work. The slug itself does not expire - Descript persists published items indefinitely until deleted in the UI.
