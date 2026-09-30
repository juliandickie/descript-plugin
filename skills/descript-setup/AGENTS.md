<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# descript-setup

## Purpose

Securely configure the Descript API token and verify the connection. The skill enforces a no-token-in-chat guardrail, the user handles the token in their own terminal or editor. Backs the `descript config set|list|edit` and `descript status` commands.

## Key Files

| File | Description |
|------|-------------|
| `SKILL.md` | Skill manifest plus token-handling rules and three setup paths (guided edit, manual hidden-folder edit, 1Password pull). |

## For AI Agents

### Working In This Directory

- The mandatory rule is non-negotiable. Never request, accept, display, store, or echo the token, and never run any command that contains the token literal in chat. If the user pastes a token into chat, decline and ask them to rotate.

- The skill offers three paths: `descript config edit` (creates a 0600-locked credentials file and opens the editor), manual `~/.config/descript/credentials.json` edit, or `op://` 1Password reference.

- Verification step is always `descript status` (not a custom probe). It returns an authenticated confirmation when the token works.

- This skill never spends credits or creates risk artifacts. Safe to invoke any time.

### Common Patterns

- The credentials file is at `~/.config/descript/credentials.json` by default, override with `DESCRIPT_CONFIG_PATH`.

- File mode 0600 (owner read/write only) is enforced by `src/config/credentials.ts` via the `config edit` path.

- `default_profile` selects the active profile when multiple Drives are configured.

## Dependencies

### Internal

- `../../src/cli/commands/config.ts` (the CLI subcommands).

- `../../src/config/credentials.ts` (resolution order and file format).

### External

- A real Descript API token (user-supplied).

<!-- MANUAL: -->
