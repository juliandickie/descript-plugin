---
name: descript-publish
description: Publish a Descript composition to a shareable link or downloadable file. Use when the user wants to export, publish, or share a finished Descript project.
disable-model-invocation: true
---

# Descript Publish

Publish a composition. Operator-triggered because publish creates a hosted share URL (and any access level above `private` makes the URL externally reachable). The publish operation itself is not billable on standard Descript plans.

## Instructions
1. Confirm project id, composition id, media type, resolution, and access level with the user.
2. Run: `descript publish --project-id <ID> --composition-id <CID> --media-type Video --resolution 1080p --access-level <public|unlisted|private> --json` (omit --access-level to use the Drive's default). Use `private` for export-and-download workflows where nothing should leak. Add --callback-url <https url> for headless completion notification.
3. Report the shareUrl and downloadUrl.
4. A 403 means the Drive's publish settings block the requested access level. Report the cause from the error hint.

## Republish behavior

Re-publishing the same composition with the same media type reuses the prior share URL and overwrites its content. Republish matching is keyed on `(project_id, composition_id, media_type)`. Practical consequence - a Video publish and an Audio publish of the same composition produce two distinct share URLs (one per media type), but two Video publishes of the same composition share one URL. Bookmarks handed out for the first publish keep working. See `docs/help-docs/Descript API.md` under "Publish project media" for the upstream contract.
