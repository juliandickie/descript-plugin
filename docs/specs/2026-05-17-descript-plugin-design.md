# Descript Plugin - Design Specification

Status - Approved (brainstorming complete, pending written-spec review)

Date - 2026-05-17

Owner - Julian Dickie (julian@instituteofdigitaldentistry.com)

Plugin name - `descript`

Repository - `juliandickie/descript-plugin`

---

## 1. Summary

A Claude Code plugin that provides complete programmatic access to every Descript API endpoint and function, as a replacement for the limited official Descript MCP connector. The plugin is built around a single, well-structured Node.js / TypeScript command-line client that is the source of truth for all behavior. Skills orchestrate that CLI for natural-language use inside a Claude session. An optional thin MCP shim execs the same CLI for callers who prefer structured tool calls. The same artifact serves three consumers from one tested contract - Claude in-session, the operator and team via the terminal, and unattended headless batch automation (cron, pipelines).

---

## 2. Goals and Non-Goals

### 2.1 Goals

Full 1:1 coverage of all 11 Descript API endpoints, including the partner-gated `edit_in_descript/schema`.

Encapsulation of the genuinely hard parts so callers never hand-roll them - asynchronous job polling, the three-step signed-URL direct upload, rate-limit-aware backoff, and manifest-driven bulk operations.

One artifact that works identically in a Claude session, in a plain shell, and in cron, with no interactive-only assumptions.

Zero runtime dependencies, so installation is a git clone via the plugin cache with no `npm install` step at consume time.

Type contracts derived from the bundled `descript-openapi.json`, so a spec refresh surfaces breaking API changes as build-time type errors rather than runtime failures.

Explicit cost and safety gating, because agent edits and publishes spend real AI credits and media seconds (money), and batch operations are destructive-batched changes that require a scope check-in before execution.

Dual distribution - a standalone self-marketplace inside the plugin repo for single-plugin install, plus an entry in the existing `outfit` umbrella catalog.

### 2.2 Non-Goals

No reimplementation of API logic in more than one place. The CLI is the only place HTTP and orchestration logic lives. Skills and the MCP shim are thin layers over it.

No dependency on the official `@descript/platform-cli`. This plugin is an independent client. Matching Descript's Node 24+ runtime lineage is for compatibility and familiarity, not code reuse.

No webhook receiver service. The plugin can pass a `callback_url` through to the API, but the plugin itself does not stand up an HTTP server to receive callbacks. Local polling is the reliable completion signal.

No conversational multi-turn agent loop against the Descript agent endpoint. The Descript API is one-shot per the vendor guidance, so the design frames agent prompts as complete single-shot instructions.

---

## 3. The Descript API - Complete Reference

Server base URL - `https://descriptapi.com/v1`

Authentication - HTTP Bearer token. A personal API token created in Descript Settings, API tokens. The token is scoped to a single Drive and inherits the creator's permissions on that Drive.

API maturity - Early Access. The vendor states the API may change and evolve. This is why types are derived from the versioned OpenAPI file.

### 3.1 The 11 Endpoints

`POST /jobs/import/project_media` (importProjectMedia) - Create a project (or import into an existing one), import media from public or signed URLs, request signed URLs for direct upload, or build a multitrack sequence, and optionally create compositions. Asynchronous. Returns `job_id`, `drive_id`, `project_id`, `project_url`, and, for direct-upload items, an `upload_urls` map.

`POST /jobs/agent` (agentEditJob) - Run an Underlord agent edit against an existing project or create a new project from a prompt. Accepts `prompt` (required), one of `project_id` or `project_name`, optional `composition_id`, optional `model`, optional `team_access`, optional `callback_url`. Asynchronous. On success the job result includes `agent_response`, `project_changed`, `media_seconds_used`, `ai_credits_used`.

`POST /jobs/publish` (publishJob) - Publish a project composition as Video or Audio at a chosen resolution and access level. Requires `project_id`. Accepts `composition_id`, `media_type`, `resolution`, `access_level`, `callback_url`. Asynchronous.

`GET /jobs` (listJobs) - List jobs.

`GET /jobs/{job_id}` (getJob) - Poll a job. The completion signal is `job_state` equal to `stopped`, after which `result.status` is `success` or `failure`.

`DELETE /jobs/{job_id}` (cancelJob) - Cancel a job. This is the stop control for a runaway batch.

`GET /projects` (listProjects) - List projects.

`GET /projects/{project_id}` (getProject) - Get a single project.

`GET /status` (getStatus) - Authentication and service status check. Used by the setup skill to verify a token.

`GET /published_projects/{publishedProjectSlug}` (getPublishedProjectMetadata) - Get metadata for a published project share page.

`POST /edit_in_descript/schema` (postEditInDescriptSchema) - Partner integration. Exchange an information schema for a one-time, three-hour Import URL. Requires separate partner access from Descript. Shipped and documented, not hidden, even though most accounts cannot use it without onboarding.

### 3.2 Asynchronous Job Model

Three endpoints (import, agent, publish) create jobs. The submit call returns immediately with `job_id` and project identifiers. Completion is determined by polling `GET /jobs/{job_id}` until `job_state` is `stopped`, then branching on `result.status`. A `callback_url` may be supplied so Descript POSTs the same job-status payload on completion, but the OpenAPI specification defines zero formal callback objects, so webhook delivery is unverified and best-effort. Local polling is therefore the trustworthy default and webhooks are an optional optimization.

### 3.3 Direct Upload Flow (three steps)

The API does not accept multipart file upload. Local files are uploaded as follows.

Step 1 - Call `POST /jobs/import/project_media` with `content_type` and `file_size` (instead of `url`) for each media item. The response returns an `upload_urls` map keyed by media reference ID, each entry containing a signed `upload_url` valid for three hours, plus `asset_id` and `artifact_id`.

Step 2 - HTTP `PUT` the raw file bytes to the signed `upload_url` with `Content-Type: application/octet-stream`. The import job detects the upload automatically.

Step 3 - Poll the job the same way as a URL import.

URL imports and direct uploads may be mixed in a single request. Items with `url` are fetched server-side. Items with `content_type` and `file_size` return signed upload URLs.

### 3.4 Rate Limiting

Exceeding the limit returns HTTP 429. The response carries `Retry-After` (seconds to wait), `X-RateLimit-Remaining`, and `X-RateLimit-Consumed`. The correct strategy is to honor `Retry-After` rather than rely on fixed delays or blind exponential backoff.

### 3.5 Error Schemas

The specification defines typed error bodies for 400, 401, 402, 403, 404, and 429. 402 corresponds to AI-credit exhaustion or payment state. 403 covers Drive permission and publish-settings restrictions (for example requesting `public` when the Drive disables search-engine indexing).

---

## 4. Architecture - Hybrid (CLI core, thin skills, optional MCP shim)

Three concentric layers. Each is independently testable and has one clear responsibility.

### 4.1 Layer 1 - Raw client (1:1 with the API)

A typed HTTP client with exactly one function per endpoint and no orchestration logic. It owns the Authorization header, request and response typing, the 429 and `Retry-After` handling primitive, and mapping of HTTP error statuses to typed error objects. It knows HTTP and nothing about polling, uploading, or batching.

### 4.2 Layer 2 - Workflows (the encapsulated value)

Composition over the raw client. This is where the design earns its value.

Poll - poll a job to completion with bounded backoff that honors `Retry-After`, an overall timeout, and a clean success-or-failure outcome.

Upload - the full three-step signed-URL direct upload, including the binary `PUT`.

importAndWait, editAndWait, publishAndWait - submit then poll then normalize the result into a stable, summarized shape (for agent edits this surfaces `agent_response`, `ai_credits_used`, `media_seconds_used`).

Batch - a manifest-driven runner for bulk import then agent-edit then publish, with concurrency limits, per-item retry on transient failures, a dry-run plan, and a structured run report.

### 4.3 Layer 3 - Presentation

CLI - argument parsing, subcommands that mirror endpoints and workflows and batch and config, machine output (JSON) versus human output, and meaningful exit codes. Pure presentation, no API logic.

MCP shim (optional) - a thin MCP stdio server where each tool maps to a CLI subcommand and execs it, returning the CLI's JSON. Optional and disable-able. Thin by construction, so it cannot drift from CLI behavior.

### 4.4 Runtime and build

Language - TypeScript, Node.js 24 or higher. Chosen for structural quality, testability, and compatibility with Descript's own Node 24+ CLI lineage.

Runtime dependencies - none. Node 24 provides global `fetch`, `node:test`, `node:fs`, `node:crypto`, and argument handling, so the consumed artifact needs no `node_modules`.

Build - TypeScript source compiled to a committed `dist/` directory. Consumers run the prebuilt JavaScript via `bin/descript`. Building is a development-time concern only. This is what makes headless and cron use reliable, since there is no install step that can fail in an unattended environment.

Type contracts - request and response types are derived from `docs/descript-openapi.json`. Refreshing the spec and recompiling turns any breaking API change into a build-time type error.

---

## 5. Repository Structure

```
descript-plugin/
├── .claude-plugin/
│   ├── plugin.json              # manifest - userConfig token, skills, mcpServers
│   └── marketplace.json         # self-marketplace (standalone install)
├── bin/
│   └── descript                 # executable - node dist/cli/index.js (bare Bash command)
├── src/
│   ├── client/
│   │   ├── http.ts              # fetch wrapper, auth header, 429/Retry-After, typed errors
│   │   ├── types.ts             # request/response types derived from descript-openapi.json
│   │   ├── jobs.ts              # importProjectMedia, agentEditJob, publishJob, listJobs, getJob, cancelJob
│   │   ├── projects.ts          # listProjects, getProject
│   │   ├── status.ts            # getStatus
│   │   ├── published.ts         # getPublishedProjectMetadata
│   │   └── editInDescript.ts    # postEditInDescriptSchema (partner-gated)
│   ├── workflows/
│   │   ├── poll.ts              # poll job until stopped, timeout, backoff
│   │   ├── upload.ts            # three-step signed-URL direct upload
│   │   ├── importAndWait.ts
│   │   ├── editAndWait.ts
│   │   ├── publishAndWait.ts
│   │   └── batch.ts             # manifest runner, concurrency, retry, dry-run, report
│   ├── config/
│   │   └── credentials.ts       # token resolution chain and named profiles
│   ├── cli/
│   │   ├── index.ts             # arg parsing, subcommands, output mode, exit codes
│   │   └── commands/            # one module per subcommand
│   └── mcp/
│       └── server.ts            # optional thin MCP shim, execs the CLI
├── dist/                        # committed compiled JavaScript (zero-build install)
├── skills/
│   ├── descript-setup/SKILL.md
│   ├── descript-import/SKILL.md
│   ├── descript-edit/SKILL.md
│   ├── descript-publish/SKILL.md
│   ├── descript-jobs/SKILL.md
│   ├── descript-batch/SKILL.md
│   └── descript-api-reference/SKILL.md
├── .mcp.json                    # registers the optional MCP shim
├── tests/                       # node:test, HTTP mocked, no live API
├── docs/
│   ├── descript-openapi.json    # source of truth (already present)
│   └── specs/                   # this design document
├── package.json
├── tsconfig.json
├── CLAUDE.md                    # AI-agent context for this plugin repo
├── CHANGELOG.md
├── LICENSE                      # MIT
└── README.md
```

Layout rules followed - all component directories at plugin root, `.claude-plugin/` holds only manifest and marketplace, no absolute paths, `${CLAUDE_PLUGIN_ROOT}` used for internal references in `.mcp.json` and skills.

---

## 6. Component Design

### 6.1 client/http.ts

A single request primitive used by every endpoint function. Responsibilities - attach `Authorization: Bearer <token>`, set JSON content type, parse JSON responses, detect 429 and read `Retry-After` and the `X-RateLimit-*` headers, and convert non-2xx responses into typed error objects (see Section 9). It exposes a low-level request function plus typed helpers. For a single API call it performs bounded, `Retry-After`-aware retries on 429 (capped by a maximum attempt count), but it does not own multi-attempt job polling, which belongs to the workflow layer.

### 6.2 client endpoint modules

`jobs.ts`, `projects.ts`, `status.ts`, `published.ts`, `editInDescript.ts`. Each exports one function per operation with input and output types from `types.ts`. No function in this layer loops, sleeps for polling, or reads the filesystem. `editInDescript.ts` documents in-code that the endpoint requires Descript partner onboarding and will return an authorization error otherwise.

### 6.3 workflows

`poll.ts` - given a `job_id`, poll `getJob` on an interval with bounded exponential backoff plus jitter, honoring any `Retry-After`, capped by an overall timeout, returning a discriminated success or failure outcome carrying the normalized `result`.

`upload.ts` - given a local file path and import parameters, perform Step 1 (request signed URLs), Step 2 (binary `PUT` of file bytes with `application/octet-stream`), then return control for Step 3 polling. Streams file bytes to avoid loading large media fully into memory.

`importAndWait.ts`, `editAndWait.ts`, `publishAndWait.ts` - submit, then poll, then normalize. Each returns a stable summary object regardless of the raw payload shape, so callers and skills get a consistent contract even while the API is Early Access.

`batch.ts` - read a manifest (Section 10), expand it into an ordered or concurrency-limited set of item pipelines (import, then optional agent edit, then optional publish), retry transient failures (429, 5xx, network) with backoff, never blind-retry a non-idempotent submit that may have succeeded, and emit a structured JSON-lines run log plus a final summary. Honors a dry-run mode that prints the full plan and performs no spend.

### 6.4 config/credentials.ts

Implements the resolution chain and named profiles (Section 8). Never logs or prints the token. Provides a redaction helper used by verbose output.

### 6.5 cli/index.ts and cli/commands

`index.ts` parses arguments with Node built-ins, selects a subcommand, chooses output mode (`--json` for machine consumers and the MCP shim, human-readable otherwise), and sets exit codes (0 success, non-zero for API error, job failure, validation error, or timeout, with distinct codes per class). Each file in `commands/` is one subcommand and is a thin adapter from parsed arguments to a client or workflow call.

Subcommand surface (complete, mirrors all functionality):

`descript config set|get|list|use` - manage credentials and profiles.

`descript status` - getStatus.

`descript import` - URL, local-file (drives the three-step upload), multitrack, with `--wait/--no-wait` and optional `--callback-url`.

`descript agent` - agentEditJob with confirmation and cost reporting, `--wait/--no-wait`.

`descript publish` - publishJob, `--wait/--no-wait`.

`descript jobs list|get|cancel` - listJobs, getJob, cancelJob.

`descript projects list|get` - listProjects, getProject.

`descript published get <slug>` - getPublishedProjectMetadata.

`descript edit-in-descript schema` - postEditInDescriptSchema (partner-gated).

`descript batch plan|run` - dry-run plan and gated execution of a manifest.

### 6.6 mcp/server.ts

An MCP stdio server. One tool per CLI subcommand including the workflow and batch commands. Each tool builds an argument vector and execs `bin/descript --json`, returning parsed JSON. No business logic. Registered through `.mcp.json` with `${CLAUDE_PLUGIN_ROOT}`. Disable-able by the user.

---

## 7. Data Flow

### 7.1 Asynchronous job (import, agent, publish)

Submit returns `job_id` plus `project_id` and `project_url` immediately. With `--wait` (the default for interactive use) the workflow polls `getJob` with backoff honoring `Retry-After` until `job_state` is `stopped`, then branches on `result.status`. Success normalizes to a clean summary. Failure exits non-zero with the error payload preserved (for example a per-media import failure map, or an agent failure reason). With `--no-wait` the command prints the `job_id` and identifiers and exits 0 immediately, for fire-and-forget headless submission, optionally also passing `--callback-url` through to the API.

### 7.2 Direct upload

`descript import --file path` triggers the three-step flow - request signed URLs, stream the binary `PUT`, then poll. Mixed URL and file imports in one invocation are supported because the API supports them in one request.

### 7.3 Batch

`descript batch plan manifest.json` prints the full intended operation set with per-item actions and an estimated count, and performs no spend. `descript batch run manifest.json --confirm` executes with concurrency limits, per-item retry, and a structured run report. Without `--confirm` the run subcommand refuses and points at `plan`.

---

## 8. Credential Resolution and Profiles

First match wins. The token is never printed or written to the repository and is redacted in verbose output.

1. `--token` explicit flag (scripts and one-off use).

2. `DESCRIPT_API_TOKEN` environment variable (cron, CI, headless).

3. Config file at `~/.config/descript/credentials.json` written by `descript config set`.

4. Plugin `userConfig.api_token` (declared `sensitive: true`), delivered to the subprocess as `CLAUDE_PLUGIN_OPTION_API_TOKEN`.

Profiles - Descript tokens are Drive-scoped, and the operator runs distinct entities (Institute of Digital Dentistry, Pro Marketing, and per-country distribution Drives). The config file therefore holds multiple named profiles. Selection is by `--profile <name>` or the `DESCRIPT_PROFILE` environment variable, with a configured default. This is a genuine cross-Drive automation requirement, not scope creep.

---

## 9. Error Handling and Rate Limiting

HTTP error statuses map to typed errors with actionable messages.

| Status | Meaning | CLI behavior |
|--------|---------|--------------|
| 400 | Invalid request | Non-zero, echo validation detail |
| 401 | Bad or expired token | Non-zero, direct user to `descript-setup` |
| 402 | AI credits exhausted or payment state | Non-zero, state the credit shortfall explicitly |
| 403 | Drive permission or publish-settings block | Non-zero, name the likely cause |
| 404 | Job or project not found | Non-zero |
| 429 | Rate limited | Honor `Retry-After`, bounded retries, then fail loud |
| 5xx or network | Transient | Exponential backoff plus jitter on idempotent GET only |

Non-idempotent submits (the three POST job endpoints) are not blindly retried, because a retry could create a duplicate job or duplicate spend. Job-level failure (HTTP 200 but `job_state` stopped with `result.status` of `failure`) exits non-zero with the failure payload preserved. All failures are surfaced loudly. Partial batch success is reported as partial, never as success.

---

## 10. Batch Manifest Format

A JSON manifest describing a list of items. Each item has a source (URL or local file path or multitrack definition), an optional project name or target project ID, an optional one-shot agent prompt, and an optional publish specification (media type, resolution, access level). Top-level options set concurrency, profile, and default callback URL. `batch plan` validates the manifest and prints the resolved plan. `batch run --confirm` executes it. A JSON-lines run log records per-item submission, job IDs, outcomes, credits and seconds used, and final state, so an unattended run is fully auditable after the fact.

---

## 11. Cost and Safety Gates

Agent edits and publishes spend AI credits and media seconds, which is real money. Batch operations are destructive-batched changes. Per the operator's standing instruction to require a scope check-in before destructive batched changes, the following gates are mandatory.

The batch runner defaults to dry-run. Execution requires explicit `--confirm`. The plan is printed in full (no summarization) before any spend.

`descript-publish` and `descript-batch` skills are `disable-model-invocation: true`. Claude can prepare and explain them, but the operator triggers the spend.

The `descript-edit` skill requires an explicit confirmation step before submitting an agent job and always reports `ai_credits_used` and `media_seconds_used` from the result, so cost is never silent.

`descript jobs cancel` is always available so a runaway job or batch can be stopped.

The token is treated like a password - never echoed, never committed, redacted in logs.

---

## 12. Skills Design

All skills are thin. They teach Claude when and how to call the `descript` binary and how to interpret job results. They do not reimplement logic.

`descript-setup` - user-invocable. Configure and verify a token through `descript status`. Explains Drive scoping and profiles. Default invocation allowed.

`descript-import` - import media by URL, local file (drives the three-step upload), or multitrack. Default invocation allowed (import alone does not spend AI credits, though it consumes processing).

`descript-edit` - Underlord agent edits. Teaches one-shot prompt framing because the API is not conversational. Requires explicit confirmation before submit. Reports credits and seconds used. Default invocation allowed but with a mandatory in-skill confirmation gate.

`descript-publish` - publish a composition. `disable-model-invocation: true` (operator-triggered spend).

`descript-jobs` - list, inspect, and cancel jobs. Interprets `job_state` and `result.status`. Default invocation allowed for list and get. Cancel requires confirmation.

`descript-batch` - build and run a batch manifest. `disable-model-invocation: true`. Always plans (dry-run) before any run.

`descript-api-reference` - `user-invocable: false` background knowledge. The full endpoint and field reference distilled from the OpenAPI, so Claude can construct correct payloads without bloating every other skill's context. Hidden from the slash menu, available to Claude on demand.

---

## 13. MCP Shim

`.mcp.json` registers a server run as `node ${CLAUDE_PLUGIN_ROOT}/dist/mcp/server.js`. It exposes one tool per CLI subcommand, including the workflow and batch commands. Each tool constructs an argument vector, execs the CLI with `--json`, and returns the parsed output. It contains no API logic and cannot drift from the CLI. It is optional and can be disabled by the user who only wants the skill and CLI surfaces. This satisfies the Hybrid choice without creating a second implementation to maintain.

---

## 14. Testing Strategy

`node:test` with HTTP mocked through the built-in `undici` `MockAgent`. No live API calls in the default suite.

Coverage - every client endpoint function, error mapping for each documented status, the polling state machine with fake timers and simulated `job_state` transitions, the three-step upload including the binary `PUT`, credential resolution precedence and profile selection, CLI argument parsing and exit codes per outcome class, batch concurrency, retry behavior, and the dry-run gate, and an MCP shim smoke test that asserts a tool call execs the CLI and returns its JSON.

An optional live smoke test, gated behind an environment flag and a real token, exercises an import of Descript's public demo file end to end.

`claude plugin validate .` runs in CI and must pass with zero errors. The build (`tsc`) and the test suite run in CI on every change.

---

## 15. Manifest, Versioning, and Distribution

### 15.1 plugin.json

Declares `name`, `version`, `description` with high-density trigger phrasing, `author`, `license` MIT, `keywords`, the `skills` directory, the `mcpServers` reference to `.mcp.json`, and a `userConfig` with a single `api_token` field marked `sensitive: true` and a non-required `default_profile` string. No absolute paths.

### 15.2 Versioning

Semantic versioning. MAJOR for breaking changes to skill or subcommand names or signatures, MINOR for new skills or subcommands, PATCH for fixes and documentation. `version` in `plugin.json` is the source of truth. Tag format `vMAJOR.MINOR.PATCH`.

### 15.3 Dual distribution

Self-marketplace - `descript-plugin/.claude-plugin/marketplace.json` lists this one plugin so a user can install it standalone without the umbrella catalog.

Outfit-catalog entry - add `descript` to the existing `outfit` marketplace at `plugins/.claude-plugin/marketplace.json`. The entry follows the established shape used by the other five entries in that catalog - `source` of type `url` pointing at `https://github.com/juliandickie/descript-plugin.git`, with `description`, `author` (name, email, url), `homepage`, `repository`, `license` MIT, `category`, and `keywords`. The catalog's existing convention uses a bare repository URL rather than a pinned tag, and this entry follows that convention for consistency with the other five entries rather than the Master Authority document's pinned-tag recommendation. The category is `creative-tools` to sit alongside `creators-studio`.

---

## 16. Risks and Mitigations

Early Access API drift - mitigated by deriving types from the bundled OpenAPI file and treating a spec refresh as a build-time check.

Unverified webhook delivery - mitigated by making local polling the default and treating `callback_url` as an optional optimization.

Unintended AI-credit spend - mitigated by the dry-run-first batch gate, `disable-model-invocation` on publish and batch skills, and mandatory cost reporting on agent edits.

Large media memory pressure - mitigated by streaming file bytes during the signed-URL `PUT` rather than buffering the whole file.

Duplicate spend on retry - mitigated by never blind-retrying non-idempotent job submissions.

Token leakage - mitigated by never echoing or committing the token and redacting it in verbose output.

---

## 17. Out of Scope (possible future work)

A standalone webhook receiver service for callback-driven completion.

Conversational multi-turn agent editing, contingent on the Descript API supporting it.

Publishing the CLI as an independent npm package separate from the plugin.
