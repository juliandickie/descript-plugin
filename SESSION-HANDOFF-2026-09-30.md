# Session Handoff - 2026-09-30

**Update, later on 2026-09-30.** Julian said "yes release .8 now, commit the untracked notes, and yes to adding Descript's custom MCP server". Done as follows:
- **v0.8.0 released.** PR #2 was rebase-merged, and main is at `745710b` "chore(release): v0.8.0". Annotated tag `v0.8.0` is pushed and the branch is deleted. A fresh clone of the tag passes 519 of 519 and runs a live search.
- **Local notes committed** by a docs PR (branch `docs/commit-local-notes`). These are the 45 untracked AGENTS.md files, field reports, plans and specs from the main checkout. Before committing, a full review swapped these for placeholders: a client name and path, a Wistia delivery hash, a podcast guest's name and IDs, and the name of a second Drive. The unredacted originals are kept locally in `docs/local-archive/`, which is gitignored.
- **`docs/help-docs/` stays local and is now gitignored.** It holds verbatim copies of Descript's help-centre articles, which must not be republished in this public repo.
- **Custom Descript MCP server added** at user scope as `descript-v2` (https://api.descript.com/v2/mcp). It still needs Julian to sign in via `/mcp`. Its generative tool list has not been inspected yet.

Nothing is in flight beyond Julian's `descript-v2` sign-in. The original end-of-build state follows.

State verified as of 2026-09-30 01:30 AEST, session df44b3d8-8fea-4f6d-85aa-921f2e74d0c5.

## Previous handoff
[SESSION-HANDOFF-2026-08-29.md](SESSION-HANDOFF-2026-08-29.md)

## Goal
Keep the plugin in step with what the Descript API and Descript's own MCP connector can do, and fix what stops real work (the v0.7.2 upload bug).

## State

Shipped and live:
- **v0.7.2** (2026-09-29, PR #1, tag `v0.7.2` on `c725413`). The fix: `import --file` now names the upload after the file, extension kept. Every local upload failed before, because Descript reads the media type from the reference's extension. Verified live with a 31-minute M4A (project `88dc66c3`, "v0.7.2 upload check").

On PR #2, not released:
- `c8f5e0f` - the capability audit.
  - The spec is refreshed to version 1.2, stored byte-identical to https://help.descript.com/developers/openapi.json.
  - The old spec moved to `docs/legacy/`.
  - The report is `docs/field-reports/2026-09-30-api-and-mcp-capability-audit.md`, with a same-day addendum.
- `748dafa` - `jobs --type` accepts all five job types; `drive` access level for publish, export and batch; Underlord progress labels on stderr in human mode.
- `cc26e1e` - `descript search` plus the `descript_search` MCP tool and the `descript-search` skill (GET /search). The CLI now covers all 14 documented endpoints.
- `9e6a52a` - `descript timeline` plus the MCP tool and skill: timeline export in edl, sesx, fcp, premiere, davinci_resolve and aaf, saved locally. 400 errors now print the API's `details[].message`.
- `d33d366` - `import --project-id --file`; `--composition-id` appends to an existing composition (`update_compositions`); `--update-compositions` raw JSON; `import --library [--folder-id]` into the Drive media library. URL imports into existing projects are named after the URL's file name.
- `3d70660` - live-results addendum, repo CLAUDE.md gate lines, plugin.json activation text, search skill note.

Git:
- Worktree `/Users/juliandickie/code/descript-plugin/.claude/worktrees/bold-chaum-67586b` is on `docs/api-capability-audit-2026-09-30` = origin, clean.
- Its old local branch `claude/bold-chaum-67586b` is stale (remote deleted after PR #1), safe to delete.
- The main checkout `/Users/juliandickie/code/descript-plugin` is on `main` at `f8e79bc`, 2 behind origin (not pulled, in case another session uses it). It also holds many untracked notes (docs/help-docs, several field reports and plans, AGENTS.md files) that are not this session's. Leave them.

Descript artefacts this session left in the iDD Drive (all safe to delete):
- Project `88dc66c3-fe61-4d31-b8e4-aaf6126eda93`, "v0.7.2 upload check", 31-minute meeting audio (private workspace).
- Project `367904fa-3a71-4794-923b-d4668dd1f4f3`, "v0.8.0 QA tone", 10 seconds of test tone (private workspace).
- Media library file `f602ff08-7767-4b9a-a45c-60f08b7edc68`, `descript-plugin-qa-delete-me.wav`, in the shared library root.
- About 10 finished `export/timeline` jobs; their links expire after 24 hours.
- Empty projects from the failed uploads on 29 September, before v0.7.2.

## Decisions
- **One PR for audit and features.** I avoided stacked PRs: the repo rebase-merges, which rewrites SHAs and breaks stacked branches.
- **PR #2 left open rather than landed at handoff.** Merge and tag here are the release to marketplace users, and new write paths (library import) deserve Julian's yes.
- **Access levels.**
  - `drive` is allowed, and private stays the default.
  - Skills treat `drive` as an elevation needing affirmative words, the same as unlisted and public.
  - The iDD Drive's own settings refuse `drive` (403), and that is correct behaviour.
- **Library import stays model-invocable** with an in-skill confirmation, not operator-gated, because it is one import, not bulk.
- **URL reference naming.** Only existing-project and library URL imports changed; new-project URL imports keep `media.0` to avoid unrequested change.
- **`descript timeline` downloads the file** instead of only returning the link, because the link expires in 24 hours.
- **Rejected.** A separate `descript library` command (kept as `import --library`), and client-side date validation for search (the API validates).

## Tried and failed
- Guessing routes for the MCP connector's `list_folders` and `report_upload_status` on v1. All 404; they look MCP-only. `GET /search?type=project_folder|media_library_folder` is the public way to get folder ids.
- `add_compositions[].fps` is advertised by the MCP connector but rejected by v1 ("not allowed").
- Searching for a hyphenated file-name fragment without its extension finds nothing. Words or the full name work.

## Julian's feedback this session
- "merge and release the bumped version" (for v0.7.2).
- "run the live check with this file".
- "commit and PR, then build everything if the sessions context will allow or you can manage sub agents - handoff when you get to 85%".

## Recipes and footguns
- **Release.** Bump `package.json`, both version lines in `package-lock.json` and `.claude-plugin/plugin.json` (a test fails if they disagree), date the CHANGELOG Unreleased heading, then `gh pr merge <n> --rebase`. Tag an annotated `vX.Y.Z` on the merged release commit on main, and push the tag. The outfit repo needs no change: its descript entry is the git URL with no pin.
- **Safe probing of undocumented routes.** Send a deliberately invalid body, or `project_id` all zeros. 400 lists the rule, 403 "Project does not belong to the specified drive" means validation passed, 404 means no route. Nothing is created.
- **Live QA without the dev tree moving under you.** Run `git archive <commit> | tar -x -C <scratch>` and run `node bin/descript ...` from there. `dist/` is committed, so no build is needed.
- **Token.** The CLI reads it from its own config (`resolveCredentials`); never print it.
- **`.mcp.json` noise.** Opening this repo in Claude Code loads the root `.mcp.json` as a project server named `descript`, which fails ("Connection closed") because `${CLAUDE_PLUGIN_ROOT}` is unset. Harmless.
- **parseArgv.** A boolean flag followed by a bare word swallows that word (`search --json foo` treats `foo` as the value of `--json`). Put flags after positionals, and comma-separate list flags.
- **Custom Descript MCP.** It has generative image and video tools that the Claude directory connector lacks, and is not configured here. Add it with `claude mcp add --transport http descript-v2 https://api.descript.com/v2/mcp -s user`.

## Open work, ranked
1. Julian decides on releasing v0.8.0: merge PR #2, bump to 0.8.0, tag `v0.8.0`, then verify with a fresh clone of the tag (as done for v0.7.2).
2. Optional clean-up in Descript: delete the QA projects, the library test file and the empty projects from the failed uploads.
3. `batch run` does not show progress labels, and `batch plan` does not show `access_level` (noted by agent A, not requested).
4. Batch manifests do not validate `publish.access_level` locally; a bad level becomes an API 400.
5. `jobs` and `projects` could share the new `parseLimit` helper from search.
6. Watch Descript's spec for timeline export, drive media import and `update_compositions`, which are live but undocumented. If any starts returning 404, update the matching command.

## Questions for Julian
1. Release v0.8.0 now (merge PR #2 and tag)?
2. Should the untracked notes in the main checkout (`docs/help-docs/`, older field reports and plans) be committed? The `descript-api-reference` skill cites `docs/help-docs/`, which installed copies do not have.
3. Add the custom Descript MCP server for the generative tools?

## Kickoff prompt for the next session

```
Working directory: /Users/juliandickie/code/descript-plugin (the Descript plugin repo, published as "descript" in the outfit marketplace, which installs it straight from main). Work in a fresh worktree or branch, never on main.

READ FIRST, in order, and treat them over any assumption:
1. SESSION-HANDOFF-2026-09-30.md (on branch docs/api-capability-audit-2026-09-30, PR #2)
2. CLAUDE.md and AGENTS.md at the repo root
3. docs/field-reports/2026-09-30-api-and-mcp-capability-audit.md, including its addendum

State verified as of 2026-09-30 01:30 AEST:
- main = c725413 (v0.7.2, tagged, released).
- PR #2 (https://github.com/juliandickie/descript-plugin/pull/2), branch docs/api-capability-audit-2026-09-30, HEAD 3d70660, pushed, OPEN and unmerged. It holds the audit and six features (search, timeline export, jobs --type widening, drive access level, progress labels, import append and --library). 519 of 519 tests pass, and every feature has been exercised live.
- No version bump yet. Releasing v0.8.0 is Julian's decision.

DO NOT TOUCH: the untracked notes in the main checkout (docs/help-docs/, older field reports and plans, AGENTS.md files). Another session's work, not yours to redo.

Standing rules: verify against live output, never a status line; Sonnet subagents for fan-out, with judgment and QA kept in the main session; commit, push, merge, tag each need Julian's go mid-session; no em dashes, no colons in headings, straight quotes.

First action: verify the state above with git log and gh pr view 2. Then ask Julian whether to release v0.8.0. If yes: bump package.json, both package-lock.json version lines and .claude-plugin/plugin.json to 0.8.0; date the CHANGELOG Unreleased heading; run npm test; commit "chore(release): v0.8.0"; push; gh pr merge 2 --rebase; tag an annotated v0.8.0 on the merged release commit and push the tag; then verify from a fresh clone of the tag (run node --test "dist/tests/**/*.test.js" and one live descript search).
```
