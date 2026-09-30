# 2026-09-21 - direct file upload is broken server-side, and URL import probes the file extension

Additive field note from a client archive transcription run. Two independent import failures, both undocumented, found by bisection
rather than by reading the spec.

## 1. `import --file` fails for every file, including Descript's own demo video

`descript import --file <anything>` returns job `result.status: "error"` with
`"Uploaded file has invalid or unsupported media content"`. Observed on all of:

| File | Result |
|---|---|
| Untouched Wistia original mp4, h264 + aac, 1920x1080, 49 MB | error |
| 30 second `-c copy` cut of the same mp4 | error |
| mp3, 16 kHz mono 64k | error |
| mp3, 44.1 kHz mono 128k | error |
| m4a, aac 96k | error |
| wav, pcm_s16le 16 kHz mono | error |
| **`https://test-files.descriptapi.com/demo-video.mp4`, downloaded and re-uploaded** | **error** |

The last row is the decisive one. Descript's own demo file **imports successfully by URL**
and **fails through the direct-upload path in the same drive minutes apart**, so the fault is
neither the media nor the CLI's choice of files.

**The CLI is not at fault either.** `dist/src/workflows/upload.js` PUTs with
`content-type: application/octet-stream`, which is exactly what the spec's "Direct file
upload" guide, step 2, instructs. I replicated the whole three-step flow by hand with curl,
both with `application/octet-stream` and with the signed `video/mp4`. The PUT returns
**HTTP 200** in both cases and the job still errors 7 to 12 seconds later. So the bytes are
accepted and the server-side validation rejects them afterwards.

The spec (checked against both the pinned `docs/descript-openapi.json` and a fresh copy
pulled from docs.descriptapi.com on 21 September 2026, which are byte-identical in this
section) still documents direct upload as working. It is not, at least for drive
`a563a718-f83c-413c-b158-9ec7055eb30e` on this date.

**Consequence for the plugin.** `import --file` is currently a dead path. Worth a smoke test
in CI against the demo file, and worth saying so in the `descript-import` skill until it
comes back, because the error message blames the user's media and sends you off transcoding
for an hour.

## 2. URL import probes the file extension, not the Content-Type

Wistia delivery URLs are public, return `200` with `content-type: video/mp4`, and honour
Range requests (verified `206` on `-r 0-1023`). They still fail:

```
.../deliveries/<hash>.bin   ->  400 "Failed to read media
                                                            metadata - Failed to get
                                                            metadata from media URL"
.../deliveries/<hash>.mp4   ->  success
```

Same bytes, same host, same headers. Only the extension differs. Adding `?file=lesson.mp4`
to the `.bin` form does not help, so it is the path extension specifically.

The spec's "Media URL requirements" lists accessibility, Range support and a link to
supported file types. It says nothing about the extension, and the error message points at
media corruption rather than at the URL shape.

**Consequence for the plugin.** Two cheap wins: detect an extensionless or non-media
extension in `--url` and warn before submitting, and quote the real cause in the error
mapping for `Failed to read media metadata`, which currently reads as "your file is broken"
when it usually means "your URL has no recognised extension".

## 3. `/search` exists in the API and the CLI does not expose it

The current spec carries `GET /search`, absent from the pinned copy: searches project names,
folder names, media file names, **composition text and transcripts** across a drive, up to
100 results, with `type`, `match`, `owner`, `sort` and date filters. For any transcript
archive this is the natural lookup path and there is no CLI or MCP surface for it today.

## What worked, for the next person

Import straight from the source URL, extension included, and skip upload entirely:

```bash
descript import --url "https://embed-ssl.wistia.com/deliveries/<hash>.mp4" \
  --name "<project name>" --folder "<folder>/<Course>" \
  --team-access view --json
```

`folder_name` requires `team_access` to be one of `edit|comment|view`; without it the API
rejects the request with a 400 that names the constraint clearly.

Transcript export after import is free, instant and repeatable, so a botched write-out costs
no media minutes: only the import spends them.
