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
Only the agent operation is billable on standard Descript plans (AI credits and media seconds). Publish, batch, and export are risk-bearing for hosted-artifact and bulk-write reasons, not cost reasons. The model-invocation policy (per `docs/specs/2026-05-20-model-invocation-policy.md`):

- `descript-batch` is operator-only via `disable-model-invocation: true`. Keep that flag. Batch's blast radius (bulk write across many compositions, possible AI-credit billing via `agent_prompt` items) is the categorical risk that justifies an operator gate. The CLI's `batch plan` then `batch run --confirm` dance is the load-bearing safety mechanism; the skill flag reinforces it.

- `descript-publish` is model-invocable WITHOUT `disable-model-invocation`, gated by an in-skill confirmation step that defaults the access-level confirmation to `private`. Elevation to `unlisted` or `public` requires affirmative user language. Same confirmation pattern as `descript-edit` and `descript-export`.

- `descript-edit` wraps the cost-bearing agent command and is model-invocable WITHOUT `disable-model-invocation`, gated by the in-skill confirmation step so Claude can run edits conversationally. Do not add `disable-model-invocation` to `descript-edit`.

- `descript-export` triggers one publish per composition and is model-invocable WITHOUT `disable-model-invocation`, gated by the same in-skill confirmation pattern.

- `descript-download-published` is read-only and unrestricted.

Always report `ai_credits_used` and `media_seconds_used` when the agent runs (zero is expected for publish-only and import-only flows).

**Rule of thumb for future skills** - Operator-gate any skill whose blast radius extends beyond a single composition, or that can spend AI credits transitively via `agent_prompt` items. Otherwise default to model-invocable with the in-skill confirmation pattern.

## Versioning
SemVer in plugin.json and package.json. Tag vX.Y.Z. Update CHANGELOG.
