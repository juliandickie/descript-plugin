<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# client

## Purpose

Typed HTTP client around the Descript API. Covers all 11 documented endpoints. Has no orchestration logic (no polling, no upload flow, no batch). One method per endpoint, called by the workflows layer.

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | Re-exports `DescriptClient` (the unified class), `HttpClient`, `DescriptApiError`, and every type. The class composes the per-endpoint functions onto a single shared `HttpClient`. |
| `http.ts` | Generic typed HTTP wrapper. Builds the `Authorization: Bearer <token>` header, runs `fetch`, parses JSON, and throws `DescriptApiError` on non-2xx. |
| `errors.ts` | `DescriptApiError` class with `status`, `body`, and `hint`. The `hint` translates common HTTP codes into actionable guidance (e.g. 403 means access-level not allowed for this Drive). |
| `jobs.ts` | `importProjectMedia`, `agentEditJob`, `publishJob`, `listJobs`, `getJob`, `cancelJob`. All five job-bearing endpoints. |
| `projects.ts` | `listProjects`, `getProject`. The `getProject` response includes the `compositions` array used by `descript export` whole-project mode. |
| `published.ts` | `getPublishedProjectMetadata(slug)`. Returns hosted-project info including download URLs. |
| `status.ts` | `getStatus()`. The probe used by `descript status`. Authenticated confirmation only, no telemetry. |
| `editInDescript.ts` | `postEditInDescriptSchema(body)`. Partner-gated import URL exchange (requires Descript onboarding). |
| `types.ts` | All request and response types, hand-derived from `docs/descript-openapi.json`. ~212 lines. |

## For AI Agents

### Working In This Directory

- One module per endpoint group (`jobs.ts`, `projects.ts`, `published.ts`, ...). Each exports plain functions that take an `HttpClient` and the request body, no class state.

- `DescriptClient` in `index.ts` is the integration point. Adding a new endpoint requires (1) a function module, (2) a wiring method on `DescriptClient`, (3) types in `types.ts`.

- All types hand-derived from `../../docs/descript-openapi.json`. Keep `types.ts` synced when the spec changes. Field reports document divergences between spec and live behaviour.

- `DescriptApiError.hint` is user-facing. New hints go in `errors.ts`. Keep them short and actionable.

- The client must never log the bearer token. `RedactToken` from `../config/credentials.ts` is the helper if you need to surface the token shape.

- Response unions matter. `PublishedProjectMetadata.privacy` includes `"drive"` even though the API no longer accepts `drive` on publish requests (older published items still report it). See `2026-05-20-v030-followup-backlog.md` for the rationale.

### Common Patterns

- Every method returns `Promise<TypedResponse>`. The HTTP layer raises on errors, callers never check status codes.

- For async jobs, the client only submits and reads. Polling lives in `../workflows/poll.ts`.

## Dependencies

### Internal

- `../../docs/descript-openapi.json` for type ground truth.

- Consumed by `../workflows/` and `../cli/commands/`.

### External

- `node:fetch` (Node 24 global).

<!-- MANUAL: -->
