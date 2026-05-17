---
name: descript-import
description: Import media into Descript and create a project. Use when the user wants to bring a video or audio file or URL into Descript, create a Descript project from media, or upload a local recording for editing.
---

# Descript Import

Import media by public URL or local file and create a Descript project.

## When to Use
- "Import this video into Descript", "create a Descript project from this URL"
- Local file upload (the CLI runs the three-step signed-URL flow automatically)
- NOT for: editing content (use descript-edit) or publishing (use descript-publish)

## Instructions
- URL import: `descript import --url "<https url>" --name "Project Name" --json`
- Local file: `descript import --file "/path/clip.mp4" --content-type video/mp4 --name "Project Name" --json`
- Any shape (multitrack, mixed, multi-file): `descript import --media '<add_media JSON>' --compositions '<JSON array>' --name "Project" --json`. This reaches the full Descript import surface, including multitrack sequences ({"Seq":{"tracks":[{"media":"a"},{"media":"b","offset":5}]}}).
- Async/headless: add `--callback-url <https url>` so Descript POSTs job completion to your webhook, and `--team-access edit|comment|view|none` for new-project Drive access.
- Add `--no-wait` to submit without polling (headless). Otherwise the command polls to completion and prints the project URL.
- Report the projectUrl and any failedMedia entries to the user.

Import consumes media processing but does not spend AI credits.
