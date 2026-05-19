---
name: descript-setup
description: Configure and verify the Descript API token. Use when the user wants to connect Descript, set an API token, switch Descript Drives or profiles, or when a Descript command failed with an auth error.
---

# Descript Setup

Configure the Descript API token securely and verify it.

## Token handling - mandatory

Never request, accept, display, store, or run any command that contains the
Descript API token. The token is the user's secret. Every step that touches
the token is performed by the user, in the user's own terminal or text
editor. If the user offers to paste the token into chat, decline and point
them at one of the paths below. A token that appears in conversation must be
treated as compromised and rotated.

## When to Use
- First-time Descript connection
- Switching between Drives (iDD, Pro Marketing, distribution entities) via profiles
- After a 401 unauthorized error from any Descript command
- NOT for running edits or imports (use the other descript skills)

## Get a token
A Descript token is created in Descript Settings, API tokens. It is scoped to
one Drive. Pick a profile name per Drive, for example idd, promarketing, or a
distribution entity.

## Path A - guided local edit (recommended)
Tell the user to run, in their own terminal -

  descript config edit --profile <name>

This creates the credentials file with the right structure and locks it to
owner-only, then opens it in their text editor. The user sets the api_token
value, saves, and closes. Then verify -

  descript status --profile <name>

Expect - Authenticated to Descript (drive ..., API v1). The token is never
shown to or handled by Claude.

## Path A fallback - by hand (macOS)
If the user prefers to edit manually -
1. Reveal hidden files - in Finder press Cmd+Shift+period, or use Go to
   Folder with Cmd+Shift+G and enter ~/.config/descript
2. Open credentials.json in a text editor and set the api_token for the
   profile under "profiles"
3. In Terminal, lock the file - chmod 600 ~/.config/descript/credentials.json
4. Verify - descript status --profile <name>

## Path B - 1Password
1. Store the token as a 1Password item, for example named "Descript API - iDD"
2. Copy its secret reference from 1Password, of the form
   op://<vault>/<item>/credential
3. The user runs, in their own terminal (1Password CLI installed and signed
   in with op signin) -

   descript config set --profile <name> --token "$(op read "op://<vault>/<item>/credential")"

   The token flows from 1Password through the op CLI into the local
   owner-only file. It never appears in chat. The literal token does not
   appear in shell history because the command stores the op reference, not
   the secret.
4. Verify - descript status --profile <name>

## Headless and automation
Token resolution is tried in this order: the --token flag, then
DESCRIPT_API_TOKEN, then the credentials file entry for the selected profile,
then CLAUDE_PLUGIN_OPTION_API_TOKEN as a last resort. A credentials file
profile therefore takes precedence over CLAUDE_PLUGIN_OPTION_API_TOKEN. If
none are present the command errors. For 1Password-driven automation, use
op run or op read to populate DESCRIPT_API_TOKEN at invocation.

Profile selection follows this order: explicit --profile <name>, then
DESCRIPT_PROFILE, then CLAUDE_PLUGIN_OPTION_DEFAULT_PROFILE.

## Profiles
List configured profiles - descript config list. Each Drive gets its own
profile and, for Path B, its own 1Password item.
