---
name: descript-api-reference
description: Internal reference of the Descript API surface and the descript CLI. Loaded by Claude when constructing Descript requests.
user-invocable: false
---

# Descript API Reference

Background knowledge for building correct Descript requests. The plugin's CLI is the API contract; this file points at the canonical capability documentation rather than re-summarising it.

## CLI map

descript status, config, import, agent, models, transcript, translate, publish, jobs, projects, published, download-published, export, edit-in-descript, batch. Add `--json` for machine output, `--no-wait` to skip polling, `--profile` to select a Drive, `--token` to override credentials.

## Per-endpoint highest-impact delta

### import (POST /jobs/import/project_media)

Async, returns `job_id`. URL imports, direct upload (three-step flow handled automatically by `--file`), and full multitrack/`add_media`/`add_compositions` shapes via raw JSON.

- Dedicated CLI flags - `--folder <path>` (project folder placement), `--language <code>` (ISO 639-1 per media item), `--project-id <id>` (import into an existing project, no `add_compositions`). The raw `--media` JSON path remains for arbitrary shapes including multitrack sequences.

- See `docs/help-docs/Descript API.md` sections "Import media into a new project" and "Direct file upload" for the full request schema and the three-step upload walkthrough.

### agent (POST /jobs/agent)

Async, spends AI credits. The richest endpoint in the plugin. CLI flags - `--project-id` OR `--project-name`, optional `--composition-id`, `--model`, `--callback-url`, `--team-access`.

- `composition_id` accepts a full UUID, a 5-character short ID (e.g. `39677` from a Descript URL), or a full project URL (`https://web.descript.com/{project_id}/39677`). The CLI passes the value through unchanged; the API normalises.

- Omitting `--composition-id` targets the whole project. This is the bulk-operations mode.

- The full capability surface (Captions, Clips, Animations, Translate, Sound Effects and Music, Slides to Video, plus empirically-confirmed Metadata and Query classes) lives in `docs/help-docs/Underlord (beta) Your AI co-editor in Descript.md`. Defer to that file when reasoning about what Underlord can do.

- The full Underlord model list (Auto plus seven specific options) lives in the same help-docs file. Pass `--model` through as-is; the API validates.

- Job results now include `resolved_model` (the canonical id that ran; `auto` requests report `auto`) and `conversation_id`. Model ids are canonical (`claude-haiku-4.5`) with tier aliases (`claude-haiku`) - run `descript models` for the live catalog instead of trusting any static list.

- `conversation_id` is response-only - it is absent from the request schema, so a follow-up call cannot continue the same agent conversation. Write every prompt self-contained (state preconditions, e.g. "add captions if there are none, then..."); a clarifying question from the agent still bills a full round (observed 5.4 credits for a question alone). See the `translate` section below, which exists partly because of this constraint.

- AI credit costs per operation live in `docs/help-docs/Track and understand your media minutes and AI credits.md`. The `claude-haiku` alias is the cost-efficient default for credit-sensitive workflows (low tier; run `descript models` for the live catalog).

- Prompt-writing framework (Action / Context / Tone / Format / Constraints) - see `docs/help-docs/How to write effective prompts for Descript's AI features.md`. The API has no `@` mention affordance, so API callers describe context in prose.

### publish (POST /jobs/publish)

Async, free on standard plans (creates a hosted share URL). Video or Audio, resolution, access_level (`public`, `unlisted`, `private`; the v0.2.1 CLI rejects `drive` at parse time).

- **Republish keying** - the same `(project_id, composition_id, media_type)` reuses the prior share URL on every subsequent publish; bookmarks keep working. A Video publish and an Audio publish of the same composition produce two distinct share URLs.

### jobs (GET /jobs, GET /jobs/{id}, DELETE /jobs/{id})

State is `queued`, `running`, `stopped`, `cancelled`. Completion is `job_state === "stopped"`, then `result.status` is `success`, `partial` (import only), or `error`.

- The list endpoint accepts `type` filtered to `import/project_media` or `agent` only (NOT `publish`).

- 30-day max lookback via `created_after` and `created_before`.

- CLI filter flags - `--project-id`, `--type`, `--created-after`, `--created-before`, `--limit 1-100`, `--cursor`. Enum violations (e.g. `--type publish`) fail fast at parse time. See `docs/help-docs/Descript API.md` under "List jobs" for the full parameter shape.

### projects (GET /projects, GET /projects/{id})

- CLI filter flags - `--name` (case-insensitive contains), `--folder-path`, `--created-by` (UUID or `me`), `--created-after`, `--created-before`, `--updated-after`, `--updated-before`, `--sort` (name|created_at|updated_at|last_viewed_at), `--direction` (asc|desc), `--limit 1-100`, `--cursor`. Enum violations on `--sort` and `--direction` fail fast at parse time.

- See `docs/help-docs/Descript API.md` under "List projects" for the full filter set.

### status (GET /status)

Stabilized in the 2026-08-27 spec refresh - documented payload is `{ drive_id, drive_name, api_version }`, all required server-side; the plugin keeps its fields optional for resilience.

### models (GET /agent/models)

Free, read-only. Returns `availableModels` (id + cost tier low|medium|high) and `aliases` (id, resolvesTo, description, cost). The live response is the source of truth for what `agent --model` accepts - the catalog changes as models ship and retire. Aliases track the recommended version per tier (e.g. `claude-haiku` always resolves to the current recommended Haiku); prefer aliases over pinned ids in prompts and manifests. NOTE - this endpoint is camelCase on the wire, unlike the rest of the API.

### transcript (POST /export/transcript)

Free, synchronous, no job, no share URL. Body - `project_id` (required), `composition_id` (defaults to first composition), `format` (required - txt|markdown|html|rtf|docx|srt), `include_speaker_labels` (off|changes|every_paragraph, default changes), `include_markers`, `timecodes` {frequency_seconds, offset_seconds, on_markers, on_paragraphs}. Response is the raw file (binary for docx). For transcript-only workflows this replaces the publish-then-WebVTT path in `descript export` - never publish just to read a transcript.

### translate (composed workflow over POST /jobs/agent, not a standalone endpoint)

`descript translate <project-id> [composition-id] --language "<name>" [--model <m>]` - billable (spends AI credits via the underlying agent job). Snapshots the project's compositions, runs a self-contained agent prompt ("add captions if missing, then translate to <language>, captions only, no dubbing"), then re-fetches the project and diffs to find the new composition. This creation-time diff is the only reliable way to learn which composition carries which language - the API exposes no language field on compositions, and regional-variant translations share an identical title with their sibling (verified live 2026-08-28 on French (France) vs French (Canada)).

- `--no-wait` is rejected at parse time - the mapping needs the after-diff, so there is no fire-and-forget mode.

- Exit semantics - `0` job succeeded, at least one new composition mapped; `2` usage error (missing project id or language, or `--no-wait`); `3` the agent job itself failed (API or job error); `4` question-nothing-created - job succeeded but nothing was created because the agent asked a question or declined, its response is in the output, resubmit with a more complete self-contained prompt; `5` billed-but-mapping-uncaptured - job succeeded and credits were SPENT, but the post-job project re-fetch failed, so the mapping could not be captured. Do NOT re-run (it would bill again) - list compositions with `descript projects get <project-id>` and identify the new one from the agent response in the output.

- Regional variants are promptable and live-verified (2026-08-28): name them exactly as Descript's UI picker does (French (France), French (Canada), Spanish (Spain), Spanish (Latin America), Portuguese (Brazil), Portuguese (Portugal), Chinese (Simplified), Chinese (Traditional), English (UK)).

- Dubbing and lip sync are out of scope for this command; route those through `agent` (skill `descript-edit`) with a purpose-built prompt.

### published (GET /published_projects/{slug})

Returns metadata, signed `download_url`, and WebVTT `subtitles` for a published composition. Read-only, free. The basis of `descript export` and `descript download-published`. Each call returns a fresh signed `download_url`, so `descript export --resume` can re-download missing files without re-publishing - see `docs/specs/2026-05-21-export-resume-design.md` for the resume semantics table.

### edit-in-descript (POST /edit_in_descript/schema)

Partner-gated import URL exchange. Requires Descript onboarding to enable. Not user-reachable without the partner integration.

## Rate limiting

`Retry-After`, `X-RateLimit-Remaining`, and `X-RateLimit-Consumed` headers on 429 responses. The plugin's HTTP layer honors `Retry-After` automatically with one retry; see `src/client/http.ts:53,68-86` for the implementation and `tests/client/http.test.ts:36-53` for the test.

## Job completion

A job is done when `job_state === "stopped"`. Then `result.status` is `success` (or `partial` for import) or `error`. The CLI's `AndWait` workflows handle polling automatically with backoff. Add `--no-wait` to opt out and use `--callback-url` for headless completion.

## Auth

Bearer token, Drive-scoped. Resolution order - `--token` flag, `DESCRIPT_API_TOKEN` env, config-file profile, plugin `api_token` user-config.

## Cost and gate annotations (which CLI calls spend credits, create artifacts, or carry operator-only gates)

Gate matrix per the Stream B ADR (`docs/specs/2026-05-20-model-invocation-policy.md`):

- `agent` (skill - `descript-edit`) - billable per call. Spends AI credits and media seconds. Model-invocable with in-skill confirmation. Always disclose cost and confirm.

- `translate` (skill - `descript-translate`) - billable per call (agent endpoint). Model-invocable with in-skill confirmation. Always disclose cost and record the returned composition mapping.

- `publish` (skill - `descript-publish`) - not billable on standard plans, but creates a hosted share URL. Model-invocable with in-skill confirmation that defaults access-level to `private`. Elevation to `unlisted` or `public` requires affirmative user language.

- `batch` (skill - `descript-batch`) - conditionally billable (only when manifest items include `agent_prompt`). Always risk-bearing for bulk-write blast radius. **Operator-only via `disable-model-invocation: true`.** The CLI's mandatory `batch plan` then `batch run --confirm` dance is the load-bearing safety.

- `export` (skill - `descript-export`) - triggers one publish per composition. Same risk profile as `publish`, multiplied. Model-invocable with in-skill confirmation; defaults access-level to `private`. Publishes serialize per project (Descript allows one publish job per project at a time); the CLI chains same-project items automatically and waits out already-running locks rather than failing the item. Colliding composition titles (regional translation variants share an identical title) get a " [slug]" folder suffix - read `outputDir` per item from the report rather than assuming title-named folders. `--names <file>` (v0.7.0) renders standard-compliant flat filenames from a manifest of lesson fields plus a composition-to-language map (iDD language filename standard); pre-flight validates the whole batch before any publish and the report records `renderedName` per item.

- `download-published` (skill - `descript-download-published`) - read-only, free, unrestricted.

- `transcript` (skill - `descript-transcript`) - free, read-only, no artifacts. Unrestricted.

- `models` (no dedicated skill; documented here) - free, read-only. Unrestricted.

- Everything else (`status`, `config`, `import`, `jobs list/get/cancel`, `projects list/get`, `published`, `edit-in-descript`) is read-only or non-billable, unrestricted.

Contributor rule of thumb - operator-gate any skill whose blast radius extends beyond a single composition, or that can spend AI credits transitively via `agent_prompt` items.

## Help-docs index

- `docs/help-docs/Descript API.md` - endpoint surface, schemas, request samples, official CLI install notes.

- `docs/help-docs/Underlord (beta) Your AI co-editor in Descript.md` - agent capability classes, model picker, beta caveats.

- `docs/help-docs/How to write effective prompts for Descript's AI features.md` - prompt framework.

- `docs/help-docs/Track and understand your media minutes and AI credits.md` - billing concepts and per-operation cost table.

- `docs/help-docs/AI Tools Overview.md`, `Edit for Clarity.md`, `Create clips from your content.md`, `Repurpose with AI Tools.md`, `Publish with AI Tools.md`, `Automatic multicam.md`, `Translate and dub speech overview.md`, `Manage your do not translate list.md` - feature-specific capability docs that Underlord can also drive via natural-language prompt.
