---
name: descript-import
description: Import media into Descript and create a project, add it to an existing project or composition, or put it in the Drive media library. Use when the user wants to bring a video or audio file or URL into Descript, create a Descript project from media, upload a local recording for editing, append a clip to an existing composition, or add files to the shared media library.
---

# Descript Import

Import media by public URL or local file and create a Descript project, add it to an existing project (optionally appended to a composition), or put it in the Drive's shared media library.

## When to Use
- "Import this video into Descript", "create a Descript project from this URL"
- Local file upload (the CLI runs the three-step signed-URL flow automatically)
- "Add this clip to the end of that composition", "import this into project X"
- "Put these files in the media library" (asks for a confirmation first, see below)
- NOT for: editing content (use descript-edit) or publishing (use descript-publish)

## Instructions
- URL import: `descript import --url "<https url>" --name "Project Name" --json`
- Local file: `descript import --file "/path/clip.mp4" --content-type video/mp4 --name "Project Name" --json`. The file keeps its name (unsafe characters become `-`) as the media reference, and Descript reads the media type from its extension, so keep the extension on the file.
- Any shape (multitrack, mixed, multi-file): `descript import --media '<add_media JSON>' --compositions '<JSON array>' --name "Project" --json`. This reaches the full Descript import surface, including multitrack sequences ({"Seq":{"tracks":[{"media":"a"},{"media":"b","offset":5}]}}).
- Async/headless: add `--callback-url <https url>` so Descript POSTs job completion to your webhook, and `--team-access edit|comment|view|none` for new-project Drive access.
- Add `--no-wait` to submit without polling (headless). Otherwise the command polls to completion and prints the project URL.
- Report the projectUrl and any failedMedia entries to the user.

## Optional Flags (v0.4.0)
- `--folder <path>` - place the new project into a named Drive folder (sets `folder_name` on the import request). Example: `--folder "Client Work/2026"`.
- `--language <code>` - ISO 639-1 language code applied to the imported media item for transcription (e.g. `--language es` for Spanish, `--language fr` for French). Applied to URL imports and `--file` uploads; not applied when using raw `--media` JSON (the caller controls per-item language in that case).
- `--project-id <id>` - import additional media into an existing project instead of creating a new one. When set, `--name` and `--compositions` are ignored and `add_compositions` is omitted from the request. Use with `--url`, `--file` (v0.8.0) or `--media`, one of them at a time.

## Optional Flags (v0.5.0)
- `--workspace <name>` places a NEW project in a workspace (`Personal`, `General`, or a custom workspace name; case-insensitive). Personal requires `--team-access none` or omitted; General/custom require edit|comment|view (default view). Not valid with `--project-id`.

## Add to an existing project, and append to a composition (v0.8.0)
- `--project-id <id> --file "/path/clip.mp4"` uploads a local file into an existing project, the same way `--file` does for a new one (`--content-type`, `--language` apply).
- `--project-id <id> --composition-id <cid> --url "<https url>"` (or `--file "/path/clip.mp4"`) imports the item and appends it to the END of that composition. `<cid>` is a composition UUID, the 5-character short id from a Descript URL (for example `b65d1`), or a full project URL. The command reports `Imported into <project url> and appended to composition <cid>`.
- `--project-id <id> --media '<add_media JSON>' --update-compositions '<JSON array>'` is the raw form, for several clips or several compositions at once: `[{"composition_id":"b65d1","append_clips":[{"media":"a.mp4"},{"media":"b.mp4","mute":true}]}]`. Each `media` names a key of the same command's `--media`. It is sent as given, so `--composition-id` and `--update-compositions` cannot be used together.
- `--composition-id` and `--update-compositions` need `--project-id`. `--composition-id` takes `--url` or `--file` (not `--media`), and `--update-compositions` takes `--media` only. Anything else exits 2 before any request, and so does giving more than one of `--url`, `--file` and `--media` together with `--project-id` (or `--library`).
- A URL imported into an existing project (or the library) is registered under the URL's file name, extension kept and unsafe characters replaced by `-`, so a second import into the same project does not collide. A URL with no extension falls back to `media.0`, but Descript reads the media type from the extension of a URL's path, so an extensionless URL is expected to fail with "Failed to read media metadata"; use a URL that ends in the file name. New-project URL imports still use `media.0`.
- Appending is live-validated but not in Descript's published spec, and the clip must come from the same command's import (whether it can name media already in the project is untested).

## Import into the drive media library (v0.8.0)
`descript import --library (--url <u> | --file <path> | --media <json>) [--folder-id <uuid>] [--language <code>] [--content-type <mime>] [--callback-url <u>] [--no-wait]`

This is different from every other import: the files do not go into a project. They land in the Drive's shared media library, where every member of the Drive can see and use them.

Confirmation step, do this before running `--library`:
1. Tell the user the files will be added to the Drive's shared media library, visible to every Drive member, and not to a project.
2. Tell them the import spends media minutes (it uses no AI credits).
3. Confirm the destination, and the folder if there is one, and only then run it. If they meant a project, drop `--library`.

- `--folder-id <uuid>` picks a media library folder. Find its id with `descript search --type media_library_folder "<name>"`; each result carries a `folder_id`. Without it the library's default location applies.
- References: `--url` files are named after the URL's file name (`media.0` when it has none), `--file` keeps the file's name, and `--media` keys are sent as given (they may carry folder paths). Sequences (`tracks`) are not accepted by the library, and `--media` with one exits 2.
- `--library` cannot be combined with `--name`, `--project-id`, `--workspace`, `--team-access`, `--folder`, `--compositions`, `--composition-id` or `--update-compositions`, and `--folder-id` is only valid with `--library` (and must be a UUID). All of these exit 2 before any request.
- The command polls, then prints `Imported <n> file(s) into the drive media library` (plus `(folder <id>)`), or `Library import failed: <error>` and exit 4. `--json` prints `{ ok, jobId, driveId, status, mediaStatus?, error?, result }` where `result` is the raw job result. `--no-wait` prints the submit response. Live but not in Descript's published spec, and the job result shape has not been observed yet, so read `result` when something looks off.

Import consumes media processing but does not spend AI credits.
