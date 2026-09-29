---
name: descript-timeline
description: Export a Descript composition as a timeline file (EDL, SESX, FCPXML, Premiere XML, DaVinci Resolve XML or AAF) so the edit can be finished in Premiere Pro, DaVinci Resolve, Final Cut Pro, Adobe Audition, Pro Tools, Logic or Reaper. Free, creates no share page, spends no AI credits, and saves the file locally. Use when the user wants to take a Descript edit into another editor or DAW, asks for an EDL, XML, FCPXML, SESX or AAF file, or wants to relink a Descript cut to their own media in an NLE.
---

# Descript Timeline Export

## When to Use
- "Send this edit to Premiere", "I want to finish this in Resolve", "give me an FCPXML for Final Cut", "export an AAF for Pro Tools", "get me an EDL for Reaper", "open this in Audition"
- The user wants the CUT (clips, in and out points, tracks, optionally markers) in another editor, not a rendered file. For a rendered mp4 route to descript-export, for a transcript or captions route to descript-transcript. Never publish just to get a timeline.
- No confirmation step is needed. The export is free, creates no share page and spends no AI credits.

## Formats
| `--format` | File | Opens in |
|---|---|---|
| `edl` | Samplitude EDL, `timeline.edl` | Reaper, Samplitude |
| `sesx` | Adobe Audition session, `timeline.sesx` | Adobe Audition |
| `fcp` | FCPXML 1.8, `timeline.fcpxml` | Final Cut Pro X |
| `premiere` | Premiere Pro XML (xmeml), `timeline.xml` | Adobe Premiere Pro |
| `davinci_resolve` | DaVinci Resolve XML (xmeml), `timeline.xml` | DaVinci Resolve |
| `aaf` | AAF (binary), `timeline.aaf` | Pro Tools, Logic |

If the user names an app that is not in the table, ask which of these formats it reads rather than guessing.

## Instructions
- Command: `descript timeline <project-id> [composition-id] --format <format> [--out <path>] [--markers | --no-markers] [--track-per-file] [--source-frame-rate] [--strip-spaces] [--callback-url <url>] [--no-wait]`
- Omit the composition id to export the project's first composition. It takes a UUID, a 5-character short id or a full project URL. Find ids with `descript projects list --json` and `descript projects get <id> --json`.
- The command submits the export job, waits for it (the live EDL test took 8 seconds), downloads the file and saves it. Put `--json` after the other flags for machine output.
- `--out <path>` saves to that file and creates missing parent folders. If `<path>` is an existing folder (or ends in `/`) the file goes inside it under the name Descript gave it. With no `--out` the file is saved in the current folder as `<project_id>-<file name>`, for example `88dc66c3-...-timeline.edl`. An existing file at the target is overwritten. The output prints the full path of the saved file, so tell the user where it went.
- `--markers` includes markers, `--no-markers` leaves them out, and giving neither uses the format's own default. They cannot be combined.
- `--track-per-file` puts each source file on its own track. Not allowed with `fcp`.
- `--source-frame-rate` sends `snap_frame_rates: false`, so frame rates are not snapped to standard rates. Only for `premiere` and `davinci_resolve`.
- `--strip-spaces` strips spaces from names, which Logic needs. Only for `aaf`.
- `--callback-url <url>` asks Descript to call a webhook when the job finishes. `--no-wait` submits and stops, printing the job id, with no download. Check it later with `descript jobs get <job-id> --json`, whose result holds the download link once the job has stopped.
- Invalid combinations (a missing or unknown `--format`, `--markers` with `--no-markers`, `--track-per-file` with `fcp`, `--source-frame-rate` or `--strip-spaces` on the wrong format) are usage errors (exit 2) and no request is sent. A switch must not be given a value, so put switches after the project id.
- MCP tool `descript_timeline` takes the same options (`project_id`, `composition_id`, `format`, `out`, `markers`, `track_per_file`, `source_frame_rate`, `strip_spaces`, `callback_url`, `no_wait`). `markers` is true, false, or left out for the format's default. `format` is required. Unknown arguments are rejected, never ignored.
- Exit codes: `0` saved, `2` usage error, `3` API error (a 400 lists what was invalid, line by line), `4` the export job failed, the download failed or the file could not be written. On a failure after the job succeeded the message keeps the download link so it can be fetched by hand.

## What to tell the user
- Media files are NOT bundled. The export is the timeline only, so in the editor the user relinks to their own copies of the source media. Say so whenever you hand over the file.
- The download link (printed after the saved path, `downloadUrl` in JSON) is a signed storage URL valid for 24 hours. The saved local file is the deliverable, the link is only a backup. Treat the link as temporary and do not paste it anywhere shared.

## Examples
- Premiere Pro with markers: `descript timeline <pid> --format premiere --markers --out ~/Projects/lesson-1/lesson-1.xml`
- Resolve at the source frame rate: `descript timeline <pid> <cid> --format davinci_resolve --source-frame-rate --out ~/Projects/lesson-1/`
- Pro Tools or Logic: `descript timeline <pid> --format aaf --strip-spaces --out ~/Projects/lesson-1/`
- Reaper: `descript timeline <pid> --format edl`
- Submit now, fetch later: `descript timeline <pid> --format fcp --no-wait`

## Cost and Safety
- Free. No AI credits, no media seconds, no share page. The job result reports no usage. Read-only against the project.
- Writes one file to the local disk, only at the path shown. Nothing is uploaded anywhere.
- This endpoint (`POST /jobs/export/timeline`) is live but not yet in Descript's published API spec (checked 2026-09-30, all six formats exercised). If it starts returning 404 or rejecting valid requests, the plugin needs updating: report that instead of retrying, and check `docs/field-reports/2026-09-30-api-and-mcp-capability-audit.md` and the current spec.
