---
name: descript-search
description: Search a Descript Drive for projects, media files, folders and layout packs by name, or by words spoken in a transcript. Free, read-only, creates nothing and spends no credits. Use when the user wants to find a Descript project by name, find which project contains a phrase someone said, find video, audio or image files across projects and the media library, or look up a project folder or media library folder id.
---

# Descript Drive Search

## When to Use
- "Find the project called X", "which project has the lesson where I say Y", "find the standup recording", "what is the folder id for B-roll"
- Find a project by name when the user has no id: search first, then use the returned `project_id` with transcript, edit, publish or export. (`descript projects list --name` also filters by name. Use search when the user remembers a spoken phrase, a media file or a folder rather than a project name, or wants projects, files and folders in one ranked list.)
- Find which project contains a phrase: `--match content` searches transcripts and composition text.
- Find media files by name across projects, the drive media library and Brand Studio: `--type video`, `audio` or `image`.
- Find folder ids: `--type project_folder` or `--type media_library_folder`. Search is the only public source of folder ids. The `folder_id` of a `media_library_folder` result is the id `descript import --library --folder-id <id>` takes.
- Search by words or by the full file name. Live on 2026-09-30, `descript-plugin-qa-delete-me.wav` and `delete me` both found a file, but the hyphenated fragment `descript-plugin-qa-delete-me` without the extension found nothing.
- NOT for: listing every project (use `descript projects list`, it pages), or reading a transcript (use descript-transcript once you have the `project_id`).

## Instructions
- Command: `descript search <query words...> [--type a,b] [--match name,content] [--owner uuid,uuid] [--updated-after <date>] [--updated-before <date>] [--sort relevance|newest|oldest] [--limit 1-100]`
- Every word after `search` is part of the query, so quotes are optional: `descript search quarterly update` searches for "quarterly update". The query must not be empty.
- List flags take comma-separated values with no spaces: `--type project,audio`. Never write `--type project audio`, the second word would be read as part of the query. Put `--json` after the query words.
- `--type` values: project, video, image, audio, project_folder, media_library_folder, layout_pack. Default is all types.
- `--match` values: `name` (project, file, folder and layout pack names) and `content` (transcripts and composition text). Default is both.
- `--owner` takes user UUIDs. They come from the `owner.id` of earlier results in `--json` output, there is no lookup by name.
- `--updated-after` and `--updated-before` take an ISO 8601 date (`2026-08-01`, the start or end of that UTC day) or a timestamp (`2026-08-01T09:30:00Z`). A value with no timezone is read as UTC. They filter on last modified, not creation.
- `--sort` is `relevance` (default, best match first), `newest` or `oldest` (by last modified). `--limit` is 1-100, default 30.
- Output is one line per result, best match first: `<type>  <name>  <id>  <url>`. The id is `project_id` for project and layout_pack, `asset_id` for video, image and audio, `folder_id` for the two folder types. Media lines end with `(location, seconds)`, where location is media_library, project or brand_studio. The last line is the count, or `No results`.
- Add `--json` for the full records: `owner`, `updated_at`, `thumbnail_url`, and for media inside a project the `project_id` (or the `brand_studio_id` for Brand Studio files).
- A content match returns the project, not the matching text. To find the moment, run descript-transcript on the `project_id` and read or search the text.
- Invalid enum values, a non-UUID owner, a bad limit and an empty query are usage errors (exit 2) and no request is sent. `No results` is not an error, so try a shorter query or fewer filters. A 404 means the search endpoint is not enabled for the token's user.
- MCP tool `descript_search` takes the same options (`query`, `type`, `match`, `owner`, `updated_after`, `updated_before`, `sort`, `limit`). `type`, `match` and `owner` accept a JSON array of strings or a comma-separated string. Unknown arguments are rejected, never ignored.

## Examples
- Find a project by name: `descript search quarterly update`
- Find which project contains a spoken phrase: `descript search crown preparation --match content --type project`
- Find recordings by file name, newest first: `descript search standup --type video,audio --sort newest --limit 10`
- Find the media library folder id for an import: `descript search B-roll --type media_library_folder`
- Recent work only, with full records: `descript search onboarding --updated-after 2026-08-01 --json`

## Cost and Safety
- Free. No AI credits, no media seconds, no share URL, no job created. Read-only against the Drive. No confirmation needed.
- Thumbnail URLs in `--json` output are signed and time-limited, treat them as temporary.
