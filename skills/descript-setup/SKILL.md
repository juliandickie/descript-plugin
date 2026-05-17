---
name: descript-setup
description: Configure and verify the Descript API token. Use when the user wants to connect Descript, set an API token, switch Descript Drives or profiles, or when a Descript command failed with an auth error.
---

# Descript Setup

Configure the Descript API token and verify it.

## When to Use
- First-time Descript connection
- Switching between Drives (iDD, Pro Marketing, distribution entities) via profiles
- After a 401 unauthorized error from any Descript command
- NOT for: running edits or imports (use the other descript skills)

## Instructions
1. A Descript token is created in Descript Settings, API tokens. It is scoped to one Drive.
2. Save it: `descript config set --token <TOKEN> --profile <name>`
3. Verify: `descript status --json` should report `{"status":"ok"}`.
4. List profiles: `descript config list`.
5. For headless use, the same token works as `DESCRIPT_API_TOKEN`, or via the plugin api_token config.

The token is sensitive. Never echo it back to the user or write it to files other than the credentials store.
