# Changelog

## 0.2.1 - 2026-05-20
- Removed `drive` from the `--access-level` enum on `descript publish` and from the batch manifest's `publish.access_level` type. The value was rejected by the Descript API on every Drive tested (the API allows only `public`, `unlisted`, `private`) and Descript's web UI exposes only those three options. The CLI now fails fast at parse time with a clear error instead of after a network round-trip.

- Corrected cost-claim language in `CLAUDE.md` and the `descript-publish` and `descript-batch` skills. Publish is not billable on standard Descript plans (it creates a hosted share URL, which is a risk concern, not a cost concern). Batch is conditionally billable, only when a manifest includes items with `agent_prompt`. Pure import-and-publish batches are not themselves billable; the dry-run gate remains mandatory for risk reasons regardless.

- Kept `drive` in the `PublishedProjectMetadata.privacy` response union, since the API may return that value on previously published items even though it no longer accepts it on new publish requests.

- Added a hermetic CLI test asserting that `--access-level drive` is rejected locally without an API call (mirrors the existing `--resolution` rejection test).

## 0.2.0 - 2026-05-19
- New `descript config edit` subcommand. Creates and locks (0600) the credentials file and opens it in your editor, so the API token never passes through chat.

- Reworked the `descript-setup` skill with a mandatory guardrail against handling the token in chat, plus three secure setup paths (guided edit, manual hidden-folder edit, 1Password pull).

- Fixed `descript status` printing "undefined" against the live `/status` endpoint. It now reports an authenticated confirmation and is crash-safe on empty responses. The `--json` output is unchanged.

- `config set`, `config list`, and `config edit` now fail with a clear message instead of crashing when `credentials.json` is corrupt.

- Added `DESCRIPT_CONFIG_PATH` to point the CLI at an alternate credentials file, honored consistently by token resolution and the config commands.

- Test suite hardened to be hermetic, with no reliance on a real home config and no unmocked network calls.

## 0.1.0 - 2026-05-17
- Initial release. Full Descript API coverage (11 endpoints), polling, direct upload, batch runner, 7 skills, optional in-process MCP shim.
