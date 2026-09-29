# Field Report - API and MCP Capability Audit (2026-09-30)

Status - FINDINGS ONLY (docs refreshed, no CLI behaviour changed; candidate scope for v0.8.0)

Author - Claude, under Julian Dickie's direction

Method - Downloaded the published spec (version 1.2) from https://help.descript.com/developers/openapi.json (docs.descriptapi.com now serves the same file; the developer docs moved to help.descript.com/developers) and diffed it against the 2026-08-27 baseline. Read the developer guides and the MCP help pages. Probed the live v1 API with the iDD Drive token: GET requests, plus POST requests whose bodies were deliberately invalid or named a nonexistent project (all-zero UUID), so validation answered and nothing was created. Exercised the free endpoints end to end on the test project `88dc66c3-fe61-4d31-b8e4-aaf6126eda93` ("v0.7.2 upload check"). Called the read-only tools of Descript's official MCP connector (the Claude directory connector) and compared its full tool schemas with the plugin.

## Verdict

The documented API gained one endpoint (`GET /search`) and a handful of field-level changes. The bigger news is undocumented. The v1 API already serves the features Descript's MCP connector advertises beyond the spec: timeline export (six NLE and DAW formats, all verified end to end), import into the drive media library, and appending clips to an existing composition. Two plugin guards are now stale: `jobs --type` rejects job types the API accepts, and `publish --access-level` rejects `drive`, which the API accepts. Nothing in the plugin is broken.

## Documented changes (spec 1.2 vs the 2026-08-27 baseline)

### GET /search (new)

Searches the token's Drive across project names, folder names, layout pack names, media file names, composition text and transcripts, covering projects, the drive media library and Brand Studio. Up to 100 results, relevance-ranked.

- Query params - `query` (required), `type` (repeatable - project, video, image, audio, project_folder, media_library_folder, layout_pack), `match` (repeatable - name, content), `owner` (repeatable user UUIDs), `updated_after`, `updated_before` (ISO date or timestamp, UTC), `sort` (relevance, newest, oldest), `limit` (1-100, default 30).
- Result shapes - projects and layout packs carry `project_id`, `name`, `url`, `owner`, `updated_at`. Media carry `asset_id`, `location` (`project`, `media_library` or `brand_studio`), `project_id` or `brand_studio_id` to match, `duration` and `thumbnail_url`. Project folders and media library folders carry `folder_id` and `url`.
- Live-verified. `match=content` found the test project from a phrase inside its transcript. `type=project_folder` and `type=media_library_folder` return folder ids, which no other public endpoint exposes (the latter is what `folder_id` on the drive media import below needs). Invalid `type` values are rejected with the enum listed.
- Not wrapped by the plugin CLI or its MCP shim. Descript's own MCP connector has no search tool either.

### Field changes

- `POST /export/transcript` - `composition_id` now accepts a full UUID, the 5-character short id from a Descript URL, or the full project URL (it was UUID-only in the spec). Live-verified with short id `b65d1`.
- `POST /jobs/import/project_media` - clips in `add_compositions` gain `mute` (boolean). For a sequence clip it mutes the sequence's own tracks; for any other clip it mutes the composition's script layer, silencing every clip on it. The supported-file-types link moved to help.descript.com.
- `POST /jobs/publish` - when `composition_id` is omitted, the first composition that has content is used, skipping the empty placeholder that agent- and import-created projects start with. Publishing an empty composition now returns 400 naming the compositions that do have content.

## Live on v1 but not in the public spec

Each item below was confirmed by the API's own validation messages. Items marked "exercised" were also run for real.

### POST /jobs/export/timeline (exercised)

Exports a composition as a timeline file for another editor. Returns a job; the stopped job's `result` carries `file_name`, `content_type`, a signed `download_url` valid for 24 hours (`download_url_expires_at`) and the resolved `composition_id`. Media is never bundled.

- `format` (required) - `edl` (Samplitude EDL, Reaper), `sesx` (Adobe Audition), `fcp` (Final Cut Pro X FCPXML 1.8), `premiere` (Premiere XML, xmeml v4), `davinci_resolve` (Resolve XML, xmeml v4), `aaf` (Pro Tools and Logic, binary).
- Optional - `composition_id` (UUID, short id or URL; defaults to the first composition), `include_markers`, `create_track_per_file` (rejected for fcp), `snap_frame_rates` (can only be set false for premiere and davinci_resolve), `strip_spaces` (aaf only, for Logic), `callback_url`. Unknown fields are rejected.
- Exercised all six formats on the test project on 2026-09-29. All six returned `result.status: success`; the EDL job took 8 seconds from submit to stopped. The EDL spans 91,539,456 samples at 48 kHz, exactly the source's 1,907.072 seconds. The AAF is a compound binary file (D0 CF 11 E0 header); the others are well-formed XML.
- Job type `export/timeline`. The spec's `JobStatus` discriminator still references a `TimelineExportJobStatus` schema that is not defined, as it did on 2026-08-27. The discriminator has no entry for `import/drive_media` at all.
- Cost - the job result reports no AI credits or media seconds. Creates no share page.

### POST /jobs/import/drive_media (validated, not exercised)

Imports media into the drive media library instead of a project. `add_media` (required) takes `url` or `content_type` plus `file_size` per entry (sequences are rejected); the MCP connector says keys may carry folder paths. `folder_id` (UUID) targets a media library folder, findable with `GET /search?type=media_library_folder`. The MCP connector documents optional `language` and `callback_url` as well. Direct uploads return `upload_urls` like the project import. Job type `import/drive_media`. Not run for real, because it would add files to the shared library.

### update_compositions on POST /jobs/import/project_media (validated, not exercised)

`update_compositions: [{ composition_id, append_clips: [{ media, mute? }] }]` appends clips to the end of an existing composition. It requires `project_id` (the API returns "missing required peer project_id" otherwise) and at least one clip. `composition_id` takes a UUID, short id or URL. The MCP connector describes `media` as a key from the same request's `add_media`; whether it can name media already in the project is untested.

### Other accepted values

- `add_media.<key>.tracks[].mute` - mute one track of a multitrack sequence (for example a video-only import of a sequence).
- `POST /jobs/publish` accepts `access_level: drive` (the spec enum is public, unlisted, drive, private).
- `GET /jobs?type=` accepts `import/project_media`, `import/drive_media`, `agent`, `publish` and `export/timeline`. The plugin's note that the list endpoint rejects `publish` is out of date.
- Not accepted - `add_compositions[].fps`. The MCP connector's import tool advertises `fps` (default 30), but v1 returns `"add_compositions[0].fps" is not allowed`.

## MCP connector only (no v1 route found)

- `list_folders` - folder paths from the drive root, or the children of `parent_path`. Probed `/folders`, `/project_folders`, `/drive`, `/drives`, `/media`, `/drive/media` and `/media_library`; all 404. `GET /search?type=project_folder` is the public substitute (names, ids and URLs, but no hierarchy).
- `report_upload_status` - marks one direct upload as failed, aborted or abandoned so the import job stops waiting on it. Five plausible route shapes all returned 404. The plugin uploads one file per job and fails the command when the PUT fails, so this matters mainly for multi-file uploads.
- `get_drive_info` - same data as `GET /status` (`drive_id`, `drive_name`).
- `wait_for_job` - polls up to 840 seconds and surfaces `progress.label` (for example "Editing script") while an agent job runs. The plugin's pollers could surface the same field.
- Generative image and video tools - only on the custom server URL `https://api.descript.com/v2/mcp` (OAuth). The Claude directory connector leaves them out by design. That server is not configured on this machine (`claude mcp add --transport http descript https://api.descript.com/v2/mcp -s user` would add it), so its tool list was not inspected.

## Descript's MCP connector compared with the plugin

| Capability | Descript MCP connector | Plugin |
|---|---|---|
| Import by URL, upload, multitrack | `import_media` | `import --url`, `--file`, `--media` |
| Append clips to an existing composition | `import_media` `update_compositions` | not supported (`--project-id` drops compositions) |
| Import into the drive media library | `import_drive_media` | not supported |
| Report a failed upload | `report_upload_status` | not needed for single-file uploads |
| Underlord agent edit | `prompt_project_agent` | `agent`, plus the `translate` composed workflow |
| Model catalog | static list in the tool description, Claude models only | `models`, live, all vendors |
| Publish | `publish_project`, defaults to the drive's access level, allows `drive` | `publish`, defaults to `private`, rejects `drive` |
| Transcript export | `export_transcript`, no DOCX | `transcript`, includes DOCX and `--out` |
| Timeline export | `export_timeline` | not supported |
| Jobs | `list_jobs`, `wait_for_job` (progress labels), `cancel_job` | `jobs list/get/cancel`, polling built in |
| Projects | `list_projects`, `get_project` | `projects list/get` |
| Folders | `list_folders` | `projects --folder-path` filter only |
| Drive search | none | not supported (API has `GET /search`) |
| Published downloads, SRT and Markdown export, naming standard | none | `published`, `download-published`, `export` |
| Bulk pipelines | none | `batch` |
| Partner Edit in Descript | none | `edit-in-descript` |
| Generative image and video | custom server only | none |

## Agent model catalog (GET /agent/models, 2026-09-30)

Models - auto, claude-fable-5, claude-opus-5.5, claude-opus-4.8, claude-opus-4.7, claude-opus-4.6, claude-sonnet-5, claude-sonnet-4.6, claude-haiku-4.5, gpt-6-astra, gpt-6-astra-pro, gpt-5.5, gpt-5.4, gemini-3.5-flash, gemini-3.1-pro.

New since 2026-08-27 - `claude-opus-5.5`, `gpt-6-astra`, `gpt-6-astra-pro`. Aliases are unchanged, and `claude-opus` still resolves to `claude-opus-4.8`, not 5.5. The MCP connector's tool description lists only the Claude models; the API accepts all fifteen.

## Candidate plugin work (not started)

1. `descript search` command and MCP tool over `GET /search` (free, read-only, ungated).
2. `descript timeline <project-id> [composition-id] --format <f> [--out <path>]` over `POST /jobs/export/timeline`, polling to completion and downloading the file (free, no share page, ungated). Undocumented, so pin behaviour with tests and re-check the spec before each release.
3. Widen `jobs --type` to the five accepted job types, and correct the comments in `src/cli/commands/registry.ts` and `src/client/types.ts` that say the list endpoint rejects `publish`.
4. Allow `publish --access-level drive`, keeping `private` as the default and the skill's confirmation step.
5. Append to an existing composition from `import --project-id` (for example `--composition-id` with `--url` or `--file`), via `update_compositions`.
6. Drive media library import (`import --library [--folder-id]`), a shared-library write that needs its own confirmation.
7. Surface `progress.label` while polling agent jobs.

## Housekeeping found

- `skills/descript-api-reference/SKILL.md` cites `docs/help-docs/*.md`, but that folder is untracked in git, so installed copies of the plugin cannot read it. The live pages are on help.descript.com (index at https://help.descript.com/llms.txt, each page also served as `.md`).
- The untracked note `docs/field-reports/2026-09-21-import-upload-broken-and-url-extension-probe.md` concluded that direct upload was broken on Descript's side. v0.7.2 showed the cause was the extensionless media reference, and a live 31-minute M4A upload succeeded on 2026-09-29. Its URL-extension finding and its `/search` finding still stand.
- Opening this repo in Claude Code loads the root `.mcp.json` as a project MCP server named `descript`. `${CLAUDE_PLUGIN_ROOT}` is unset outside plugin installs, so it fails with "Connection closed". Harmless, but noisy.

## Artefacts left in the Drive

Six `export/timeline` jobs on the test project (their download URLs expire 24 hours after creation). No projects or media were created by this audit.
