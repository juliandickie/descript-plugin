# Changelog

## 0.2.0 - 2026-05-19
- New `descript config edit` subcommand. Creates and locks (0600) the credentials file and opens it in your editor, so the API token never passes through chat.

- Reworked the `descript-setup` skill with a mandatory guardrail against handling the token in chat, plus three secure setup paths (guided edit, manual hidden-folder edit, 1Password pull).

- Fixed `descript status` printing "undefined" against the live `/status` endpoint. It now reports an authenticated confirmation and is crash-safe on empty responses. The `--json` output is unchanged.

- `config set`, `config list`, and `config edit` now fail with a clear message instead of crashing when `credentials.json` is corrupt.

- Added `DESCRIPT_CONFIG_PATH` to point the CLI at an alternate credentials file, honored consistently by token resolution and the config commands.

- Test suite hardened to be hermetic, with no reliance on a real home config and no unmocked network calls.

## 0.1.0 - 2026-05-17
- Initial release. Full Descript API coverage (11 endpoints), polling, direct upload, batch runner, 7 skills, optional in-process MCP shim.
