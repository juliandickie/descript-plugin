# Field Report - API Drift Audit (2026-08-27)

Status - FINDINGS ONLY (no code changed; candidate scope for v0.5.0)

Author - Claude, under Julian Dickie's direction

Method - Extracted the live OpenAPI spec from the Redoc state embedded in https://docs.descriptapi.com/ and deep-diffed it against `docs/descript-openapi.json` (the v0.4.1 baseline). Live-verified findings against the API with the iDD Drive token and smoke-tested the plugin MCP shim (status, projects list/get, jobs list).

## Verdict

The API has grown since the 2026-05-21 baseline. 51 spec differences, including two new endpoints and one new job type the plugin does not cover. Nothing in the plugin is broken - all existing commands and the MCP shim work against the live API (verified 2026-08-27). The gaps are missing capability, not breakage.

## New endpoints (not covered by the plugin)

### GET /agent/models

Lists available Underlord models and aliases with coarse cost tiers (low/medium/high). Live response on 2026-08-27 - models `auto`, `claude-fable-5`, `claude-opus-4.8/4.7/4.6`, `claude-sonnet-5`, `claude-sonnet-4.6`, `claude-haiku-4.5`, `gpt-5.5`, `gpt-5.4`, `gemini-3.5-flash`, `gemini-3.1-pro`; aliases `claude-fable`, `claude-opus`, `claude-sonnet`, `claude-haiku`, `gpt`, `gemini-pro`, `gemini-flash` that track the recommended version per tier.

Impact - the hardcoded model list in `src/cli/index.ts:22-26` ("Documented as of 2026-05-20") is stale (lists GPT 5.2, Gemini 3 Pro; misses Fable 5, Opus 4.8, Sonnet 5, GPT 5.4/5.5, Gemini 3.5 Flash). A `descript models` command backed by this endpoint would end the drift permanently; skills should recommend aliases (`claude-haiku` for credit-sensitive work) instead of pinned ids.

### POST /export/transcript

Synchronous transcript export. Body - `project_id`, optional `composition_id` (defaults to first composition), `format` (txt, markdown, html, rtf, docx, srt), `include_speaker_labels` (off | changes | every_paragraph), `include_markers`, `timecodes` (frequency_seconds, offset_seconds, on_markers, on_paragraphs). Response is the raw file (binary for docx). Smoke-tested live - returned a correct speaker-labelled txt transcript.

Impact - this replaces the plugin's publish-then-scrape-WebVTT path for transcript-only workflows. `descript export` currently triggers a publish per composition (creates a share URL, the gated risk in the model-invocation policy). A transcript-only export via this endpoint is free, synchronous, artifact-free, and could be model-invocable without the publish gate. Strong v0.5.0 candidate - likely the highest-value gap.

## New job type (partial in spec)

`JobStatus.discriminator.mapping` now includes `export/timeline` -> `#/components/schemas/TimelineExportJobStatus`, but that schema is NOT present in the published spec (dangling ref) and no creation path is documented. Descript's own MCP server offers `export_timeline` (EDL, AAF, SESX, FCPXML, Premiere XML, Resolve XML), so the endpoint exists but is not yet in the public spec. Watch for it landing; do not build against it yet.

## Changes to existing endpoints (plugin unaffected but docs/types stale)

- **status** - no longer "work in progress". Documented contract is now `{drive_id, drive_name, api_version}` with all three required; `status: "ok"` removed. `drive_name` is new (live-verified - returns "iDD"). The plugin's all-optional `StatusResponse` still parses fine; the "vendor-flagged WIP" note in the api-reference skill and types comments is stale.
- **agent** - responses gain `conversation_id`, `resolved_model`, `drive_name` (201 now requires 6 fields); success/error results gain `conversation_id` and `resolved_model`; new 403 response; model example renamed `haiku-4.5` -> `claude-haiku-4.5` (canonical ids plus aliases per /agent/models).
- **import** - request gains optional `workspace_name`; response gains `drive_name`.
- **publish** - `composition_id` now optional (defaults to first composition); `media_type` defaults to Video with documented fallback behavior; success result gains `media_type`; new 404 response; richer 422.
- **projects get** - response gains required `publishes` array (live-verified - flows through the passthrough CLI untouched). This means existing share URLs are now readable without a republish.
- **project_url** in job results now appends the composition short id when available.

## MCP shim verification (2026-08-27)

All smoke tests passed against the live API via `mcp__plugin_descript_descript__*` - `descript_status` (auth valid, iDD drive), `descript_projects list` (live data plus pagination cursor), `descript_projects get` (new `publishes` field passes through), `descript_jobs list` (empty, consistent with no API jobs in the 30-day window). The shim exposes 9 tools; CLI commands `config`, `export`, and `download-published` are CLI/skill-only, which matches the design (export carries the publish gate).

## Suggested v0.5.0 additions (beyond the existing backlog themes)

1. `descript transcript` command + skill wrapping POST /export/transcript (free, sync, ungated).
2. `descript models` command wrapping GET /agent/models; update `--model` help text to defer to it; prefer aliases in skills.
3. Refresh `docs/descript-openapi.json` from the live spec and re-derive `src/client/types.ts` (status contract, agent result fields, publishes array, workspace_name).
4. Surface `publishes` in `descript projects get` human output - existing share URLs without republish.
5. Track `export/timeline` until the schema and creation path land publicly.
