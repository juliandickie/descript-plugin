# Field Report - October Release Review, Search API and MCP (2026-10-23)

Status - PROPOSALS 1 TO 5 BUILT on branch `docs/descript-release-review-2026-10-23`, uncommitted, awaiting Julian's review (see the addendum)

Author - Claude, under Julian Dickie's direction

Method - Read the Descript changelog at https://descript.canny.io/changelog. Downloaded the published spec from https://help.descript.com/developers/openapi.json and diffed it against `docs/descript-openapi.json` (stored 2026-09-30). Ran read-only calls against the iDD Drive through the plugin CLI (v0.8.0, `dist/` on main at `8d0b307`), the plugin's own MCP server, and Descript's official MCP connector (the Claude directory connector). Probed new request fields with bodies that fail validation or name an all-zero project, so nothing was created and no credits were spent. No publish, import or agent job was run.

## Verdict

Nothing in the plugin is broken. The plugin already prints the direct links the changelog announces. The bigger news is in the spec, which changed under the same version number (1.2):

1. The agent endpoint now accepts `conversation_id`, so follow-up prompts can continue an Underlord conversation. The plugin's skills say the opposite, and the CLI has no way to send it.
2. Search gained a `visual` match kind (Enterprise only) and a `moment` time range on visual video matches.
3. Each search `thumbnail_url` embeds a working 72-hour signed link to the full original media file. The plugin's MCP search tool passes it straight into chat transcripts.
4. The model catalogue changed heavily. `claude-opus` now resolves to `claude-opus-5.5`.

The publish fixes in the changelog retire no plugin workaround. The per-project publish serialisation is not mentioned and stays.

## What the changelog says

There is one entry since the last audit, the release roundup dated 13 October 2026 (its title says 12 October). The entry before it is dated 17 September, which the 2026-09-30 audit covered.

- **Search API and MCP.** The Search API returns direct links to projects and files, with thumbnail previews. The Descript MCP also returns direct links. These are the only API or MCP items.
- **Drive search in the app.** A drive-wide search bar and results page. Underlord can find files, folders, projects and layout packs.
- **Publishing fixes.** Some publishes failed or did not play. Published links kept showing older versions after edits. YouTube publishes could hang.
- **Export fixes.** "Invalid Keyframe", missing fonts, silent local export failure with missing media, and AAF clip gain, markers and media name capitalisation.
- **Models.** Gemini 3.8 Flash is in the picker. Enterprise drives default to Claude Opus 5.5. AI Speech moves to ElevenLabs v4, and some projects switch on open.
- **Other.** Async recording requests (Enterprise), a "Fix file issue" badge, 12 months of usage history, video generation defaults (MiniMax H3 Max Turbo on paid plans).

None of the app-only items (recording requests, usage history, ElevenLabs v4, file repair, video generation) has an API surface.

## Spec changes (same version 1.2)

The live spec differs from the stored copy in five places. `info.version` did not change, so a version check alone would miss all of them.

### POST /jobs/agent - conversation_id (new request field)

- `conversation_id` (UUID) continues an earlier conversation. It requires `project_id`, and the project must match the conversation.
- New errors - 400 "Conversation ... belongs to a different project", 404 "Conversation ... not found".
- The overview guide now says to pass the returned `conversation_id` with the same `project_id` for a follow-up, and that a single complete prompt also works.
- **Live check.** `conversation_id: "nope"` returned 400 `"conversation_id" must be a valid GUID`. A valid UUID with an all-zero project passed validation and stopped at 403 "Project does not belong to the specified drive". So the field is accepted on v1 today.
- **Not checked.** A real follow-up turn. It is billable (about 5 credits per short exchange, from earlier runs).
- Descript's MCP connector's `prompt_project_agent` now documents `conversation_id` too, plus an analytics-only `client_model` argument.

### GET /search - visual match and moment

- `match` accepts `visual`, which matches what appears in videos and images. Enterprise drives only, and it cannot be combined with `name` or `content`.
- Media results gain `moment` `{ start_time_sec, end_time_sec }` on visual video matches.
- New 403 "Visual search is not available for this drive".
- **Live check.** `match=visual` on the iDD Drive returned that 403, so the iDD Drive is not on the Enterprise plan. `match=visual&match=name` returned 400 "\"match\" cannot combine visual with other match kinds". A real visual result and its `moment` could not be observed.

### GET /jobs/{job_id} - result status wording

The description now states that a finished job reports `result.status` `success` or `error`, that imports can return `partial`, and that a file inside `media_status` uses `failed`. The plugin already handles all four (`src/workflows/importAndWait.ts`). No change needed.

### Agent model examples

Examples changed from `claude-opus-4.8` to `claude-opus-5.5` and from `claude-haiku-4.5` to `claude-haiku-5.5`. Cosmetic in the spec, but it reflects the catalogue change below.

### Overview guide

The guide now documents direct file upload (`content_type` plus `file_size`, then PUT to `upload_urls`). The plugin has used this flow since v0.7.2.

## Search response, observed live

The documented shape is unchanged from 2026-09-30. The 30 September spec already said `url` opens the item and that files inside a project open that project with the file highlighted. So the changelog item describes something the plugin already reads and prints. Observed on 2026-10-23:

| Result type | Fields present | url form |
|---|---|---|
| project | type, project_id, name, url, owner, updated_at | `https://web.descript.com/<project_id>` |
| video in a project | adds asset_id, location, project_id, duration, thumbnail_url | `https://web.descript.com/<project_id>?file=<asset_id>` |
| audio in the media library | asset_id, location, duration, no thumbnail_url | `https://web.descript.com/media-library?drive=<drive_id>&item=<asset_id>` |

- Projects carry no thumbnail. "Thumbnail previews" means `thumbnail_url` on video and image files only, as before.
- `descript search` human output already prints each `url`. `--json` and the MCP tool return the raw records. Nothing in `src/cli/commands/search.ts` or `src/client/types.ts` needs to change for the links.

### thumbnail_url carries a link to the whole source file

- Each `thumbnail_url` is a `media.descriptusercontent.com` image proxy URL, about 1,430 characters long. Its outer signature expires 72 hours after the search.
- Its `url` parameter is a signed Google Cloud Storage GET for the original media file, also valid 72 hours (`X-Amz-Expires=259200`).
- An unauthenticated range request to that inner URL returned 206 and `bytes 0-0/16106144`. So anyone who sees the thumbnail URL can download the full 16 MB source video for three days, without a Descript login.
- The plugin's MCP `descript_search` tool returns the raw JSON, so every video or image hit puts one of these links into the chat transcript. Three video hits made a 5,712-character response, about 75 percent of it thumbnail URLs.
- Descript's own MCP connector handles this differently. Its `search_drive` returns the JSON without `thumbnail_url` and sends the thumbnails as image content blocks (first 12 video and image results), each labelled with its `asset_id`.
- The `descript-search` skill calls thumbnail URLs "signed and time-limited" but does not say they expose the source file.

## Model catalogue (GET /agent/models, 2026-10-23)

Models - auto, claude-fable-5.1, claude-opus-5.5, claude-sonnet-5.5, claude-haiku-5.5, gpt-6-astra, gpt-6-astra-pro, gpt-6.1-sol, gpt-6-luna, gemini-4-argon, gemini-3.8-flash.

Aliases - `claude-fable` to claude-fable-5.1, `claude-opus` to claude-opus-5.5, `claude-sonnet` to claude-sonnet-5.5, `claude-haiku` to claude-haiku-5.5, `gpt` to gpt-6.1-sol (new alias), `gemini-flash` to gemini-3.8-flash (new alias).

Removed since 2026-09-30 - claude-fable-5, claude-opus-4.8, claude-opus-4.7, claude-opus-4.6, claude-sonnet-5, claude-sonnet-4.6, claude-haiku-4.5, gpt-5.5, gpt-5.4, gemini-3.5-flash, gemini-3.1-pro.

Effect on the plugin - none in code. `descript models` reads the live list and the skills already say to prefer aliases. Any saved batch manifest that pins a removed id (for example `claude-haiku-4.5`) will now fail at the API. Only test fixtures in `tests/` name pinned ids, and they are mock data.

## Publish fixes and plugin workarounds

| Changelog fix | Plugin workaround it could affect | Assessment |
|---|---|---|
| Publishes that failed or would not play | None. Failed publish jobs already surface as errors. | Nothing to retire. |
| Published links showed an older version after edits | None to retire. The `descript-publish` skill relies on republish reusing the share URL and overwriting its content. | This fix makes that guidance hold. Worth one line in the skill. |
| YouTube publishes could hang | None. The plugin does not publish to YouTube. | Not applicable. |
| (not mentioned) One publish job per project at a time | `src/workflows/exportBatch.ts` chains same-project items and waits out "publish job is already running" (30 seconds x 10). | Keep. The changelog says nothing about it. Testing it needs two real publishes on one project, which was out of scope. |

## MCP connection status

- **Plugin MCP (`plugin:descript:descript`).** Connects now. `descript_status` returned the iDD Drive (`a563a718-...`, api v1) and `descript_search` returned results. The 19 October failure did not recur.
- **Descript's MCP connector (Claude directory).** Connected. `search_drive`, `get_project`, `prompt_project_agent` and `publish_project` schemas were read; `search_drive` was called.
- **`descript-v2` custom server** (`https://api.descript.com/v2/mcp`). Still needs Julian to sign in through `/mcp`. Its tool list remains uninspected.

## Proposed plugin changes (not started)

1. **Agent follow-ups.** `descript agent --conversation-id <uuid>` (requires `--project-id`, validated as a UUID locally) and MCP `descript_agent` argument `conversation_id`. Print the returned `conversation_id` in human output so it can be reused. Rewrite the "one-shot, cannot continue" rules in `skills/descript-edit/SKILL.md` and `skills/descript-api-reference/SKILL.md`, keeping "self-contained prompts are cheaper" as advice. Keep the in-skill cost confirmation for every turn. `translate` stays single-turn. Needs one billable live check before release.
2. **Search thumbnails out of the MCP output.** The MCP `descript_search` tool drops `thumbnail_url` unless the caller passes `thumbnails: true`. CLI `--json` stays raw. Skill wording - a thumbnail URL exposes the source file for 72 hours, so do not paste it anywhere shared.
3. **Visual search.** Add `visual` to `--match` and the MCP enum. Reject `visual` combined with another kind as a usage error (exit 2, no request). Map the 403 to "visual search needs an Enterprise drive". Show `moment` on media lines as `@ <start>-<end>s`. Add `moment` to `MediaSearchResult`. Untestable live on the iDD Drive, so pin it with mock tests.
4. **Spec refresh.** Store the 2026-10-23 spec as `docs/descript-openapi.json` and move the 2026-09-30 copy to `docs/legacy/`. Add a note that Descript changes the spec without bumping `info.version`, so audits should diff content, not version.
5. **Publish skill note.** One line in `descript-publish` that the stale-link bug (republished links showing an older version) was fixed on 13 October 2026. Keep the per-project serialisation code and wording.
6. **Optional.** Refresh the `claude-haiku-4.5` ids in test fixtures to current ids. Mock data only, so this is cosmetic.

Proposals 1 to 3 change behaviour and would make a minor release (0.9.0). Proposals 4 to 6 are docs.

## Unconfirmed

- A real `conversation_id` follow-up turn (billable).
- Visual search results and the `moment` field (needs an Enterprise drive).
- Whether the per-project publish lock still applies after the publish fixes (needs two real publishes).
- Whether the media `url` forms (`?file=` and `media-library?item=`) changed after 2026-09-30. The 30 September audit did not record their form, so this report cannot say whether they are new.
- The `descript-v2` tool list (needs sign-in).

## Housekeeping found

- A stale worktree from the v0.8.0 build is still at `.claude/worktrees/bold-chaum-67586b` (detached HEAD at `7bfae0a`, from before v0.8.0 was merged). It still holds the old "conversation_id is response-only" wording. Likely safe to remove with `git worktree remove` once Julian agrees.

## Artefacts left in Descript

None. Every probe was a read or a request rejected by validation.

## Addendum - proposals 1 to 5 built (same day)

Julian approved proposals 1 to 5 and one billable follow-up test. All five are built on this branch, uncommitted. `npm test` passes 533 of 533 (519 before, plus 14 new).

- **Agent follow-ups.** `descript agent --conversation-id <uuid>` (needs `--project-id`, UUID checked locally) and MCP `conversation_id`. Human output prints `Conversation: <uuid>`. A failed run now also reports the conversation id from the submit response. Skills rewritten.
- **MCP search thumbnails.** MCP `descript_search` adds `--no-thumbnails` unless `thumbnails: true`. Live through this branch's MCP server, one video hit came back as 549 characters without `thumbnail_url`, against 2,004 characters with it.
- **Visual search.** Live, `--match visual` gave exit 3 with the Enterprise hint, and `--match visual,name` gave exit 2 with no request. `moment` display is covered by mock tests only.
- **Spec refresh.** `docs/descript-openapi.json` is byte-identical to the live file (checked with `cmp`). The 2026-09-30 copy is in `docs/legacy/`.
- **Publish note.** One line in `descript-publish`.

### Billable follow-up test - not run

- Both earlier QA projects (`367904fa-...` and `88dc66c3-...`) have been deleted, and every agent conversation from the last 30 days belongs to a team course project, so none was continued.
- Turn 1 was submitted with `--project-name "descript-plugin QA conversation test - delete me"`, `--model claude-haiku` and a read-only prompt. The API refused it at submit with 402 "Insufficient AI credits". No job ran, no project was created (a search for it found nothing), and no credits were spent.
- So a real follow-up turn is still unconfirmed. What is confirmed is that v1 accepts `conversation_id` (validation passed on 2026-10-23) and the CLI sends it (mock tests). The test needs the Drive's AI credits topped up, then two turns of about 5 credits each on a throwaway project.
