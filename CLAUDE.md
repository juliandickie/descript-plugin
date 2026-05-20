# descript - AI Agent Context

## What This Plugin Does
Full programmatic access to the Descript API via a Node/TypeScript CLI, wrapped by skills and an optional MCP shim. Serves Claude, direct CLI use, and headless batch.

## Layout Rules
- Component dirs at plugin root: skills/, bin/, src/, dist/
- .claude-plugin/ holds only plugin.json and marketplace.json
- ${CLAUDE_PLUGIN_ROOT} in .mcp.json; no absolute paths
- The CLI is the single source of truth; skills and the MCP shim are thin wrappers - never duplicate API logic

## Build
`npm run build` compiles src/ to dist/ (committed for zero-install). Zero runtime dependencies. Tests: `npm test` (no live API).

## Cost and Risk Safety
Only the agent operation is billable on standard Descript plans (AI credits and media seconds). Publish and batch are operator-gated for risk reasons, not cost reasons. Publish creates a hosted artifact (a share URL); batch chains many operations and may include agent steps that do spend credits. descript-publish and descript-batch are operator-only via the disable-model-invocation flag. Keep that flag on both. descript-edit wraps the cost-bearing agent command and is intentionally model-invocable WITHOUT disable-model-invocation, gated instead by a mandatory in-skill confirmation step so Claude can run edits conversationally. Do not add disable-model-invocation to descript-edit. Keep the batch dry-run gate. Always report ai_credits_used and media_seconds_used when the agent runs (zero is expected for publish-only and import-only flows). The descript-export skill triggers a publish per composition and is risk-bearing (creates hosted share URLs); it is intentionally model-invocable WITHOUT disable-model-invocation, gated by the same mandatory in-skill confirmation pattern descript-edit uses. The descript-download-published skill is read-only and unrestricted.

## Versioning
SemVer in plugin.json and package.json. Tag vX.Y.Z. Update CHANGELOG.
