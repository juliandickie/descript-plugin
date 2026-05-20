---
name: descript-api-reference
description: Internal reference of the Descript API surface and the descript CLI. Loaded by Claude when constructing Descript requests.
user-invocable: false
---

# Descript API Reference

Background knowledge for building correct Descript requests. The plugin's CLI is the API contract; this file points at the canonical capability documentation rather than re-summarising it.

## CLI map

descript status, config, import, agent, publish, jobs, projects, published, download-published, export, edit-in-descript, batch. Add `--json` for machine output, `--no-wait` to skip polling, `--profile` to select a Drive, `--token` to override credentials.

## Per-endpoint highest-impact delta

### import (POST /jobs/import/project_media)

Async, returns `job_id`. URL imports, direct upload (three-step flow handled automatically by `--file`), and full multitrack/`add_media`/`add_compositions` shapes via raw JSON.

- Supported via raw `--media` and `--compositions` JSON today - `folder_name` (place project in a folder), `language` (ISO 639-1 per media item), `project_id` (import into an existing project). Dedicated CLI flags for these land in v0.4.0.

- See `docs/help-docs/Descript API.md` sections "Import media into a new project" and "Direct file upload" for the full request schema and the three-step upload walkthrough.

### agent (POST /jobs/agent)

Async, spends AI credits. The richest endpoint in the plugin. CLI flags - `--project-id` OR `--project-name`, optional `--composition-id`, `--model`, `--callback-url`, `--team-access`.

- `composition_id` accepts a full UUID, a 5-character short ID (e.g. `39677` from a Descript URL), or a full project URL (`https://web.descript.com/{project_id}/39677`). The CLI passes the value through unchanged; the API normalises.

- Omitting `--composition-id` targets the whole project. This is the bulk-operations mode.

- The full capability surface (Captions, Clips, Animations, Translate, Sound Effects and Music, Slides to Video, plus empirically-confirmed Metadata and Query classes) lives in `docs/help-docs/Underlord (beta) Your AI co-editor in Descript.md`. Defer to that file when reasoning about what Underlord can do.

- The full Underlord model list (Auto plus seven specific options) lives in the same help-docs file. Pass `--model` through as-is; the API validates.

- AI credit costs per operation live in `docs/help-docs/Track and understand your media minutes and AI credits.md`. Haiku 4.5 is the cost-efficient default for credit-sensitive workflows.

- Prompt-writing framework (Action / Context / Tone / Format / Constraints) - see `docs/help-docs/How to write effective prompts for Descript's AI features.md`. The API has no `@` mention affordance, so API callers describe context in prose.

### publish (POST /jobs/publish)

Async, free on standard plans (creates a hosted share URL). Video or Audio, resolution, access_level (`public`, `unlisted`, `private`; the v0.2.1 CLI rejects `drive` at parse time).

- **Republish keying** - the same `(project_id, composition_id, media_type)` reuses the prior share URL on every subsequent publish; bookmarks keep working. A Video publish and an Audio publish of the same composition produce two distinct share URLs.

### jobs (GET /jobs, GET /jobs/{id}, DELETE /jobs/{id})

State is `queued`, `running`, `stopped`, `cancelled`. Completion is `job_state === "stopped"`, then `result.status` is `success`, `partial` (import only), or `error`.

- The list endpoint accepts `type` filtered to `import/project_media` or `agent` only (NOT `publish`).

- 30-day max lookback via `created_after` and `created_before`.

- CLI filter flags pending v0.4.0; full parameter shape in `docs/help-docs/Descript API.md` under "List jobs".

### projects (GET /projects, GET /projects/{id})

- The list endpoint supports rich filtering by name, folder path, creator, date ranges, with sort and pagination. The CLI currently exposes none of these; v0.4.0 adds them.

- See `docs/help-docs/Descript API.md` under "List projects" for the full filter set.

### status (GET /status)

Vendor-flagged "work in progress". Live payload is `{ drive_id, api_version }`; OpenAPI says `{ status: "ok" }`; an empty 2xx is possible. All `StatusResponse` fields are optional to reflect the unstable contract.

### published (GET /published_projects/{slug})

Returns metadata, signed `download_url`, and WebVTT `subtitles` for a published composition. Read-only, free. The basis of `descript export` and `descript download-published`.

### edit-in-descript (POST /edit_in_descript/schema)

Partner-gated import URL exchange. Requires Descript onboarding to enable. Not user-reachable without the partner integration.

## Rate limiting

`Retry-After`, `X-RateLimit-Remaining`, and `X-RateLimit-Consumed` headers on 429 responses. The plugin's HTTP layer honors `Retry-After` automatically with one retry; see `src/client/http.ts:53,68-86` for the implementation and `tests/client/http.test.ts:36-53` for the test.

## Job completion

A job is done when `job_state === "stopped"`. Then `result.status` is `success` (or `partial` for import) or `error`. The CLI's `AndWait` workflows handle polling automatically with backoff. Add `--no-wait` to opt out and use `--callback-url` for headless completion.

## Auth

Bearer token, Drive-scoped. Resolution order - `--token` flag, `DESCRIPT_API_TOKEN` env, config-file profile, plugin `api_token` user-config.

## Cost annotations (which CLI calls spend credits or create artifacts)

- `agent` - billable per call. Spends AI credits and media seconds. Always disclose and confirm.

- `publish` - not billable on standard plans, but creates a hosted share URL. Risk-bearing for any access level above `private`.

- `batch` - conditionally billable (only when manifest items include `agent_prompt`). Always risk-bearing for bulk-write blast radius.

- `export` - triggers one publish per composition. Same risk profile as `publish`, multiplied. Confirm scope before invoking.

- Everything else (`status`, `config`, `import`, `jobs list/get/cancel`, `projects list/get`, `published`, `download-published`, `edit-in-descript`) is read-only or non-billable.

## Help-docs index

- `docs/help-docs/Descript API.md` - endpoint surface, schemas, request samples, official CLI install notes.

- `docs/help-docs/Underlord (beta) Your AI co-editor in Descript.md` - agent capability classes, model picker, beta caveats.

- `docs/help-docs/How to write effective prompts for Descript's AI features.md` - prompt framework.

- `docs/help-docs/Track and understand your media minutes and AI credits.md` - billing concepts and per-operation cost table.

- `docs/help-docs/AI Tools Overview.md`, `Edit for Clarity.md`, `Create clips from your content.md`, `Repurpose with AI Tools.md`, `Publish with AI Tools.md`, `Automatic multicam.md`, `Translate and dub speech overview.md`, `Manage your do not translate list.md` - feature-specific capability docs that Underlord can also drive via natural-language prompt.
