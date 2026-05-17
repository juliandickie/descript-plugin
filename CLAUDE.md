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
agent, publish, and batch spend money. Keep disable-model-invocation on descript-publish and descript-batch. Keep the batch dry-run gate. Always report ai_credits_used and media_seconds_used.

## Versioning
SemVer in plugin.json and package.json. Tag vX.Y.Z. Update CHANGELOG.
