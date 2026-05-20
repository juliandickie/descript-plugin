---
name: descript-publish
description: Publish a Descript composition to a shareable link or downloadable file. Use when the user wants to export, publish, or share a finished Descript project.
---

# Descript Publish

Publish a composition. Model-invocable with a mandatory in-skill confirmation step. Publish creates a hosted share URL but is not billable on standard Descript plans. The confirmation gate handles the risk - any access level above `private` makes the URL externally reachable, so the default-private posture below is load-bearing safety, not paperwork.

Per the Stream B model-invocation policy ADR (`docs/specs/2026-05-20-model-invocation-policy.md`), this skill uses the same in-skill confirmation pattern as `descript-edit` and `descript-export`. Single-composition publishes are reachable conversationally; bulk publishes still require operator-only via `descript-batch`.

## When to Use

- "Publish this composition", "share this video", "give me a download URL for this composition"

- NOT for - bulk publishes across many compositions (use `descript-batch` or `descript-export`), or re-fetching deliverables for an already-published composition (use `descript-download-published`).

## Instructions

1. Confirm scope. Project id, composition id, media type, resolution.

2. Confirm access level. Default is `private` (export-and-download posture; no external leakage). Only override to `unlisted` or `public` if the user has explicitly requested an externally-reachable URL. Treat `unlisted` and `public` as a separate decision from publishing itself - state the access level explicitly before submitting and get affirmative user confirmation on the elevation.

3. Before submitting, state the full intended command (project id, composition id, media type, resolution, access level) and get explicit user confirmation.

4. Run - `descript publish --project-id <ID> --composition-id <CID> --media-type Video --resolution 1080p --access-level <level> --json` (omit `--access-level` only if the user has stated they want the Drive's configured default, otherwise pass `private` explicitly). Add `--callback-url <https url>` for headless completion notification.

5. Report the `shareUrl` and `downloadUrl` from the result.

6. A 403 means the Drive's publish settings block the requested access level. Report the cause from the error hint and confirm the appropriate fallback level with the user.

## Republish behavior

Re-publishing the same composition with the same media type reuses the prior share URL and overwrites its content. Republish matching is keyed on `(project_id, composition_id, media_type)`. Practical consequence - a Video publish and an Audio publish of the same composition produce two distinct share URLs (one per media type), but two Video publishes of the same composition share one URL. Bookmarks handed out for the first publish keep working. See `docs/help-docs/Descript API.md` under "Publish project media" for the upstream contract.
