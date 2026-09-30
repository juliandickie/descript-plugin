<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# .claude-plugin

## Purpose

Plugin manifests recognised by Claude Code. By convention this directory holds only `plugin.json` and `marketplace.json`, every functional asset (skills, MCP config, source code) lives at the plugin root. Moving anything else inside `.claude-plugin/` breaks discovery.

## Key Files

| File | Description |
|------|-------------|
| `plugin.json` | Plugin manifest. Name, version, description, `skills` and `mcpServers` pointers to root paths, `userConfig` schema (`api_token` sensitive, `default_profile`). Tracks SemVer with `package.json`. |
| `marketplace.json` | Standalone marketplace declaration listing this one plugin so the repo is directly `/plugin marketplace add`-able. Aggregated by larger marketplaces too. |

## For AI Agents

### Working In This Directory

- Keep `plugin.json` version aligned with `package.json` version. Both bump together.

- `userConfig` keys map to `CLAUDE_PLUGIN_OPTION_<UPPER_SNAKE>` env vars at runtime. `api_token` becomes `CLAUDE_PLUGIN_OPTION_API_TOKEN`, picked up by `src/config/credentials.ts` as a last-resort source.

- `sensitive: true` on `api_token` keeps the value out of logs and Claude's view.

- Skills live at `../skills/` (relative to plugin root), declared by the `"skills": "./skills/"` pointer.

- MCP server config lives at `../.mcp.json`, declared by the `"mcpServers": "./.mcp.json"` pointer.

- Do not add absolute paths anywhere. Use `${CLAUDE_PLUGIN_ROOT}`.

### Manifest Schema

Both files validate against the Claude Code plugin manifest schema (referenced via `$schema`). Editors with JSON schema support will autocomplete fields.

## Dependencies

### Internal

- `../package.json` for version sync.

- `../skills/` for the skill set.

- `../.mcp.json` for the MCP server registration.

### External

- Claude Code plugin runtime (provides `${CLAUDE_PLUGIN_ROOT}` and `CLAUDE_PLUGIN_OPTION_*`).

<!-- MANUAL: -->
