---
name: descript-publish
description: Publish a Descript composition to a shareable link or downloadable file. Use when the user wants to export, publish, or share a finished Descript project.
disable-model-invocation: true
---

# Descript Publish

Publish a composition. Operator-triggered because publishing spends resources and produces a public artifact.

## Instructions
1. Confirm project id, composition id, media type, resolution, and access level with the user.
2. Run: `descript publish --project-id <ID> --composition-id <CID> --media-type Video --resolution 1080p --access-level <public|unlisted|drive|private> --json` (omit --access-level to use the Drive's default). Add --callback-url <https url> for headless completion notification.
3. Report the shareUrl and downloadUrl.
4. A 403 means the Drive's publish settings block the requested access level. Report the cause from the error hint.
