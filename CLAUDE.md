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

## Cost Safety
The agent, publish, and batch operations spend money (AI credits and media seconds). descript-publish and descript-batch are operator-only via the disable-model-invocation flag. Keep that flag on both. descript-edit wraps the cost-bearing agent command and is intentionally model-invocable WITHOUT disable-model-invocation, gated instead by a mandatory in-skill confirmation step so Claude can run edits conversationally. Do not add disable-model-invocation to descript-edit. Keep the batch dry-run gate. Always report ai_credits_used and media_seconds_used.

## Versioning
SemVer in plugin.json and package.json. Tag vX.Y.Z. Update CHANGELOG.
