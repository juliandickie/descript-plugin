<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# config

## Purpose

Credential resolution. Resolves a Descript API token from four ordered sources (flag, env, file, plugin), exposes a credentials file format with named profiles, and provides a token redactor for logging.

## Key Files

| File | Description |
|------|-------------|
| `credentials.ts` | `resolveCredentials(opts)` (four-source precedence), `defaultConfigPath()` (`~/.config/descript/credentials.json`), `redactToken(token)`. Also the `ResolvedCredentials` type with a `source` discriminator (`"flag" | "env" | "file" | "plugin"`). |

## For AI Agents

### Working In This Directory

- Resolution order is fixed: explicit `--token` flag, then `DESCRIPT_API_TOKEN`, then the credentials file (`DESCRIPT_CONFIG_PATH` overrides the default location), then `CLAUDE_PLUGIN_OPTION_API_TOKEN`. Last source wins only if the earlier ones are absent. Do not reorder.

- The `ResolvedCredentials.token` field is a plaintext secret. The type's TSDoc warns against logging or `JSON.stringify`-ing the whole object. Always use `redactToken()` when surfacing the value (e.g. `config list`).

- The credentials file shape:
  ```json
  {
    "default_profile": "...",
    "profiles": {
      "name": { "api_token": "..." }
    }
  }
  ```
  Created and locked to 0600 by `descript config edit`. Never write this file from anywhere else.

- `resolveCredentials` throws on no-token-found with a message listing all four options. The CLI maps this to exit code 1.

- `CLAUDE_PLUGIN_OPTION_API_TOKEN` and `CLAUDE_PLUGIN_OPTION_DEFAULT_PROFILE` are injected by Claude Code when the user fills in `userConfig` in the plugin manifest. They are the last-resort path so that file/env config wins for power users.

### Common Patterns

- Tests inject token sources via the `opts.env` parameter rather than mutating `process.env`. Keep all token-touching code testable this way.

## Dependencies

### Internal

- Consumed by `../cli/commands/registry.ts#client` and by `../cli/commands/config.ts`.

### External

- `node:fs` (`readFileSync`, `existsSync`), `node:os` (`homedir`), `node:path` (`join`).

<!-- MANUAL: -->
