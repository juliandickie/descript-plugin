<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# descript-publish

## Purpose

Publish a Descript composition to a shareable link or downloadable file. Operator-triggered. Publish is NOT billable on standard Descript plans (it creates a hosted share URL), so the gate exists for risk reasons, not cost reasons. Any `--access-level` above `private` makes the URL externally reachable. Backs `descript publish`.

## Key Files

| File | Description |
|------|-------------|
| `SKILL.md` | Skill manifest with `disable-model-invocation: true`. Instructions for confirming project, composition, media type, resolution, and access level. |

## For AI Agents

### Working In This Directory

- `disable-model-invocation: true` is required in `SKILL.md`. Do not remove. Operator-only because publish creates an externally accessible artifact.

- Allowed `--access-level` values: `public`, `unlisted`, `private`. The CLI rejects `drive` at parse time (see `2026-05-20-v030-followup-backlog.md` for why). Older published projects may still report `privacy: "drive"` on read.

- For export-and-download workflows where nothing should leak, recommend `access-level=private`.

- A 403 from this endpoint means the Drive's publish settings block the requested access level. Surface the API hint to the user.

- Report `shareUrl` and `downloadUrl` on success.

### Common Patterns

- `--media-type Video|Audio` selects the output kind.

- `--resolution 480p|720p|1080p|1440p|4K` selects the render quality.

- `--callback-url <https url>` for headless completion notification.

## Dependencies

### Internal

- `../../src/cli/commands/registry.ts` (`publish` handler).

- `../../src/workflows/publishAndWait.ts`.

### External

- Descript API `/jobs/publish` endpoint. Free on standard plans, risk-bearing on any non-private access level.

<!-- MANUAL: -->
