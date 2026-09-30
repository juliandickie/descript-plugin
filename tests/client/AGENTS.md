<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# client

## Purpose

Per-module tests of the typed HTTP client layer. Asserts that each endpoint module hits the right URL, sends the right body, parses the right response shape, and surfaces errors with actionable hints.

## Key Files

| File | Description |
|------|-------------|
| `http.test.ts` | The `HttpClient` wrapper. Bearer header construction, JSON serialisation, error mapping, status-code-to-hint translation. |
| `errors.test.ts` | `DescriptApiError` construction and hint generation. |
| `jobs.test.ts` | The five job-bearing endpoint functions (`importProjectMedia`, `agentEditJob`, `publishJob`, `listJobs`, `getJob`, `cancelJob`). |
| `projects.test.ts` (covered by `rest.test.ts`) | Covered alongside other REST endpoints. |
| `rest.test.ts` | The non-job REST endpoints (`getStatus`, `listProjects`, `getProject`, `getPublishedProjectMetadata`, `postEditInDescriptSchema`). |
| `types.test.ts` | Compile-time and runtime sanity checks on type definitions. |

## For AI Agents

### Working In This Directory

- Each test wires `mockFetch` to expect a specific URL + method + headers + body, returns a canned response, then calls the client function and asserts the parsed result.

- Header assertions matter. Confirm `Authorization: Bearer <token>` is set on every request and not surfaced in error messages.

- Error tests check both the thrown `DescriptApiError` and its `hint`. 401 should suggest token rotation, 403 should suggest Drive permission, etc.

- Response unions (e.g. `PublishedProjectMetadata.privacy` allowing `"drive"` on read but not on write) require explicit test coverage on the read side.

### Common Patterns

- One test per endpoint per outcome (success, error-with-hint).

- Use real API response shapes captured from `docs/descript-openapi.json` or field reports.

## Dependencies

### Internal

- `../../src/client/`.

- `../helpers/mockFetch.ts`.

### External

- `node:test`, `node:assert/strict`.

<!-- MANUAL: -->
