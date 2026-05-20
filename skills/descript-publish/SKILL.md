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
