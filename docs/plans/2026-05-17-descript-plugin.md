# Descript Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `descript` Claude Code plugin - a Node/TypeScript CLI with full 1:1 coverage of all 11 Descript API endpoints plus polling, upload, and batch workflows, wrapped by thin skills and an optional MCP shim.

**Architecture:** Three concentric layers. A raw typed HTTP client (one function per endpoint). A workflow layer that owns job polling, the three-step signed-URL upload, and the batch runner. A presentation layer (CLI plus an optional MCP shim that invokes the CLI entrypoint in-process). Zero runtime dependencies. TypeScript compiled to a committed `dist/`.

**Tech Stack:** Node.js 24+ (verified v24.4.1), TypeScript (devDependency only), `node:test` test runner with `globalThis.fetch` mocking, no runtime dependencies.

**Reference spec:** `docs/specs/2026-05-17-descript-plugin-design.md`

**API contract source:** `docs/descript-openapi.json`

---

## Conventions and Decisions (read before any task)

These are locked. Every task assumes them.

Module system - ESM. `package.json` has `"type": "module"`. `tsconfig.json` uses `module: "nodenext"`. All relative imports in `.ts` files use a `.js` extension (nodenext requirement), for example `import { HttpClient } from "./http.js"`.

Layout - `tsconfig.json` has `rootDir: "."`, `outDir: "dist"`, and includes both `src/**/*` and `tests/**/*`. Compilation therefore produces `dist/src/...` and `dist/tests/...`. The CLI entrypoint is `dist/src/cli/index.js`. The MCP server is `dist/src/mcp/server.js`.

Tests - live under `tests/` mirroring `src/`. The default suite never touches the live API. HTTP is mocked by replacing `globalThis.fetch` with a `node:test` mock. This is a deliberate refinement of spec Section 14 (which named undici `MockAgent`). Mocking the global `fetch` achieves the identical outcome (deterministic, no live API) with zero devDependencies beyond TypeScript. It is recorded here so it is a conscious decision, not silent drift.

MCP realization - spec Section 13 says the MCP shim "execs the CLI". The implementation invokes the CLI's `runCli` entry function in-process (capturing output through the injected stdout/stderr sinks `runCli` already accepts) rather than spawning a subprocess. This is thinner, faster, removes any command-injection surface, and avoids `node:child_process` entirely. It is the same intent (the shim is a presentation wrapper that does not duplicate API logic) realized more safely, recorded here as a conscious refinement.

Error type - a single `DescriptApiError` class lives in `src/client/errors.ts`. The spec named `http.ts` as the owner of error mapping. Splitting the error class into its own file is a small decomposition for one clear responsibility per file, consistent with the spec's design principles. `http.ts` imports and throws it.

Facade - `src/client/index.ts` exports a `DescriptClient` class that aggregates the endpoint functions for ergonomic use by the workflow and CLI layers.

devDependencies - only `typescript` and `@types/node`. No runtime dependencies, ever.

Commits - every task ends with a commit. Use the message shown. The repo already exists with one commit (the design spec) and a `.gitignore` ignoring `.DS_Store`, `node_modules/`, `*.log`.

Working directory - all paths are relative to the plugin repo root `/Users/juliandickie/code/descript-plugin`. `cd` there once at the start of each session.

---

## File Structure

Created across the tasks below.

```
descript-plugin/
├── package.json                       Task 1
├── tsconfig.json                      Task 1
├── bin/descript                       Task 12
├── src/
│   ├── client/
│   │   ├── types.ts                   Task 2
│   │   ├── errors.ts                  Task 3
│   │   ├── http.ts                    Task 4
│   │   ├── jobs.ts                    Task 5
│   │   ├── projects.ts                Task 6
│   │   ├── status.ts                  Task 6
│   │   ├── published.ts               Task 6
│   │   ├── editInDescript.ts          Task 6
│   │   └── index.ts                   Task 7
│   ├── workflows/
│   │   ├── poll.ts                    Task 8
│   │   ├── upload.ts                  Task 9
│   │   ├── importAndWait.ts           Task 10
│   │   ├── editAndWait.ts             Task 10
│   │   ├── publishAndWait.ts          Task 10
│   │   └── batch.ts                   Task 11
│   ├── config/
│   │   └── credentials.ts             Task 7
│   ├── cli/
│   │   ├── output.ts                  Task 12
│   │   ├── index.ts                   Task 12
│   │   └── commands/*.ts              Task 12
│   └── mcp/
│       └── server.ts                  Task 13
├── dist/                              built artifact, committed (Task 12 onward)
├── skills/*/SKILL.md                  Task 14
├── .mcp.json                          Task 13
├── .claude-plugin/
│   ├── plugin.json                    Task 15
│   └── marketplace.json               Task 15
├── tests/**/*.test.ts                 Tasks 3 onward
├── docs/ (specs, plans, openapi)      exists
├── CLAUDE.md CHANGELOG.md LICENSE README.md   Task 16
```

---

## Task 1 - Project scaffold and toolchain

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@juliandickie/descript-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Full programmatic access to the Descript API for Claude Code.",
  "license": "MIT",
  "bin": { "descript": "bin/descript" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "tsc -p tsconfig.json && node --test \"dist/tests/**/*.test.js\"",
    "clean": "rm -rf dist"
  },
  "engines": { "node": ">=24" },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "rootDir": ".",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "declaration": false,
    "sourceMap": false,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `tests/smoke.test.ts`**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

test("toolchain runs typescript tests", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 4: Install dev tooling**

Run: `npm install`
Expected: `node_modules/` created (gitignored), `typescript` and `@types/node` present, no runtime dependencies in `package.json`.

- [ ] **Step 5: Run the smoke test**

Run: `npm test`
Expected: `tsc` produces `dist/`, then `node --test` reports `tests 1` `pass 1` `fail 0`.

- [ ] **Step 6: Ignore the build artifact for now**

Append `dist/` to `.gitignore` (it becomes committed only from Task 12, once the CLI entrypoint exists; until then it is noise).

Run: `printf 'dist/\n' >> .gitignore`

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json tests/smoke.test.ts .gitignore
git commit -m "build: scaffold Node/TypeScript project and test runner"
```

---

## Task 2 - API types derived from the OpenAPI contract

**Files:**
- Create: `src/client/types.ts`
- Create: `tests/client/types.test.ts`

These interfaces mirror `docs/descript-openapi.json` exactly. They are the contract. A future spec refresh that changes a field becomes a TypeScript build error in a consumer of these types.

- [ ] **Step 1: Write the failing test**

`tests/client/types.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import type { JobStatus, SubmitJobResponse, ImportRequest } from "../../src/client/types.js";

test("JobStatus discriminates on job_type", () => {
  const job: JobStatus = {
    job_id: "j1",
    job_type: "agent",
    job_state: "stopped",
    created_at: "2026-01-01T00:00:00Z",
    drive_id: "d1",
    project_id: "p1",
    project_url: "https://web.descript.com/p1",
    result: { status: "success", agent_response: "done", project_changed: true, ai_credits_used: 5 }
  };
  assert.equal(job.job_type, "agent");
  if (job.job_type === "agent" && job.result && job.result.status === "success") {
    assert.equal(job.result.ai_credits_used, 5);
  }
});

test("SubmitJobResponse and ImportRequest shapes compile", () => {
  const r: SubmitJobResponse = { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" };
  const req: ImportRequest = {
    project_name: "P",
    add_media: { "demo.mp4": { url: "https://x/y.mp4" } }
  };
  assert.equal(r.job_id, "j");
  assert.ok(req.add_media["demo.mp4"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - `Cannot find module '../../src/client/types.js'`.

- [ ] **Step 3: Create `src/client/types.ts`**

```typescript
export type JobState = "queued" | "running" | "stopped" | "cancelled";
export type JobType = "import/project_media" | "agent" | "publish";

export interface ApiErrorBody {
  error: string;
  message: string;
}

export interface UrlImportItem {
  url: string;
  language?: string;
}
export interface DirectUploadItem {
  content_type: string;
  file_size: number;
  language?: string;
}
export interface MultitrackItem {
  tracks: Array<{ media: string; offset?: number }>;
}
export type ImportMediaItem = UrlImportItem | DirectUploadItem | MultitrackItem;

export interface ImportComposition {
  name?: string;
  width?: number;
  height?: number;
  fps?: number;
  clips?: Array<{ media: string }>;
}

export interface ImportRequest {
  project_id?: string;
  project_name?: string;
  team_access?: "edit" | "comment" | "view" | "none";
  folder_name?: string;
  add_media: Record<string, ImportMediaItem>;
  add_compositions?: ImportComposition[];
  callback_url?: string;
}

export interface AgentRequest {
  project_id?: string;
  project_name?: string;
  composition_id?: string;
  model?: string;
  prompt: string;
  team_access?: "edit" | "comment" | "view" | "none";
  callback_url?: string;
}

export interface PublishRequest {
  project_id: string;
  composition_id?: string;
  media_type?: "Video" | "Audio";
  resolution?: "480p" | "720p" | "1080p" | "1440p" | "4K";
  access_level?: "public" | "unlisted" | "drive" | "private";
  callback_url?: string;
}

export interface UploadUrlEntry {
  upload_url: string;
  asset_id: string;
  artifact_id: string;
}

export interface SubmitJobResponse {
  job_id: string;
  drive_id: string;
  project_id: string;
  project_url: string;
  upload_urls?: Record<string, UploadUrlEntry>;
}

export interface ImportSuccessResult {
  status: "success" | "partial";
  media_status: Record<string, { status: "success" | "failed"; duration_seconds?: number; error_message?: string }>;
  media_seconds_used: number;
  created_compositions?: Array<{ id: string; name: string }>;
}
export interface ImportErrorResult {
  status: "error";
  error_message: string;
  error_code?: string;
}
export interface AgentSuccessResult {
  status: "success";
  agent_response: string;
  project_changed: boolean;
  media_seconds_used?: number;
  ai_credits_used?: number;
}
export interface AgentErrorResult {
  status: "error";
  error_message: string;
  error_code?: string;
}
export interface PublishSuccessResult {
  status: "success";
  composition_id: string;
  share_url: string;
  download_url?: string;
  download_url_expires_at?: string;
}
export interface PublishErrorResult {
  status: "error";
  error_message: string;
}

export interface JobProgress {
  label: string;
  percent?: number;
  last_update_at?: string;
  composition_id?: string;
  share_url?: string;
}

interface JobStatusBase {
  job_id: string;
  job_state: JobState;
  created_at: string;
  stopped_at?: string;
  drive_id: string;
  project_id: string;
  project_url: string;
  progress?: JobProgress;
}
export interface ImportJobStatus extends JobStatusBase {
  job_type: "import/project_media";
  result?: ImportSuccessResult | ImportErrorResult;
}
export interface AgentJobStatus extends JobStatusBase {
  job_type: "agent";
  result?: AgentSuccessResult | AgentErrorResult;
}
export interface PublishJobStatus extends JobStatusBase {
  job_type: "publish";
  result?: PublishSuccessResult | PublishErrorResult;
}
export type JobStatus = ImportJobStatus | AgentJobStatus | PublishJobStatus;

export interface Pagination {
  next_cursor?: string;
}
export interface ListJobsResponse {
  data: JobStatus[];
  pagination: Pagination;
}
export interface ListJobsQuery {
  project_id?: string;
  type?: "import/project_media" | "agent";
  cursor?: string;
  limit?: number;
  created_after?: string;
  created_before?: string;
}
export interface ProjectSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  folder_path?: string;
}
export interface ListProjectsResponse {
  data: ProjectSummary[];
  pagination: Pagination;
}
export interface ProjectDetail {
  id: string;
  name: string;
  drive_id: string;
  created_at: string;
  updated_at: string;
  folder_path?: string;
  media_files: Record<string, { type: "audio" | "video" | "image" | "sequence" | "other"; duration?: number }>;
  compositions: Array<{ id: string; name: string; duration?: number; media_type?: string }>;
}
export interface StatusResponse {
  status: "ok";
}
export interface PublishedProjectMetadata {
  download_url?: string;
  download_url_expires_at?: string;
  project_id: string;
  publish_type: "audio" | "video" | "audiogram";
  privacy: "public" | "unlisted" | "private" | "drive" | "password";
  metadata: {
    title?: string;
    duration_seconds?: number;
    duration_formatted?: string;
    published_at?: string;
    published_by?: { first_name?: string; last_name?: string };
  };
  subtitles: string;
}
export interface EditInDescriptBody {
  partner_drive_id: string;
  project_schema: {
    schema_version: string;
    source_id?: string;
    files: Array<{ name?: string; uri: string; start_offset?: { seconds: number } }>;
  };
}
export interface EditInDescriptResponse {
  url?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS - `tests 3` (smoke plus two type tests) `pass 3`.

- [ ] **Step 5: Commit**

```bash
git add src/client/types.ts tests/client/types.test.ts
git commit -m "feat(client): add API types derived from the OpenAPI contract"
```

---

## Task 3 - Typed API error

**Files:**
- Create: `src/client/errors.ts`
- Create: `tests/client/errors.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/client/errors.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { DescriptApiError, categoryForStatus } from "../../src/client/errors.js";

test("categoryForStatus maps documented statuses", () => {
  assert.equal(categoryForStatus(401), "unauthorized");
  assert.equal(categoryForStatus(402), "payment_required");
  assert.equal(categoryForStatus(403), "forbidden");
  assert.equal(categoryForStatus(404), "not_found");
  assert.equal(categoryForStatus(422), "unprocessable");
  assert.equal(categoryForStatus(429), "rate_limited");
  assert.equal(categoryForStatus(400), "bad_request");
  assert.equal(categoryForStatus(500), "server_error");
  assert.equal(categoryForStatus(418), "http_error");
});

test("DescriptApiError carries status, category, body and hint", () => {
  const e = new DescriptApiError(401, { error: "unauthorized", message: "bad token" });
  assert.equal(e.status, 401);
  assert.equal(e.category, "unauthorized");
  assert.equal(e.body?.message, "bad token");
  assert.match(e.hint, /descript-setup|token/i);
  assert.ok(e instanceof Error);
});

test("rate limit metadata is attached", () => {
  const e = new DescriptApiError(429, { error: "rate_limit_exceeded", message: "slow down" }, {
    retryAfterSeconds: 7, rateLimitRemaining: 0, rateLimitConsumed: 100
  });
  assert.equal(e.retryAfterSeconds, 7);
  assert.equal(e.rateLimitRemaining, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - `Cannot find module '../../src/client/errors.js'`.

- [ ] **Step 3: Create `src/client/errors.ts`**

```typescript
import type { ApiErrorBody } from "./types.js";

export type ErrorCategory =
  | "bad_request"
  | "unauthorized"
  | "payment_required"
  | "forbidden"
  | "not_found"
  | "unprocessable"
  | "rate_limited"
  | "server_error"
  | "http_error";

export function categoryForStatus(status: number): ErrorCategory {
  switch (status) {
    case 400: return "bad_request";
    case 401: return "unauthorized";
    case 402: return "payment_required";
    case 403: return "forbidden";
    case 404: return "not_found";
    case 422: return "unprocessable";
    case 429: return "rate_limited";
  }
  if (status >= 500) return "server_error";
  return "http_error";
}

const HINTS: Record<ErrorCategory, string> = {
  bad_request: "The request was rejected as invalid. Check required fields against docs/descript-openapi.json.",
  unauthorized: "The API token is missing or invalid. Run the descript-setup skill or `descript config set`.",
  payment_required: "The Drive is out of AI credits or media minutes. Top up the Descript account before retrying.",
  forbidden: "The token's Drive lacks permission, or the requested publish access level is blocked by Drive settings.",
  not_found: "The job or project was not found. Verify the id and that the token is scoped to the correct Drive.",
  unprocessable: "The request was understood but could not be processed (for example an invalid publish target).",
  rate_limited: "Rate limit exceeded. The client honors Retry-After automatically; reduce request volume if persistent.",
  server_error: "Descript returned a server error. This is transient; retry idempotent reads with backoff.",
  http_error: "Unexpected HTTP error from the Descript API."
};

export interface ErrorMeta {
  retryAfterSeconds?: number;
  rateLimitRemaining?: number;
  rateLimitConsumed?: number;
}

export class DescriptApiError extends Error {
  readonly status: number;
  readonly category: ErrorCategory;
  readonly body?: ApiErrorBody;
  readonly hint: string;
  readonly retryAfterSeconds?: number;
  readonly rateLimitRemaining?: number;
  readonly rateLimitConsumed?: number;

  constructor(status: number, body?: ApiErrorBody, meta: ErrorMeta = {}) {
    const category = categoryForStatus(status);
    const summary = body?.message ?? body?.error ?? `HTTP ${status}`;
    super(`Descript API error ${status} (${category}): ${summary}`);
    this.name = "DescriptApiError";
    this.status = status;
    this.category = category;
    this.body = body;
    this.hint = HINTS[category];
    this.retryAfterSeconds = meta.retryAfterSeconds;
    this.rateLimitRemaining = meta.rateLimitRemaining;
    this.rateLimitConsumed = meta.rateLimitConsumed;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS - all error tests green.

- [ ] **Step 5: Commit**

```bash
git add src/client/errors.ts tests/client/errors.test.ts
git commit -m "feat(client): add typed DescriptApiError with status mapping and hints"
```

---

## Task 4 - HTTP core with 429 retry

**Files:**
- Create: `src/client/http.ts`
- Create: `tests/client/http.test.ts`
- Create: `tests/helpers/mockFetch.ts`

- [ ] **Step 1: Create the fetch mock helper**

`tests/helpers/mockFetch.ts`:

```typescript
import { mock } from "node:test";

export interface MockResponseSpec {
  status: number;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export function installMockFetch(sequence: MockResponseSpec[]): { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let i = 0;
  mock.method(globalThis, "fetch", async (input: any, init: any = {}) => {
    const headers: Record<string, string> = {};
    const h = new Headers(init.headers ?? {});
    h.forEach((v, k) => { headers[k] = v; });
    calls.push({
      url: String(input),
      method: init.method ?? "GET",
      headers,
      body: typeof init.body === "string" ? init.body : undefined
    });
    const spec = sequence[Math.min(i, sequence.length - 1)]!;
    i += 1;
    const respHeaders = new Headers(spec.headers ?? {});
    const bodyText = spec.json !== undefined ? JSON.stringify(spec.json) : (spec.text ?? "");
    return new Response(bodyText, { status: spec.status, headers: respHeaders });
  });
  return { calls };
}

export function restoreFetch(): void {
  mock.restoreAll();
}
```

- [ ] **Step 2: Write the failing test**

`tests/client/http.test.ts`:

```typescript
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../../src/client/http.js";
import { DescriptApiError } from "../../src/client/errors.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());

test("sends bearer auth and parses JSON", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { status: "ok" } }]);
  const http = new HttpClient({ token: "secret-token" });
  const res = await http.request<{ status: string }>("GET", "/status");
  assert.equal(res.status, "ok");
  assert.equal(calls[0]!.headers["authorization"], "Bearer secret-token");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/status");
});

test("builds query strings and request bodies", async () => {
  const { calls } = installMockFetch([{ status: 201, json: { job_id: "j" } }]);
  const http = new HttpClient({ token: "t" });
  await http.request("POST", "/jobs/agent", { query: { project_id: "p1" }, body: { prompt: "hi" } });
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/jobs/agent?project_id=p1");
  assert.equal(calls[0]!.method, "POST");
  assert.deepEqual(JSON.parse(calls[0]!.body!), { prompt: "hi" });
});

test("maps error status to DescriptApiError", async () => {
  installMockFetch([{ status: 401, json: { error: "unauthorized", message: "bad token" } }]);
  const http = new HttpClient({ token: "t" });
  await assert.rejects(
    () => http.request("GET", "/status"),
    (e: unknown) => e instanceof DescriptApiError && e.status === 401 && e.category === "unauthorized"
  );
});

test("retries 429 honoring Retry-After then succeeds", async () => {
  const { calls } = installMockFetch([
    { status: 429, json: { error: "rate_limit_exceeded", message: "slow" }, headers: { "retry-after": "0" } },
    { status: 200, json: { status: "ok" } }
  ]);
  const http = new HttpClient({ token: "t", maxRetries: 3, sleep: async () => {} });
  const res = await http.request<{ status: string }>("GET", "/status");
  assert.equal(res.status, "ok");
  assert.equal(calls.length, 2);
});

test("gives up after maxRetries on persistent 429", async () => {
  installMockFetch([{ status: 429, json: { error: "rate_limit_exceeded", message: "slow" }, headers: { "retry-after": "0" } }]);
  const http = new HttpClient({ token: "t", maxRetries: 2, sleep: async () => {} });
  await assert.rejects(
    () => http.request("GET", "/status"),
    (e: unknown) => e instanceof DescriptApiError && e.status === 429 && e.retryAfterSeconds === 0
  );
});

test("returns undefined for 204 No Content", async () => {
  installMockFetch([{ status: 204, text: "" }]);
  const http = new HttpClient({ token: "t" });
  const res = await http.request<undefined>("DELETE", "/jobs/j1");
  assert.equal(res, undefined);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - `Cannot find module '../../src/client/http.js'`.

- [ ] **Step 4: Create `src/client/http.ts`**

```typescript
import { DescriptApiError } from "./errors.js";
import type { ApiErrorBody } from "./types.js";

export interface HttpClientOptions {
  token: string;
  baseUrl?: string;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

const DEFAULT_BASE = "https://descriptapi.com/v1";
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HttpClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: HttpClientOptions) {
    this.token = opts.token;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.maxRetries = opts.maxRetries ?? 4;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
      accept: "application/json",
      ...(opts.headers ?? {})
    };
    let init: RequestInit = { method, headers };
    if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      init = { ...init, body: JSON.stringify(opts.body) };
    }

    let attempt = 0;
    for (;;) {
      const resp = await fetch(url.toString(), init);
      if (resp.status === 429 && attempt < this.maxRetries) {
        const wait = retryAfterMs(resp);
        attempt += 1;
        await this.sleep(wait);
        continue;
      }
      if (resp.status === 204) return undefined as T;
      if (resp.ok) {
        const text = await resp.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }
      throw await toApiError(resp);
    }
  }
}

function retryAfterMs(resp: Response): number {
  const h = resp.headers.get("retry-after");
  const secs = h !== null ? Number(h) : NaN;
  return Number.isFinite(secs) ? secs * 1000 : 1000;
}

async function toApiError(resp: Response): Promise<DescriptApiError> {
  let body: ApiErrorBody | undefined;
  try {
    const text = await resp.text();
    body = text ? (JSON.parse(text) as ApiErrorBody) : undefined;
  } catch {
    body = undefined;
  }
  const retryAfter = resp.headers.get("retry-after");
  const remaining = resp.headers.get("x-ratelimit-remaining");
  const consumed = resp.headers.get("x-ratelimit-consumed");
  return new DescriptApiError(resp.status, body, {
    retryAfterSeconds: retryAfter !== null ? Number(retryAfter) : undefined,
    rateLimitRemaining: remaining !== null ? Number(remaining) : undefined,
    rateLimitConsumed: consumed !== null ? Number(consumed) : undefined
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS - all six http tests green.

- [ ] **Step 6: Commit**

```bash
git add src/client/http.ts tests/client/http.test.ts tests/helpers/mockFetch.ts
git commit -m "feat(client): add HTTP core with auth, error mapping and 429 retry"
```

---

## Task 5 - Job endpoint functions

**Files:**
- Create: `src/client/jobs.ts`
- Create: `tests/client/jobs.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/client/jobs.test.ts`:

```typescript
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../../src/client/http.js";
import {
  importProjectMedia, agentEditJob, publishJob, listJobs, getJob, cancelJob
} from "../../src/client/jobs.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());

const http = () => new HttpClient({ token: "t" });

test("importProjectMedia POSTs to /jobs/import/project_media", async () => {
  const { calls } = installMockFetch([{ status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } }]);
  const res = await importProjectMedia(http(), { project_name: "P", add_media: { "a.mp4": { url: "https://x/a.mp4" } } });
  assert.equal(res.job_id, "j");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/jobs/import/project_media");
  assert.equal(calls[0]!.method, "POST");
});

test("agentEditJob POSTs the prompt", async () => {
  const { calls } = installMockFetch([{ status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } }]);
  await agentEditJob(http(), { project_id: "p", prompt: "add captions" });
  assert.deepEqual(JSON.parse(calls[0]!.body!), { project_id: "p", prompt: "add captions" });
});

test("publishJob POSTs to /jobs/publish", async () => {
  const { calls } = installMockFetch([{ status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } }]);
  await publishJob(http(), { project_id: "p", media_type: "Video", resolution: "1080p" });
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/jobs/publish");
});

test("listJobs passes query params", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: {} } }]);
  await listJobs(http(), { project_id: "p1", limit: 50 });
  assert.ok(calls[0]!.url.includes("project_id=p1"));
  assert.ok(calls[0]!.url.includes("limit=50"));
});

test("getJob GETs /jobs/{id}", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { job_id: "j1", job_type: "agent", job_state: "stopped", created_at: "x", drive_id: "d", project_id: "p", project_url: "u" } }]);
  const job = await getJob(http(), "j1");
  assert.equal(job.job_id, "j1");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/jobs/j1");
});

test("cancelJob DELETEs and resolves on 204", async () => {
  const { calls } = installMockFetch([{ status: 204, text: "" }]);
  await cancelJob(http(), "j1");
  assert.equal(calls[0]!.method, "DELETE");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/jobs/j1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - `Cannot find module '../../src/client/jobs.js'`.

- [ ] **Step 3: Create `src/client/jobs.ts`**

```typescript
import type { HttpClient } from "./http.js";
import type {
  ImportRequest, AgentRequest, PublishRequest,
  SubmitJobResponse, JobStatus, ListJobsResponse, ListJobsQuery
} from "./types.js";

export function importProjectMedia(http: HttpClient, req: ImportRequest): Promise<SubmitJobResponse> {
  return http.request<SubmitJobResponse>("POST", "/jobs/import/project_media", { body: req });
}

export function agentEditJob(http: HttpClient, req: AgentRequest): Promise<SubmitJobResponse> {
  return http.request<SubmitJobResponse>("POST", "/jobs/agent", { body: req });
}

export function publishJob(http: HttpClient, req: PublishRequest): Promise<SubmitJobResponse> {
  return http.request<SubmitJobResponse>("POST", "/jobs/publish", { body: req });
}

export function listJobs(http: HttpClient, query: ListJobsQuery = {}): Promise<ListJobsResponse> {
  return http.request<ListJobsResponse>("GET", "/jobs", {
    query: {
      project_id: query.project_id,
      type: query.type,
      cursor: query.cursor,
      limit: query.limit,
      created_after: query.created_after,
      created_before: query.created_before
    }
  });
}

export function getJob(http: HttpClient, jobId: string): Promise<JobStatus> {
  return http.request<JobStatus>("GET", `/jobs/${encodeURIComponent(jobId)}`);
}

export function cancelJob(http: HttpClient, jobId: string): Promise<void> {
  return http.request<void>("DELETE", `/jobs/${encodeURIComponent(jobId)}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS - all six job tests green.

- [ ] **Step 5: Commit**

```bash
git add src/client/jobs.ts tests/client/jobs.test.ts
git commit -m "feat(client): add job endpoint functions (import, agent, publish, list, get, cancel)"
```

---

## Task 6 - Remaining endpoint functions

**Files:**
- Create: `src/client/projects.ts`
- Create: `src/client/status.ts`
- Create: `src/client/published.ts`
- Create: `src/client/editInDescript.ts`
- Create: `tests/client/rest.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/client/rest.test.ts`:

```typescript
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../../src/client/http.js";
import { listProjects, getProject } from "../../src/client/projects.js";
import { getStatus } from "../../src/client/status.js";
import { getPublishedProjectMetadata } from "../../src/client/published.js";
import { postEditInDescriptSchema } from "../../src/client/editInDescript.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());
const http = () => new HttpClient({ token: "t" });

test("listProjects GETs /projects with paging", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { data: [], pagination: { next_cursor: "c2" } } }]);
  const res = await listProjects(http(), { cursor: "c1", limit: 10 });
  assert.equal(res.pagination.next_cursor, "c2");
  assert.ok(calls[0]!.url.includes("cursor=c1"));
});

test("getProject GETs /projects/{id}", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { id: "p1", name: "X", drive_id: "d", created_at: "a", updated_at: "b", media_files: {}, compositions: [] } }]);
  const p = await getProject(http(), "p1");
  assert.equal(p.id, "p1");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/projects/p1");
});

test("getStatus GETs /status", async () => {
  installMockFetch([{ status: 200, json: { status: "ok" } }]);
  assert.deepEqual(await getStatus(http()), { status: "ok" });
});

test("getPublishedProjectMetadata GETs /published_projects/{slug}", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { project_id: "p", publish_type: "video", privacy: "unlisted", metadata: {}, subtitles: "WEBVTT" } }]);
  const m = await getPublishedProjectMetadata(http(), "my slug");
  assert.equal(m.publish_type, "video");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/published_projects/my%20slug");
});

test("postEditInDescriptSchema POSTs the schema", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { url: "https://web.descript.com/import?nonce=x" } }]);
  const r = await postEditInDescriptSchema(http(), { partner_drive_id: "d", project_schema: { schema_version: "1.0.0", files: [{ uri: "https://x/a.wav" }] } });
  assert.match(r.url ?? "", /nonce=x/);
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/edit_in_descript/schema");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - missing modules `projects.js`, `status.js`, `published.js`, `editInDescript.js`.

- [ ] **Step 3: Create the four modules**

`src/client/projects.ts`:

```typescript
import type { HttpClient } from "./http.js";
import type { ListProjectsResponse, ProjectDetail } from "./types.js";

export function listProjects(
  http: HttpClient,
  query: { cursor?: string; limit?: number } = {}
): Promise<ListProjectsResponse> {
  return http.request<ListProjectsResponse>("GET", "/projects", {
    query: { cursor: query.cursor, limit: query.limit }
  });
}

export function getProject(http: HttpClient, projectId: string): Promise<ProjectDetail> {
  return http.request<ProjectDetail>("GET", `/projects/${encodeURIComponent(projectId)}`);
}
```

`src/client/status.ts`:

```typescript
import type { HttpClient } from "./http.js";
import type { StatusResponse } from "./types.js";

export function getStatus(http: HttpClient): Promise<StatusResponse> {
  return http.request<StatusResponse>("GET", "/status");
}
```

`src/client/published.ts`:

```typescript
import type { HttpClient } from "./http.js";
import type { PublishedProjectMetadata } from "./types.js";

export function getPublishedProjectMetadata(
  http: HttpClient,
  slug: string
): Promise<PublishedProjectMetadata> {
  return http.request<PublishedProjectMetadata>(
    "GET",
    `/published_projects/${encodeURIComponent(slug)}`
  );
}
```

`src/client/editInDescript.ts`:

```typescript
import type { HttpClient } from "./http.js";
import type { EditInDescriptBody, EditInDescriptResponse } from "./types.js";

// Partner-gated. Requires separate Descript partner onboarding.
// Without partner access this returns an authorization error.
export function postEditInDescriptSchema(
  http: HttpClient,
  body: EditInDescriptBody
): Promise<EditInDescriptResponse> {
  return http.request<EditInDescriptResponse>("POST", "/edit_in_descript/schema", { body });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS - all five REST tests green.

- [ ] **Step 5: Commit**

```bash
git add src/client/projects.ts src/client/status.ts src/client/published.ts src/client/editInDescript.ts tests/client/rest.test.ts
git commit -m "feat(client): add projects, status, published, edit-in-descript endpoints"
```

---

## Task 7 - Credentials resolution and the client facade

**Files:**
- Create: `src/config/credentials.ts`
- Create: `src/client/index.ts`
- Create: `tests/config/credentials.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/config/credentials.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCredentials } from "../../src/config/credentials.js";
import { DescriptClient } from "../../src/client/index.js";

function tmpConfig(contents: object): string {
  const dir = mkdtempSync(join(tmpdir(), "descript-cfg-"));
  const path = join(dir, "credentials.json");
  writeFileSync(path, JSON.stringify(contents));
  return path;
}

test("flag token wins over everything", () => {
  const c = resolveCredentials({ flagToken: "FLAG", env: { DESCRIPT_API_TOKEN: "ENV" }, configPath: "/nope" });
  assert.equal(c.token, "FLAG");
  assert.equal(c.source, "flag");
});

test("env var wins over config file", () => {
  const path = tmpConfig({ profiles: { default: { api_token: "FILE" } } });
  const c = resolveCredentials({ env: { DESCRIPT_API_TOKEN: "ENV" }, configPath: path });
  assert.equal(c.token, "ENV");
  rmSync(path, { force: true });
});

test("config file profile is used and profile selectable", () => {
  const path = tmpConfig({ default_profile: "idd", profiles: { idd: { api_token: "IDD" }, promo: { api_token: "PROMO" } } });
  assert.equal(resolveCredentials({ env: {}, configPath: path }).token, "IDD");
  assert.equal(resolveCredentials({ env: {}, configPath: path, profile: "promo" }).token, "PROMO");
  assert.equal(resolveCredentials({ env: { DESCRIPT_PROFILE: "promo" }, configPath: path }).token, "PROMO");
  rmSync(path, { force: true });
});

test("plugin userConfig env var is the final fallback", () => {
  const c = resolveCredentials({ env: { CLAUDE_PLUGIN_OPTION_API_TOKEN: "PLUGIN" }, configPath: "/nope" });
  assert.equal(c.token, "PLUGIN");
  assert.equal(c.source, "plugin");
});

test("throws a clear error when no token resolves", () => {
  assert.throws(() => resolveCredentials({ env: {}, configPath: "/nope" }), /No Descript API token/);
});

test("DescriptClient exposes every endpoint group", () => {
  const c = new DescriptClient({ token: "t" });
  for (const m of ["importProjectMedia", "agentEditJob", "publishJob", "listJobs", "getJob", "cancelJob", "listProjects", "getProject", "getStatus", "getPublishedProjectMetadata", "postEditInDescriptSchema"]) {
    assert.equal(typeof (c as unknown as Record<string, unknown>)[m], "function", `missing ${m}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - `Cannot find module '../../src/config/credentials.js'`.

- [ ] **Step 3: Create `src/config/credentials.ts`**

```typescript
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ResolveOptions {
  flagToken?: string;
  profile?: string;
  env?: Record<string, string | undefined>;
  configPath?: string;
}
export interface ResolvedCredentials {
  token: string;
  profile: string;
  source: "flag" | "env" | "file" | "plugin";
}

interface ConfigFile {
  default_profile?: string;
  profiles?: Record<string, { api_token: string }>;
}

export function defaultConfigPath(): string {
  return join(homedir(), ".config", "descript", "credentials.json");
}

function readConfig(path: string): ConfigFile | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ConfigFile;
  } catch {
    return undefined;
  }
}

export function resolveCredentials(opts: ResolveOptions = {}): ResolvedCredentials {
  const env = opts.env ?? process.env;
  const profile = opts.profile ?? env.DESCRIPT_PROFILE ?? undefined;

  if (opts.flagToken) {
    return { token: opts.flagToken, profile: profile ?? "default", source: "flag" };
  }
  if (env.DESCRIPT_API_TOKEN) {
    return { token: env.DESCRIPT_API_TOKEN, profile: profile ?? "default", source: "env" };
  }

  const path = opts.configPath ?? defaultConfigPath();
  const cfg = readConfig(path);
  if (cfg?.profiles) {
    const name = profile ?? cfg.default_profile ?? "default";
    const entry = cfg.profiles[name];
    if (entry?.api_token) return { token: entry.api_token, profile: name, source: "file" };
  }

  if (env.CLAUDE_PLUGIN_OPTION_API_TOKEN) {
    return { token: env.CLAUDE_PLUGIN_OPTION_API_TOKEN, profile: profile ?? "default", source: "plugin" };
  }

  throw new Error(
    "No Descript API token found. Provide --token, set DESCRIPT_API_TOKEN, " +
      "run `descript config set`, or configure the plugin api_token."
  );
}

export function redactToken(token: string): string {
  if (token.length <= 6) return "***";
  return `${token.slice(0, 3)}***${token.slice(-2)}`;
}
```

- [ ] **Step 4: Create `src/client/index.ts`**

```typescript
import { HttpClient, type HttpClientOptions } from "./http.js";
import * as jobs from "./jobs.js";
import * as projects from "./projects.js";
import { getStatus } from "./status.js";
import { getPublishedProjectMetadata } from "./published.js";
import { postEditInDescriptSchema } from "./editInDescript.js";
import type {
  ImportRequest, AgentRequest, PublishRequest, ListJobsQuery, EditInDescriptBody
} from "./types.js";

export class DescriptClient {
  readonly http: HttpClient;
  constructor(opts: HttpClientOptions) {
    this.http = new HttpClient(opts);
  }
  importProjectMedia(req: ImportRequest) { return jobs.importProjectMedia(this.http, req); }
  agentEditJob(req: AgentRequest) { return jobs.agentEditJob(this.http, req); }
  publishJob(req: PublishRequest) { return jobs.publishJob(this.http, req); }
  listJobs(query?: ListJobsQuery) { return jobs.listJobs(this.http, query); }
  getJob(jobId: string) { return jobs.getJob(this.http, jobId); }
  cancelJob(jobId: string) { return jobs.cancelJob(this.http, jobId); }
  listProjects(query?: { cursor?: string; limit?: number }) { return projects.listProjects(this.http, query); }
  getProject(projectId: string) { return projects.getProject(this.http, projectId); }
  getStatus() { return getStatus(this.http); }
  getPublishedProjectMetadata(slug: string) { return getPublishedProjectMetadata(this.http, slug); }
  postEditInDescriptSchema(body: EditInDescriptBody) { return postEditInDescriptSchema(this.http, body); }
}

export { HttpClient } from "./http.js";
export { DescriptApiError } from "./errors.js";
export * from "./types.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS - credentials and facade tests green.

- [ ] **Step 6: Commit**

```bash
git add src/config/credentials.ts src/client/index.ts tests/config/credentials.test.ts
git commit -m "feat: add credential resolution with profiles and the DescriptClient facade"
```

---

## Task 8 - Job polling workflow

**Files:**
- Create: `src/workflows/poll.ts`
- Create: `tests/workflows/poll.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/workflows/poll.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { pollJob } from "../../src/workflows/poll.js";
import type { JobStatus } from "../../src/client/types.js";

function fakeGetJob(states: JobStatus[]): () => Promise<JobStatus> {
  let i = 0;
  return async () => states[Math.min(i++, states.length - 1)]!;
}
const base = { job_id: "j", drive_id: "d", project_id: "p", project_url: "u", created_at: "t" } as const;

test("polls until job_state is stopped and returns the final status", async () => {
  const get = fakeGetJob([
    { ...base, job_type: "agent", job_state: "queued" },
    { ...base, job_type: "agent", job_state: "running" },
    { ...base, job_type: "agent", job_state: "stopped", result: { status: "success", agent_response: "ok", project_changed: true } }
  ]);
  const final = await pollJob(get, "j", { intervalMs: 1, sleep: async () => {} });
  assert.equal(final.job_state, "stopped");
});

test("rejects when the job is cancelled", async () => {
  const get = fakeGetJob([{ ...base, job_type: "agent", job_state: "cancelled" }]);
  await assert.rejects(() => pollJob(get, "j", { intervalMs: 1, sleep: async () => {} }), /cancelled/);
});

test("rejects on timeout", async () => {
  const get = fakeGetJob([{ ...base, job_type: "agent", job_state: "running" }]);
  await assert.rejects(
    () => pollJob(get, "j", { intervalMs: 5, maxWaitMs: 12, sleep: async () => {}, now: makeClock() }),
    /timed out/
  );
});

function makeClock(): () => number {
  let t = 0;
  return () => (t += 10);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - `Cannot find module '../../src/workflows/poll.js'`.

- [ ] **Step 3: Create `src/workflows/poll.ts`**

```typescript
import type { JobStatus } from "../client/types.js";

export interface PollOptions {
  intervalMs?: number;
  maxWaitMs?: number;
  backoffFactor?: number;
  maxIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onPoll?: (status: JobStatus) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function pollJob(
  getJob: (jobId: string) => Promise<JobStatus>,
  jobId: string,
  opts: PollOptions = {}
): Promise<JobStatus> {
  const interval0 = opts.intervalMs ?? 3000;
  const maxWait = opts.maxWaitMs ?? 30 * 60 * 1000;
  const factor = opts.backoffFactor ?? 1.5;
  const maxInterval = opts.maxIntervalMs ?? 15000;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;

  const start = now();
  let interval = interval0;

  for (;;) {
    const status = await getJob(jobId);
    opts.onPoll?.(status);
    if (status.job_state === "stopped") return status;
    if (status.job_state === "cancelled") {
      throw new Error(`Job ${jobId} was cancelled`);
    }
    if (now() - start >= maxWait) {
      throw new Error(`Polling timed out after ${maxWait}ms for job ${jobId} (last state: ${status.job_state})`);
    }
    await sleep(interval);
    interval = Math.min(Math.round(interval * factor), maxInterval);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS - three poll tests green.

- [ ] **Step 5: Commit**

```bash
git add src/workflows/poll.ts tests/workflows/poll.test.ts
git commit -m "feat(workflows): add job polling with backoff and timeout"
```

---

## Task 9 - Three-step direct upload workflow

**Files:**
- Create: `src/workflows/upload.ts`
- Create: `tests/workflows/upload.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/workflows/upload.test.ts`:

```typescript
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DescriptClient } from "../../src/client/index.js";
import { directUpload } from "../../src/workflows/upload.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());

function tmpFile(bytes: number): string {
  const dir = mkdtempSync(join(tmpdir(), "descript-up-"));
  const path = join(dir, "clip.mp4");
  writeFileSync(path, Buffer.alloc(bytes, 1));
  return path;
}

test("requests signed URL, PUTs the bytes, returns submit response", async () => {
  const path = tmpFile(2048);
  const { calls } = installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u",
      upload_urls: { "clip.mp4": { upload_url: "https://gcs/signed", asset_id: "a", artifact_id: "b" } } } },
    { status: 200, text: "" }
  ]);
  const client = new DescriptClient({ token: "t" });
  const res = await directUpload(client, {
    mediaRef: "clip.mp4",
    filePath: path,
    contentType: "video/mp4",
    request: { project_name: "P", add_media: {} }
  });
  assert.equal(res.job_id, "j");
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/jobs/import/project_media");
  assert.equal(calls[1]!.method, "PUT");
  assert.equal(calls[1]!.url, "https://gcs/signed");
  assert.equal(calls[1]!.headers["content-type"], "application/octet-stream");
  rmSync(path, { force: true });
});

test("throws when the API returns no upload_urls for the media ref", async () => {
  const path = tmpFile(16);
  installMockFetch([{ status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } }]);
  const client = new DescriptClient({ token: "t" });
  await assert.rejects(
    () => directUpload(client, { mediaRef: "clip.mp4", filePath: path, contentType: "video/mp4", request: { project_name: "P", add_media: {} } }),
    /no signed upload URL/i
  );
  rmSync(path, { force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - `Cannot find module '../../src/workflows/upload.js'`.

- [ ] **Step 3: Create `src/workflows/upload.ts`**

```typescript
import { statSync, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { DescriptClient } from "../client/index.js";
import type { ImportRequest, SubmitJobResponse } from "../client/types.js";

export interface DirectUploadParams {
  mediaRef: string;
  filePath: string;
  contentType: string;
  language?: string;
  request: ImportRequest;
}

export async function directUpload(
  client: DescriptClient,
  params: DirectUploadParams
): Promise<SubmitJobResponse> {
  const size = statSync(params.filePath).size;

  const request: ImportRequest = {
    ...params.request,
    add_media: {
      ...params.request.add_media,
      [params.mediaRef]: {
        content_type: params.contentType,
        file_size: size,
        ...(params.language ? { language: params.language } : {})
      }
    }
  };

  const submit = await client.importProjectMedia(request);
  const entry = submit.upload_urls?.[params.mediaRef];
  if (!entry) {
    throw new Error(
      `Import job created but the API returned no signed upload URL for "${params.mediaRef}".`
    );
  }

  const stream = createReadStream(params.filePath);
  const resp = await fetch(entry.upload_url, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream", "content-length": String(size) },
    body: Readable.toWeb(stream) as ReadableStream,
    duplex: "half"
  } as RequestInit & { duplex: "half" });

  if (!resp.ok) {
    throw new Error(`Signed upload PUT failed with HTTP ${resp.status} for "${params.mediaRef}".`);
  }
  return submit;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS - two upload tests green.

- [ ] **Step 5: Commit**

```bash
git add src/workflows/upload.ts tests/workflows/upload.test.ts
git commit -m "feat(workflows): add three-step signed-URL direct upload"
```

---

## Task 10 - submit-and-wait workflows

**Files:**
- Create: `src/workflows/importAndWait.ts`
- Create: `src/workflows/editAndWait.ts`
- Create: `src/workflows/publishAndWait.ts`
- Create: `tests/workflows/andWait.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/workflows/andWait.test.ts`:

```typescript
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DescriptClient } from "../../src/client/index.js";
import { importAndWait } from "../../src/workflows/importAndWait.js";
import { editAndWait } from "../../src/workflows/editAndWait.js";
import { publishAndWait } from "../../src/workflows/publishAndWait.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());
const noSleep = async () => {};

test("editAndWait submits, polls, and normalizes the agent outcome", async () => {
  installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "agent", job_state: "running", created_at: "t", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "agent", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", agent_response: "Added captions", project_changed: true, ai_credits_used: 32, media_seconds_used: 10 } } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const out = await editAndWait(client, { project_id: "p", prompt: "add captions" }, { intervalMs: 1, sleep: noSleep });
  assert.equal(out.ok, true);
  assert.equal(out.projectUrl, "u");
  assert.equal(out.agentResponse, "Added captions");
  assert.equal(out.aiCreditsUsed, 32);
});

test("editAndWait surfaces a failed job result as ok:false", async () => {
  installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "agent", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "error", error_message: "agent failed", error_code: "agent_execution_failed" } } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const out = await editAndWait(client, { project_id: "p", prompt: "x" }, { intervalMs: 1, sleep: noSleep });
  assert.equal(out.ok, false);
  assert.match(out.error ?? "", /agent failed/);
});

test("importAndWait normalizes media status and compositions", async () => {
  installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "import/project_media", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", media_status: { "a.mp4": { status: "success", duration_seconds: 5 } }, media_seconds_used: 5, created_compositions: [{ id: "c1", name: "Cut" }] } } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const out = await importAndWait(client, { project_name: "P", add_media: { "a.mp4": { url: "https://x/a.mp4" } } }, { intervalMs: 1, sleep: noSleep });
  assert.equal(out.ok, true);
  assert.equal(out.createdCompositions[0]!.name, "Cut");
});

test("publishAndWait returns the share url", async () => {
  installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "publish", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", composition_id: "c1", share_url: "https://share.descript.com/view/x" } } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const out = await publishAndWait(client, { project_id: "p" }, { intervalMs: 1, sleep: noSleep });
  assert.equal(out.ok, true);
  assert.equal(out.shareUrl, "https://share.descript.com/view/x");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - missing the three workflow modules.

- [ ] **Step 3: Create `src/workflows/importAndWait.ts`**

```typescript
import type { DescriptClient } from "../client/index.js";
import type { ImportRequest, ImportJobStatus } from "../client/types.js";
import { pollJob, type PollOptions } from "./poll.js";

export interface ImportOutcome {
  ok: boolean;
  jobId: string;
  projectId: string;
  projectUrl: string;
  status: "success" | "partial" | "error";
  mediaSecondsUsed?: number;
  createdCompositions: Array<{ id: string; name: string }>;
  failedMedia: Array<{ ref: string; error: string }>;
  error?: string;
}

export async function importAndWait(
  client: DescriptClient,
  req: ImportRequest,
  poll: PollOptions = {}
): Promise<ImportOutcome> {
  const submit = await client.importProjectMedia(req);
  const final = (await pollJob((id) => client.getJob(id), submit.job_id, poll)) as ImportJobStatus;
  const result = final.result;
  const base = { jobId: submit.job_id, projectId: submit.project_id, projectUrl: submit.project_url };

  if (!result || result.status === "error") {
    return {
      ...base, ok: false, status: "error",
      createdCompositions: [], failedMedia: [],
      error: result?.status === "error" ? result.error_message : "Job stopped without a result"
    };
  }
  const failedMedia = Object.entries(result.media_status)
    .filter(([, v]) => v.status === "failed")
    .map(([ref, v]) => ({ ref, error: v.error_message ?? "unknown" }));
  return {
    ...base,
    ok: result.status === "success" && failedMedia.length === 0,
    status: result.status,
    mediaSecondsUsed: result.media_seconds_used,
    createdCompositions: result.created_compositions ?? [],
    failedMedia
  };
}
```

- [ ] **Step 4: Create `src/workflows/editAndWait.ts`**

```typescript
import type { DescriptClient } from "../client/index.js";
import type { AgentRequest, AgentJobStatus } from "../client/types.js";
import { pollJob, type PollOptions } from "./poll.js";

export interface EditOutcome {
  ok: boolean;
  jobId: string;
  projectId: string;
  projectUrl: string;
  agentResponse?: string;
  projectChanged?: boolean;
  aiCreditsUsed?: number;
  mediaSecondsUsed?: number;
  error?: string;
}

export async function editAndWait(
  client: DescriptClient,
  req: AgentRequest,
  poll: PollOptions = {}
): Promise<EditOutcome> {
  const submit = await client.agentEditJob(req);
  const final = (await pollJob((id) => client.getJob(id), submit.job_id, poll)) as AgentJobStatus;
  const result = final.result;
  const base = { jobId: submit.job_id, projectId: submit.project_id, projectUrl: submit.project_url };

  if (!result || result.status === "error") {
    return { ...base, ok: false, error: result?.status === "error" ? result.error_message : "Job stopped without a result" };
  }
  return {
    ...base, ok: true,
    agentResponse: result.agent_response,
    projectChanged: result.project_changed,
    aiCreditsUsed: result.ai_credits_used,
    mediaSecondsUsed: result.media_seconds_used
  };
}
```

- [ ] **Step 5: Create `src/workflows/publishAndWait.ts`**

```typescript
import type { DescriptClient } from "../client/index.js";
import type { PublishRequest, PublishJobStatus } from "../client/types.js";
import { pollJob, type PollOptions } from "./poll.js";

export interface PublishOutcome {
  ok: boolean;
  jobId: string;
  projectId: string;
  projectUrl: string;
  shareUrl?: string;
  downloadUrl?: string;
  error?: string;
}

export async function publishAndWait(
  client: DescriptClient,
  req: PublishRequest,
  poll: PollOptions = {}
): Promise<PublishOutcome> {
  const submit = await client.publishJob(req);
  const final = (await pollJob((id) => client.getJob(id), submit.job_id, poll)) as PublishJobStatus;
  const result = final.result;
  const base = { jobId: submit.job_id, projectId: submit.project_id, projectUrl: submit.project_url };

  if (!result || result.status === "error") {
    return { ...base, ok: false, error: result?.status === "error" ? result.error_message : "Job stopped without a result" };
  }
  return { ...base, ok: true, shareUrl: result.share_url, downloadUrl: result.download_url };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS - four and-wait tests green.

- [ ] **Step 7: Commit**

```bash
git add src/workflows/importAndWait.ts src/workflows/editAndWait.ts src/workflows/publishAndWait.ts tests/workflows/andWait.test.ts
git commit -m "feat(workflows): add submit-and-wait for import, edit, publish"
```

---

## Task 11 - Batch runner with dry-run gate

**Files:**
- Create: `src/workflows/batch.ts`
- Create: `tests/workflows/batch.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/workflows/batch.test.ts`:

```typescript
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DescriptClient } from "../../src/client/index.js";
import { parseManifest, planBatch, runBatch } from "../../src/workflows/batch.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());

const manifest = {
  concurrency: 1,
  items: [
    { name: "vid1", source: { url: "https://x/a.mp4" }, project_name: "Vid 1", agent_prompt: "add captions",
      publish: { media_type: "Video", resolution: "1080p" } }
  ]
};

test("parseManifest validates required fields", () => {
  assert.throws(() => parseManifest({ items: [{}] }), /source/);
  const m = parseManifest(manifest);
  assert.equal(m.items.length, 1);
});

test("planBatch returns a non-executing plan", () => {
  const plan = planBatch(parseManifest(manifest));
  assert.equal(plan.itemCount, 1);
  assert.equal(plan.willImport, 1);
  assert.equal(plan.willEdit, 1);
  assert.equal(plan.willPublish, 1);
  assert.match(plan.summary, /1 item/);
});

test("runBatch refuses without confirm", async () => {
  const client = new DescriptClient({ token: "t" });
  await assert.rejects(
    () => runBatch(client, parseManifest(manifest), { confirm: false }),
    /requires explicit confirmation/
  );
});

test("runBatch executes import then edit then publish per item", async () => {
  installMockFetch([
    { status: 201, json: { job_id: "ij", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "ij", job_type: "import/project_media", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", media_status: {}, media_seconds_used: 1, created_compositions: [{ id: "c", name: "Cut" }] } } },
    { status: 201, json: { job_id: "aj", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "aj", job_type: "agent", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", agent_response: "done", project_changed: true } } },
    { status: 201, json: { job_id: "pj", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "pj", job_type: "publish", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", composition_id: "c", share_url: "https://share/x" } } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const report = await runBatch(client, parseManifest(manifest), { confirm: true, poll: { intervalMs: 1, sleep: async () => {} } });
  assert.equal(report.items[0]!.status, "success");
  assert.equal(report.items[0]!.shareUrl, "https://share/x");
  assert.equal(report.succeeded, 1);
  assert.equal(report.failed, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - `Cannot find module '../../src/workflows/batch.js'`.

- [ ] **Step 3: Create `src/workflows/batch.ts`**

```typescript
import type { DescriptClient } from "../client/index.js";
import type { ImportRequest } from "../client/types.js";
import { importAndWait } from "./importAndWait.js";
import { editAndWait } from "./editAndWait.js";
import { publishAndWait } from "./publishAndWait.js";
import type { PollOptions } from "./poll.js";

export interface BatchItem {
  name: string;
  source: { url: string } | { file: string; content_type: string };
  project_id?: string;
  project_name?: string;
  agent_prompt?: string;
  publish?: { media_type?: "Video" | "Audio"; resolution?: "480p" | "720p" | "1080p" | "1440p" | "4K"; access_level?: "public" | "unlisted" | "drive" | "private" };
}
export interface BatchManifest {
  concurrency: number;
  callback_url?: string;
  items: BatchItem[];
}

export function parseManifest(raw: unknown): BatchManifest {
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.items) || obj.items.length === 0) {
    throw new Error("Batch manifest must have a non-empty `items` array.");
  }
  const items: BatchItem[] = obj.items.map((it, idx) => {
    const i = it as Record<string, unknown>;
    if (!i.source || typeof i.source !== "object") {
      throw new Error(`Manifest item ${idx} is missing a \`source\` (url or file).`);
    }
    const s = i.source as Record<string, unknown>;
    const hasUrl = typeof s.url === "string";
    const hasFile = typeof s.file === "string" && typeof s.content_type === "string";
    if (!hasUrl && !hasFile) {
      throw new Error(`Manifest item ${idx} \`source\` must be {url} or {file, content_type}.`);
    }
    return {
      name: typeof i.name === "string" ? i.name : `item-${idx}`,
      source: i.source as BatchItem["source"],
      project_id: typeof i.project_id === "string" ? i.project_id : undefined,
      project_name: typeof i.project_name === "string" ? i.project_name : undefined,
      agent_prompt: typeof i.agent_prompt === "string" ? i.agent_prompt : undefined,
      publish: i.publish as BatchItem["publish"] | undefined
    };
  });
  const concurrency = typeof obj.concurrency === "number" && obj.concurrency > 0 ? obj.concurrency : 2;
  return {
    concurrency,
    callback_url: typeof obj.callback_url === "string" ? obj.callback_url : undefined,
    items
  };
}

export interface BatchPlan {
  itemCount: number;
  willImport: number;
  willEdit: number;
  willPublish: number;
  lines: string[];
  summary: string;
}

export function planBatch(m: BatchManifest): BatchPlan {
  const lines = m.items.map((it) => {
    const parts = [`import(${"url" in it.source ? it.source.url : it.source.file})`];
    if (it.agent_prompt) parts.push(`agent("${it.agent_prompt}")`);
    if (it.publish) parts.push(`publish(${it.publish.media_type ?? "Video"} ${it.publish.resolution ?? ""})`.trim());
    return `- ${it.name}: ${parts.join(" -> ")}`;
  });
  const willEdit = m.items.filter((i) => i.agent_prompt).length;
  const willPublish = m.items.filter((i) => i.publish).length;
  return {
    itemCount: m.items.length,
    willImport: m.items.length,
    willEdit,
    willPublish,
    lines,
    summary: `${m.items.length} item(s): ${m.items.length} import, ${willEdit} agent edit, ${willPublish} publish. Concurrency ${m.concurrency}. This will spend AI credits and media seconds.`
  };
}

export interface BatchItemReport {
  name: string;
  status: "success" | "failed";
  projectId?: string;
  projectUrl?: string;
  shareUrl?: string;
  aiCreditsUsed?: number;
  error?: string;
}
export interface BatchReport {
  total: number;
  succeeded: number;
  failed: number;
  items: BatchItemReport[];
}

export interface RunBatchOptions {
  confirm: boolean;
  poll?: PollOptions;
  onItemEvent?: (event: { name: string; phase: string; detail?: string }) => void;
}

async function runItem(client: DescriptClient, item: BatchItem, m: BatchManifest, opts: RunBatchOptions): Promise<BatchItemReport> {
  const emit = (phase: string, detail?: string) => opts.onItemEvent?.({ name: item.name, phase, detail });
  try {
    if (!("url" in item.source)) {
      throw new Error(`Item "${item.name}" uses a local file source; run it via the CLI import path, not the in-memory batch path.`);
    }
    const importReq: ImportRequest = {
      project_id: item.project_id,
      project_name: item.project_name ?? item.name,
      add_media: { [`${item.name}.media`]: { url: item.source.url } },
      add_compositions: [{ name: item.name, clips: [{ media: `${item.name}.media` }] }],
      callback_url: m.callback_url
    };
    emit("import");
    const imp = await importAndWait(client, importReq, opts.poll);
    if (!imp.ok) return { name: item.name, status: "failed", error: imp.error ?? "import failed" };
    let aiCredits: number | undefined;

    if (item.agent_prompt) {
      emit("agent");
      const ed = await editAndWait(client, { project_id: imp.projectId, prompt: item.agent_prompt, callback_url: m.callback_url }, opts.poll);
      if (!ed.ok) return { name: item.name, status: "failed", projectId: imp.projectId, error: ed.error ?? "agent failed" };
      aiCredits = ed.aiCreditsUsed;
    }

    let shareUrl: string | undefined;
    if (item.publish) {
      emit("publish");
      const pub = await publishAndWait(client, {
        project_id: imp.projectId,
        media_type: item.publish.media_type,
        resolution: item.publish.resolution,
        access_level: item.publish.access_level,
        callback_url: m.callback_url
      }, opts.poll);
      if (!pub.ok) return { name: item.name, status: "failed", projectId: imp.projectId, error: pub.error ?? "publish failed" };
      shareUrl = pub.shareUrl;
    }
    return { name: item.name, status: "success", projectId: imp.projectId, projectUrl: imp.projectUrl, shareUrl, aiCreditsUsed: aiCredits };
  } catch (e) {
    return { name: item.name, status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runBatch(client: DescriptClient, m: BatchManifest, opts: RunBatchOptions): Promise<BatchReport> {
  if (!opts.confirm) {
    throw new Error("Batch execution requires explicit confirmation. Run the plan first, then re-run with confirm.");
  }
  const queue = [...m.items];
  const results: BatchItemReport[] = [];
  const workers = Array.from({ length: Math.min(m.concurrency, queue.length) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      results.push(await runItem(client, item, m, opts));
    }
  });
  await Promise.all(workers);
  const succeeded = results.filter((r) => r.status === "success").length;
  return { total: m.items.length, succeeded, failed: results.length - succeeded, items: results };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS - five batch tests green.

- [ ] **Step 5: Commit**

```bash
git add src/workflows/batch.ts tests/workflows/batch.test.ts
git commit -m "feat(workflows): add manifest batch runner with dry-run gate"
```

---

## Task 12 - CLI, output formatting, bin shim, committed build

**Files:**
- Create: `src/cli/output.ts`
- Create: `src/cli/commands/registry.ts`
- Create: `src/cli/commands/config.ts`
- Create: `src/cli/index.ts`
- Create: `bin/descript`
- Create: `tests/cli/cli.test.ts`
- Modify: `.gitignore` (un-ignore `dist/`)

- [ ] **Step 1: Write the failing test**

`tests/cli/cli.test.ts`:

```typescript
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../../src/cli/index.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());

function capture() {
  const out: string[] = [];
  return { out, write: (s: string) => { out.push(s); } };
}

test("status command prints ok and exits 0", async () => {
  installMockFetch([{ status: 200, json: { status: "ok" } }]);
  const c = capture();
  const code = await runCli(["status", "--json"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: c.write, stderr: c.write });
  assert.equal(code, 0);
  assert.match(c.out.join(""), /"status": ?"ok"/);
});

test("missing token exits non-zero with a clear message", async () => {
  const c = capture();
  const code = await runCli(["status"], { env: {}, stdout: c.write, stderr: c.write });
  assert.notEqual(code, 0);
  assert.match(c.out.join(""), /No Descript API token/);
});

test("api error exits with code 3 and prints the hint", async () => {
  installMockFetch([{ status: 401, json: { error: "unauthorized", message: "bad token" } }]);
  const c = capture();
  const code = await runCli(["status"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: c.write, stderr: c.write });
  assert.equal(code, 3);
  assert.match(c.out.join(""), /descript-setup|token/i);
});

test("batch run without --confirm exits non-zero", async () => {
  const c = capture();
  const code = await runCli(["batch", "run", "/nonexistent.json"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: c.write, stderr: c.write });
  assert.notEqual(code, 0);
});

test("unknown command exits 2 with usage", async () => {
  const c = capture();
  const code = await runCli(["wat"], { env: {}, stdout: c.write, stderr: c.write });
  assert.equal(code, 2);
  assert.match(c.out.join(""), /Usage|Unknown command/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - `Cannot find module '../../src/cli/index.js'`.

- [ ] **Step 3: Create `src/cli/output.ts`**

```typescript
export interface IO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  json: boolean;
}

export function emit(io: IO, human: string, data: unknown): void {
  if (io.json) io.stdout(JSON.stringify(data, null, 2) + "\n");
  else io.stdout(human + "\n");
}

export function fail(io: IO, message: string, data?: unknown): void {
  if (io.json) io.stderr(JSON.stringify({ error: message, ...(data ? { detail: data } : {}) }, null, 2) + "\n");
  else io.stderr(message + "\n");
}
```

- [ ] **Step 4: Create `src/cli/commands/config.ts`**

```typescript
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { defaultConfigPath, redactToken } from "../../config/credentials.js";
import type { IO } from "../output.js";
import { emit, fail } from "../output.js";

export interface ConfigCtx {
  flags: Record<string, string | boolean>;
  io: IO;
}
interface CfgFile { default_profile?: string; profiles?: Record<string, { api_token: string }>; }

export function configSet(ctx: ConfigCtx): number {
  const profile = typeof ctx.flags.profile === "string" ? ctx.flags.profile : "default";
  const token = typeof ctx.flags.token === "string" ? ctx.flags.token : undefined;
  if (!token) { fail(ctx.io, "Provide --token (and optionally --profile)"); return 2; }
  const path = defaultConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  const cfg: CfgFile = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  cfg.profiles = { ...(cfg.profiles ?? {}), [profile]: { api_token: token } };
  cfg.default_profile = cfg.default_profile ?? profile;
  writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  emit(ctx.io, `Saved profile "${profile}" (${redactToken(token)}) to ${path}`, { profile, path });
  return 0;
}

export function configList(ctx: ConfigCtx): number {
  const path = defaultConfigPath();
  if (!existsSync(path)) { emit(ctx.io, "No profiles configured.", { profiles: [] }); return 0; }
  const cfg: CfgFile = JSON.parse(readFileSync(path, "utf8"));
  const names = Object.keys(cfg.profiles ?? {});
  emit(ctx.io, `Profiles: ${names.join(", ") || "none"} (default: ${cfg.default_profile ?? "none"})`, {
    default_profile: cfg.default_profile, profiles: names
  });
  return 0;
}
```

- [ ] **Step 5: Create `src/cli/commands/registry.ts`**

```typescript
import { DescriptClient } from "../../client/index.js";
import { DescriptApiError } from "../../client/errors.js";
import { resolveCredentials } from "../../config/credentials.js";
import { importAndWait } from "../../workflows/importAndWait.js";
import { editAndWait } from "../../workflows/editAndWait.js";
import { publishAndWait } from "../../workflows/publishAndWait.js";
import { directUpload } from "../../workflows/upload.js";
import { parseManifest, planBatch, runBatch } from "../../workflows/batch.js";
import { readFileSync } from "node:fs";
import type { IO } from "../output.js";
import { emit, fail } from "../output.js";
import { configSet, configList } from "./config.js";

export interface Ctx {
  args: string[];
  flags: Record<string, string | boolean>;
  env: Record<string, string | undefined>;
  io: IO;
}

function client(ctx: Ctx): DescriptClient {
  const creds = resolveCredentials({
    flagToken: typeof ctx.flags.token === "string" ? ctx.flags.token : undefined,
    profile: typeof ctx.flags.profile === "string" ? ctx.flags.profile : undefined,
    env: ctx.env
  });
  return new DescriptClient({ token: creds.token });
}

const noWait = (ctx: Ctx) => ctx.flags["no-wait"] === true;

export const COMMANDS: Record<string, (ctx: Ctx) => Promise<number>> = {
  async status(ctx) {
    const r = await client(ctx).getStatus();
    emit(ctx.io, `Descript API status: ${r.status}`, r);
    return 0;
  },

  async config(ctx) {
    const sub = ctx.args[0];
    if (sub === "set") return configSet({ flags: ctx.flags, io: ctx.io });
    if (sub === "list") return configList({ flags: ctx.flags, io: ctx.io });
    fail(ctx.io, "Usage: descript config set|list [--profile name] [--token value]");
    return 2;
  },

  async import(ctx) {
    const c = client(ctx);
    const name = String(ctx.flags.name ?? "API Import");
    const file = typeof ctx.flags.file === "string" ? ctx.flags.file : undefined;
    const url = typeof ctx.flags.url === "string" ? ctx.flags.url : undefined;
    if (!file && !url) { fail(ctx.io, "Provide --url or --file"); return 2; }

    if (file) {
      const submit = await directUpload(c, {
        mediaRef: "upload.media",
        filePath: file,
        contentType: String(ctx.flags["content-type"] ?? "video/mp4"),
        request: { project_name: name, add_media: {}, add_compositions: [{ name, clips: [{ media: "upload.media" }] }] }
      });
      if (noWait(ctx)) { emit(ctx.io, `Submitted import job ${submit.job_id}`, submit); return 0; }
      const out = await importAndWait(c, { project_id: submit.project_id, add_media: {} });
      emit(ctx.io, out.ok ? `Imported into ${out.projectUrl}` : `Import failed: ${out.error}`, out);
      return out.ok ? 0 : 4;
    }
    const req = { project_name: name, add_media: { "media.0": { url: url! } }, add_compositions: [{ name, clips: [{ media: "media.0" }] }] };
    if (noWait(ctx)) { const s = await c.importProjectMedia(req); emit(ctx.io, `Submitted ${s.job_id}`, s); return 0; }
    const out = await importAndWait(c, req);
    emit(ctx.io, out.ok ? `Imported into ${out.projectUrl}` : `Import failed: ${out.error}`, out);
    return out.ok ? 0 : 4;
  },

  async agent(ctx) {
    const c = client(ctx);
    const prompt = String(ctx.flags.prompt ?? "");
    if (!prompt) { fail(ctx.io, "Provide --prompt"); return 2; }
    const req = {
      project_id: typeof ctx.flags["project-id"] === "string" ? ctx.flags["project-id"] : undefined,
      project_name: typeof ctx.flags["project-name"] === "string" ? ctx.flags["project-name"] : undefined,
      composition_id: typeof ctx.flags["composition-id"] === "string" ? ctx.flags["composition-id"] : undefined,
      model: typeof ctx.flags.model === "string" ? ctx.flags.model : undefined,
      prompt
    };
    if (noWait(ctx)) { const s = await c.agentEditJob(req); emit(ctx.io, `Submitted ${s.job_id}`, s); return 0; }
    const out = await editAndWait(c, req);
    emit(ctx.io,
      out.ok ? `Agent: ${out.agentResponse} (credits: ${out.aiCreditsUsed ?? 0}, seconds: ${out.mediaSecondsUsed ?? 0})`
             : `Agent failed: ${out.error}`,
      out);
    return out.ok ? 0 : 4;
  },

  async publish(ctx) {
    const c = client(ctx);
    const projectId = typeof ctx.flags["project-id"] === "string" ? ctx.flags["project-id"] : "";
    if (!projectId) { fail(ctx.io, "Provide --project-id"); return 2; }
    const req = {
      project_id: projectId,
      composition_id: typeof ctx.flags["composition-id"] === "string" ? ctx.flags["composition-id"] : undefined,
      media_type: (ctx.flags["media-type"] as "Video" | "Audio") || undefined,
      resolution: (ctx.flags.resolution as "480p" | "720p" | "1080p" | "1440p" | "4K") || undefined,
      access_level: (ctx.flags["access-level"] as "public" | "unlisted" | "drive" | "private") || undefined
    };
    if (noWait(ctx)) { const s = await c.publishJob(req); emit(ctx.io, `Submitted ${s.job_id}`, s); return 0; }
    const out = await publishAndWait(c, req);
    emit(ctx.io, out.ok ? `Published: ${out.shareUrl}` : `Publish failed: ${out.error}`, out);
    return out.ok ? 0 : 4;
  },

  async jobs(ctx) {
    const c = client(ctx);
    const sub = ctx.args[0];
    if (sub === "list") { const r = await c.listJobs(); emit(ctx.io, `${r.data.length} job(s)`, r); return 0; }
    if (sub === "get") { const r = await c.getJob(String(ctx.args[1])); emit(ctx.io, `Job ${r.job_id}: ${r.job_state}`, r); return 0; }
    if (sub === "cancel") { await c.cancelJob(String(ctx.args[1])); emit(ctx.io, `Cancelled ${ctx.args[1]}`, { cancelled: ctx.args[1] }); return 0; }
    fail(ctx.io, "Usage: descript jobs list|get <id>|cancel <id>");
    return 2;
  },

  async projects(ctx) {
    const c = client(ctx);
    const sub = ctx.args[0];
    if (sub === "list") { const r = await c.listProjects(); emit(ctx.io, `${r.data.length} project(s)`, r); return 0; }
    if (sub === "get") { const r = await c.getProject(String(ctx.args[1])); emit(ctx.io, `Project ${r.name}`, r); return 0; }
    fail(ctx.io, "Usage: descript projects list|get <id>");
    return 2;
  },

  async published(ctx) {
    const c = client(ctx);
    const r = await c.getPublishedProjectMetadata(String(ctx.args[1] ?? ctx.args[0]));
    emit(ctx.io, `Published ${r.publish_type} (${r.privacy})`, r);
    return 0;
  },

  async "edit-in-descript"(ctx) {
    const c = client(ctx);
    const schemaPath = typeof ctx.flags.schema === "string" ? ctx.flags.schema : "";
    if (!schemaPath) { fail(ctx.io, "Provide --schema <path to JSON body>"); return 2; }
    const body = JSON.parse(readFileSync(schemaPath, "utf8"));
    const r = await c.postEditInDescriptSchema(body);
    emit(ctx.io, `Import URL: ${r.url}`, r);
    return 0;
  },

  async batch(ctx) {
    const c = client(ctx);
    const sub = ctx.args[0];
    const file = ctx.args[1];
    if (!file) { fail(ctx.io, "Usage: descript batch plan|run <manifest.json> [--confirm]"); return 2; }
    const manifest = parseManifest(JSON.parse(readFileSync(file, "utf8")));
    if (sub === "plan") {
      const plan = planBatch(manifest);
      emit(ctx.io, [plan.summary, ...plan.lines].join("\n"), plan);
      return 0;
    }
    if (sub === "run") {
      if (ctx.flags.confirm !== true) {
        fail(ctx.io, "Refusing to run. Review `descript batch plan` first, then re-run with --confirm.");
        return 2;
      }
      const report = await runBatch(c, manifest, { confirm: true });
      emit(ctx.io, `Batch done: ${report.succeeded} ok, ${report.failed} failed`, report);
      return report.failed === 0 ? 0 : 4;
    }
    fail(ctx.io, "Usage: descript batch plan|run <manifest.json> [--confirm]");
    return 2;
  }
};

export function mapError(io: IO, e: unknown): number {
  if (e instanceof DescriptApiError) {
    fail(io, `${e.message}\nHint: ${e.hint}`, e.body);
    return 3;
  }
  fail(io, e instanceof Error ? e.message : String(e));
  return 1;
}
```

- [ ] **Step 6: Create `src/cli/index.ts`**

```typescript
import { COMMANDS, mapError, type Ctx } from "./commands/registry.js";
import type { IO } from "./output.js";
import { fail } from "./output.js";

const USAGE = `Usage: descript <command> [options]

Commands:
  status                         Check API auth and service status
  config set|list                Manage API token profiles
  import --url|--file [...]      Import media, create a project
  agent --prompt [...]           Run an Underlord agent edit
  publish --project-id [...]     Publish a composition
  jobs list|get <id>|cancel <id> Inspect or cancel jobs
  projects list|get <id>         List or fetch projects
  published <slug>               Get published project metadata
  edit-in-descript --schema f    Partner-gated import URL exchange
  batch plan|run <manifest>      Bulk import/edit/publish

Global options:
  --json            Machine-readable output
  --no-wait         Submit without polling to completion
  --token <t>       Explicit API token
  --profile <name>  Credential profile to use`;

export function parseArgv(argv: string[]): { command: string; args: string[]; flags: Record<string, string | boolean> } {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { flags[key] = next; i++; }
      else flags[key] = true;
    } else positionals.push(a);
  }
  return { command: positionals[0] ?? "", args: positionals.slice(1), flags };
}

export interface RunOptions {
  env?: Record<string, string | undefined>;
  stdout?: (s: string) => void;
  stderr?: (s: string) => void;
}

export async function runCli(argv: string[], opts: RunOptions = {}): Promise<number> {
  const { command, args, flags } = parseArgv(argv);
  const io: IO = {
    stdout: opts.stdout ?? ((s) => process.stdout.write(s)),
    stderr: opts.stderr ?? ((s) => process.stderr.write(s)),
    json: flags.json === true
  };
  if (!command || command === "help" || flags.help === true) {
    io.stdout(USAGE + "\n");
    return command ? 0 : 2;
  }
  const handler = COMMANDS[command];
  if (!handler) { fail(io, `Unknown command "${command}".\n\n${USAGE}`); return 2; }
  const ctx: Ctx = { args, flags, env: opts.env ?? process.env, io };
  try {
    return await handler(ctx);
  } catch (e) {
    return mapError(io, e);
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS - five CLI tests green.

- [ ] **Step 8: Create the bin shim `bin/descript`**

```bash
#!/usr/bin/env node
import { runCli } from "../dist/src/cli/index.js";
const code = await runCli(process.argv.slice(2));
process.exit(code);
```

- [ ] **Step 9: Make it executable and un-ignore the build**

Run:
```bash
chmod +x bin/descript
grep -v '^dist/$' .gitignore > .gitignore.tmp && mv .gitignore.tmp .gitignore
npm run build
```
Expected: `dist/src/cli/index.js` exists.

- [ ] **Step 10: Manually verify the bin runs**

Run: `DESCRIPT_API_TOKEN=dummy ./bin/descript help`
Expected: prints the usage block, exit 0.

- [ ] **Step 11: Commit (including the built dist/)**

```bash
git add src/cli bin/descript .gitignore tests/cli/cli.test.ts dist
git commit -m "feat(cli): add CLI, output formatting, bin shim and committed build"
```

---

## Task 13 - Optional MCP shim (in-process, zero subprocess)

**Files:**
- Create: `src/mcp/server.ts`
- Create: `.mcp.json`
- Create: `tests/mcp/server.test.ts`

The shim speaks MCP over stdio with zero dependencies. Each tool invokes the built CLI's `runCli` function in-process and captures its output. No subprocess, no shell, no `node:child_process`.

- [ ] **Step 1: Write the failing test**

`tests/mcp/server.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRpc, TOOLS } from "../../src/mcp/server.js";

test("lists a tool per CLI surface", () => {
  const names = TOOLS.map((t) => t.name);
  for (const n of ["descript_status", "descript_import", "descript_agent", "descript_publish", "descript_jobs", "descript_projects", "descript_published", "descript_edit_in_descript", "descript_batch"]) {
    assert.ok(names.includes(n), `missing tool ${n}`);
  }
});

test("initialize returns protocol and serverInfo", async () => {
  const r = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, async () => ({ code: 0, stdout: "", stderr: "" }));
  assert.equal(r!.result.serverInfo.name, "descript");
});

test("tools/list returns the tool array", async () => {
  const r = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, async () => ({ code: 0, stdout: "", stderr: "" }));
  assert.equal(r!.result.tools.length, TOOLS.length);
});

test("tools/call invokes the CLI and returns stdout", async () => {
  const r = await handleRpc(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "descript_status", arguments: {} } },
    async (argv) => { assert.deepEqual(argv, ["status", "--json"]); return { code: 0, stdout: '{"status":"ok"}', stderr: "" }; }
  );
  assert.match(r!.result.content[0].text, /"status":"ok"/);
});

test("notifications (no id) produce no response", async () => {
  const r = await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }, async () => ({ code: 0, stdout: "", stderr: "" }));
  assert.equal(r, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL - `Cannot find module '../../src/mcp/server.js'`.

- [ ] **Step 3: Create `src/mcp/server.ts`**

```typescript
import { fileURLToPath } from "node:url";
import { runCli } from "../cli/index.js";

export interface Tool {
  name: string;
  description: string;
  argv: (args: Record<string, unknown>) => string[];
}

const passthrough = (base: string[]) => (args: Record<string, unknown>): string[] => {
  const out = [...base];
  for (const [k, v] of Object.entries(args)) {
    if (v === true) out.push(`--${k}`);
    else if (v !== false && v !== undefined && v !== null) out.push(`--${k}`, String(v));
  }
  out.push("--json");
  return out;
};

export const TOOLS: Tool[] = [
  { name: "descript_status", description: "Check Descript API auth and status", argv: passthrough(["status"]) },
  { name: "descript_import", description: "Import media and create a project (flags: url, file, name, no-wait)", argv: passthrough(["import"]) },
  { name: "descript_agent", description: "Run an Underlord agent edit (flags: project-id, prompt, model, no-wait)", argv: passthrough(["agent"]) },
  { name: "descript_publish", description: "Publish a composition (flags: project-id, composition-id, media-type, resolution)", argv: passthrough(["publish"]) },
  { name: "descript_jobs", description: "Inspect or cancel jobs. args: sub=list|get|cancel, id", argv: (a) => ["jobs", String(a.sub ?? "list"), ...(a.id ? [String(a.id)] : []), "--json"] },
  { name: "descript_projects", description: "List or fetch projects. args: sub=list|get, id", argv: (a) => ["projects", String(a.sub ?? "list"), ...(a.id ? [String(a.id)] : []), "--json"] },
  { name: "descript_published", description: "Get published project metadata. arg: slug", argv: (a) => ["published", String(a.slug ?? ""), "--json"] },
  { name: "descript_edit_in_descript", description: "Partner-gated import URL exchange (flag: schema path)", argv: passthrough(["edit-in-descript"]) },
  { name: "descript_batch", description: "Bulk runner. args: sub=plan|run, file; flag confirm", argv: (a) => ["batch", String(a.sub ?? "plan"), String(a.file ?? ""), ...(a.confirm ? ["--confirm"] : []), "--json"] }
];

export interface ExecResult { code: number; stdout: string; stderr: string; }
export type Executor = (argv: string[]) => Promise<ExecResult>;

export const realExecutor: Executor = async (argv) => {
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, {
    stdout: (s) => { stdout += s; },
    stderr: (s) => { stderr += s; }
  });
  return { code, stdout, stderr };
};

export interface RpcRequest { jsonrpc: "2.0"; id?: number | string; method: string; params?: Record<string, unknown>; }
export interface RpcResponse { jsonrpc: "2.0"; id: number | string; result: any; }

export async function handleRpc(req: RpcRequest, exec: Executor): Promise<RpcResponse | null> {
  if (req.id === undefined) return null; // notification
  if (req.method === "initialize") {
    return { jsonrpc: "2.0", id: req.id, result: {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "descript", version: "0.1.0" }
    } };
  }
  if (req.method === "tools/list") {
    return { jsonrpc: "2.0", id: req.id, result: {
      tools: TOOLS.map((t) => ({
        name: t.name, description: t.description,
        inputSchema: { type: "object", additionalProperties: true }
      }))
    } };
  }
  if (req.method === "tools/call") {
    const name = String(req.params?.name);
    const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return { jsonrpc: "2.0", id: req.id, result: { isError: true, content: [{ type: "text", text: `Unknown tool ${name}` }] } };
    }
    const r = await exec(tool.argv(args));
    return { jsonrpc: "2.0", id: req.id, result: {
      isError: r.code !== 0,
      content: [{ type: "text", text: r.stdout || r.stderr }]
    } };
  }
  return { jsonrpc: "2.0", id: req.id, result: {} };
}

async function main(): Promise<void> {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const req = JSON.parse(line) as RpcRequest;
      const resp = await handleRpc(req, realExecutor);
      if (resp) process.stdout.write(JSON.stringify(resp) + "\n");
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
```

- [ ] **Step 4: Create `.mcp.json`**

```json
{
  "mcpServers": {
    "descript": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/src/mcp/server.js"]
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS - five MCP tests green.

- [ ] **Step 6: Rebuild and commit**

```bash
npm run build
git add src/mcp/server.ts .mcp.json tests/mcp/server.test.ts dist
git commit -m "feat(mcp): add optional zero-dependency in-process MCP shim"
```

---

## Task 14 - Skills

**Files:**
- Create: `skills/descript-setup/SKILL.md`
- Create: `skills/descript-import/SKILL.md`
- Create: `skills/descript-edit/SKILL.md`
- Create: `skills/descript-publish/SKILL.md`
- Create: `skills/descript-jobs/SKILL.md`
- Create: `skills/descript-batch/SKILL.md`
- Create: `skills/descript-api-reference/SKILL.md`

No automated test. Validated by `claude plugin validate .` in Task 15. Each references the `descript` binary already on PATH via `bin/`.

- [ ] **Step 1: Create `skills/descript-setup/SKILL.md`**

```markdown
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
```

- [ ] **Step 2: Create `skills/descript-import/SKILL.md`**

```markdown
---
name: descript-import
description: Import media into Descript and create a project. Use when the user wants to bring a video or audio file or URL into Descript, create a Descript project from media, or upload a local recording for editing.
---

# Descript Import

Import media by public URL or local file and create a Descript project.

## When to Use
- "Import this video into Descript", "create a Descript project from this URL"
- Local file upload (the CLI runs the three-step signed-URL flow automatically)
- NOT for: editing content (use descript-edit) or publishing (use descript-publish)

## Instructions
- URL import: `descript import --url "<https url>" --name "Project Name" --json`
- Local file: `descript import --file "/path/clip.mp4" --content-type video/mp4 --name "Project Name" --json`
- Add `--no-wait` to submit without polling (headless). Otherwise the command polls to completion and prints the project URL.
- Report the projectUrl and any failedMedia entries to the user.

Import consumes media processing but does not spend AI credits.
```

- [ ] **Step 3: Create `skills/descript-edit/SKILL.md`**

```markdown
---
name: descript-edit
description: Run an Underlord agent edit on a Descript project. Use when the user wants Descript AI to edit a project - add Studio Sound, captions, remove filler words, create a highlight reel, or any natural-language editing instruction.
---

# Descript Agent Edit

Run a one-shot Underlord agent edit.

## When to Use
- "Add studio sound and captions", "remove filler words", "make a 30s highlight"
- NOT for: importing (descript-import) or publishing (descript-publish)

## Instructions
1. The Descript API is one-shot. Frame the entire instruction in a single prompt with all needed detail. There is no follow-up conversation.
2. This SPENDS AI credits and media seconds. Before submitting, state the project and prompt and get explicit user confirmation.
3. Run: `descript agent --project-id <ID> --prompt "<one-shot instruction>" --json`
4. Report agentResponse, aiCreditsUsed, and mediaSecondsUsed from the result so cost is visible.
5. On failure, surface the error and do not silently retry (a retry re-spends credits).
```

- [ ] **Step 4: Create `skills/descript-publish/SKILL.md`**

```markdown
---
name: descript-publish
description: Publish a Descript composition to a shareable link or downloadable file. Use when the user wants to export, publish, or share a finished Descript project.
disable-model-invocation: true
---

# Descript Publish

Publish a composition. Operator-triggered because publishing spends resources and produces a public artifact.

## Instructions
1. Confirm project id, composition id, media type, resolution, and access level with the user.
2. Run: `descript publish --project-id <ID> --composition-id <CID> --media-type Video --resolution 1080p --json`
3. Report the shareUrl and downloadUrl.
4. A 403 means the Drive's publish settings block the requested access level. Report the cause from the error hint.
```

- [ ] **Step 5: Create `skills/descript-jobs/SKILL.md`**

```markdown
---
name: descript-jobs
description: Inspect, list, or cancel Descript jobs. Use when the user asks about the status of a Descript import, edit, or publish, wants to see recent jobs, or needs to cancel a running or runaway job.
---

# Descript Jobs

## When to Use
- "Is my Descript edit done?", "list recent Descript jobs", "cancel that job"

## Instructions
- List: `descript jobs list --json`
- Get one: `descript jobs get <JOB_ID> --json` - completion is job_state stopped, then read result.status.
- Cancel: confirm with the user first, then `descript jobs cancel <JOB_ID> --json`. Cancel is the stop control for a runaway batch.
```

- [ ] **Step 6: Create `skills/descript-batch/SKILL.md`**

```markdown
---
name: descript-batch
description: Run a bulk Descript pipeline - import then agent-edit then publish across many items from a manifest. Use for large batch content operations across many videos.
disable-model-invocation: true
---

# Descript Batch

Operator-triggered. Bulk operations spend significant AI credits and media seconds.

## Instructions
1. Build a JSON manifest: { "concurrency": 2, "items": [ { "name": "...", "source": {"url": "..."}, "project_name": "...", "agent_prompt": "...", "publish": {"media_type":"Video","resolution":"1080p"} } ] }
2. ALWAYS plan first: `descript batch plan manifest.json --json`. Present the full plan and estimated spend to the user. Do not summarize it.
3. Only after explicit user approval: `descript batch run manifest.json --confirm --json`
4. Report per-item outcomes including failures. Never report partial success as success.
```

- [ ] **Step 7: Create `skills/descript-api-reference/SKILL.md`**

```markdown
---
name: descript-api-reference
description: Internal reference of the Descript API surface and the descript CLI. Loaded by Claude when constructing Descript requests.
user-invocable: false
---

# Descript API Reference

Background knowledge for building correct Descript requests.

## Endpoints (all via the `descript` CLI)
- import: POST /jobs/import/project_media - async, returns job_id; URL, direct-upload, or multitrack media
- agent: POST /jobs/agent - async; one-shot prompt; spends AI credits
- publish: POST /jobs/publish - async; Video or Audio, resolution, access_level
- jobs: GET /jobs, GET /jobs/{id}, DELETE /jobs/{id} - state is queued, running, stopped, cancelled
- projects: GET /projects, GET /projects/{id}
- status: GET /status
- published: GET /published_projects/{slug}
- edit_in_descript: POST /edit_in_descript/schema - partner-gated, requires Descript onboarding

## Job completion
A job is done when job_state is stopped. Then result.status is success (or partial for import) or error. The CLI AndWait commands and the workflows handle polling automatically.

## Auth
Bearer token, Drive-scoped. Resolution order: --token, DESCRIPT_API_TOKEN, config file profile, plugin api_token.

## CLI map
descript status, config, import, agent, publish, jobs, projects, published, edit-in-descript, batch. Add --json for machine output, --no-wait to skip polling, --profile to select a Drive.
```

- [ ] **Step 8: Commit**

```bash
git add skills
git commit -m "feat(skills): add 7 skills with cost gating on edit, publish, batch"
```

---

## Task 15 - Plugin manifest, self-marketplace, validation

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`

- [ ] **Step 1: Create `.claude-plugin/plugin.json`**

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "descript",
  "version": "0.1.0",
  "description": "Full programmatic access to the Descript API. Proactively activates for: (1) importing media into Descript, (2) Underlord agent edits, (3) publishing compositions, (4) bulk video pipelines, (5) Descript job status.",
  "author": {
    "name": "Julian Dickie",
    "email": "julian@instituteofdigitaldentistry.com",
    "url": "https://github.com/juliandickie"
  },
  "homepage": "https://github.com/juliandickie/descript-plugin",
  "repository": "https://github.com/juliandickie/descript-plugin",
  "license": "MIT",
  "keywords": ["descript", "video", "audio", "transcription", "underlord", "publishing", "automation", "cli", "mcp"],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "userConfig": {
    "api_token": {
      "type": "string",
      "title": "Descript API Token",
      "description": "Personal API token from Descript Settings, API tokens. Scoped to one Drive.",
      "sensitive": true
    },
    "default_profile": {
      "type": "string",
      "title": "Default credential profile",
      "description": "Optional named profile to select when multiple Drives are configured.",
      "required": false
    }
  }
}
```

- [ ] **Step 2: Create the self-marketplace `.claude-plugin/marketplace.json`**

```json
{
  "name": "descript",
  "owner": {
    "name": "Julian Dickie",
    "url": "https://github.com/juliandickie"
  },
  "metadata": {
    "description": "Standalone marketplace for the descript plugin - full programmatic access to the Descript API.",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "descript",
      "source": { "source": "url", "url": "https://github.com/juliandickie/descript-plugin.git" },
      "description": "Full programmatic access to the Descript API - import, Underlord agent edits, publish, jobs, and bulk pipelines, via a Node CLI wrapped by skills and an optional MCP shim.",
      "author": {
        "name": "Julian Dickie",
        "email": "julian@instituteofdigitaldentistry.com",
        "url": "https://github.com/juliandickie"
      },
      "homepage": "https://github.com/juliandickie/descript-plugin",
      "repository": "https://github.com/juliandickie/descript-plugin",
      "license": "MIT",
      "category": "creative-tools",
      "keywords": ["descript", "video", "audio", "transcription", "underlord", "publishing", "automation"]
    }
  ]
}
```

- [ ] **Step 3: Validate the plugin**

Run: `claude plugin validate .`
Expected: validation passes with zero errors. If it reports the build is missing, run `npm run build` and re-validate.

- [ ] **Step 4: Commit**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "feat: add plugin manifest and standalone self-marketplace"
```

---

## Task 16 - Docs, plugin CLAUDE.md, license, outfit-catalog entry

**Files:**
- Create: `LICENSE`
- Create: `README.md`
- Create: `CHANGELOG.md`
- Create: `CLAUDE.md`
- Modify: `/Users/juliandickie/code/plugins/.claude-plugin/marketplace.json` (the separate `outfit` catalog)

- [ ] **Step 1: Create `LICENSE`** - the standard MIT License text, copyright holder "Julian Dickie", year 2026.

- [ ] **Step 2: Create `README.md`**

````markdown
# descript

Full programmatic access to the Descript API for Claude Code. A Node/TypeScript CLI covering all 11 endpoints plus polling, the three-step signed-URL upload, and a bulk pipeline runner, wrapped by skills and an optional MCP shim.

## Install (standalone)

```
/plugin marketplace add juliandickie/descript-plugin
/plugin install descript@descript
```

## Setup

Create a token in Descript Settings, API tokens, then:

```
descript config set --token <TOKEN> --profile default
descript status
```

Or set DESCRIPT_API_TOKEN, or the plugin api_token config.

## CLI

descript status, config, import, agent, publish, jobs, projects, published, edit-in-descript, batch

Global flags: --json, --no-wait, --token, --profile.

## Skills

descript-setup, descript-import, descript-edit, descript-publish, descript-jobs, descript-batch, descript-api-reference. Edit, publish, and batch are cost-gated.

## Development

```
npm install
npm test
npm run build
```

Zero runtime dependencies.
````

- [ ] **Step 3: Create `CHANGELOG.md`**

```markdown
# Changelog

## 0.1.0 - 2026-05-17
- Initial release. Full Descript API coverage (11 endpoints), polling, direct upload, batch runner, 7 skills, optional in-process MCP shim.
```

- [ ] **Step 4: Create the plugin `CLAUDE.md`**

```markdown
# descript - AI Agent Context

## What This Plugin Does
Full programmatic access to the Descript API via a Node/TypeScript CLI, wrapped by skills and an optional MCP shim. Serves Claude, direct CLI use, and headless batch.

## Layout Rules
- Component dirs at plugin root: skills/, bin/, src/, dist/
- .claude-plugin/ holds only plugin.json and marketplace.json
- ${CLAUDE_PLUGIN_ROOT} in .mcp.json; no absolute paths
- The CLI is the single source of truth; skills and the MCP shim are thin wrappers - never duplicate API logic

## Build
`npm run build` compiles src/ to dist/ (committed for zero-install). Zero runtime dependencies. Tests: `npm test` (no live API).

## Cost Safety
agent, publish, and batch spend money. Keep disable-model-invocation on descript-publish and descript-batch. Keep the batch dry-run gate. Always report ai_credits_used and media_seconds_used.

## Versioning
SemVer in plugin.json and package.json. Tag vX.Y.Z. Update CHANGELOG.
```

- [ ] **Step 5: Add the entry to the separate `outfit` catalog**

Edit `/Users/juliandickie/code/plugins/.claude-plugin/marketplace.json`. Append this object to the `plugins` array (after the existing `spiffy` entry, matching the established shape exactly):

```json
{
  "name": "descript",
  "source": {
    "source": "url",
    "url": "https://github.com/juliandickie/descript-plugin.git"
  },
  "description": "Full programmatic access to the Descript API - import media, Underlord AI agent edits, publish compositions, inspect jobs, and run bulk video pipelines. Node CLI wrapped by skills and an optional MCP shim. Supply your own Descript API token.",
  "author": {
    "name": "Julian Dickie",
    "email": "julian@instituteofdigitaldentistry.com",
    "url": "https://github.com/juliandickie"
  },
  "homepage": "https://github.com/juliandickie/descript-plugin",
  "repository": "https://github.com/juliandickie/descript-plugin",
  "license": "MIT",
  "category": "creative-tools",
  "keywords": ["descript", "video", "audio", "transcription", "underlord", "publishing", "automation", "mcp"]
}
```

- [ ] **Step 6: Validate both catalogs**

Run:
```bash
claude plugin validate .
python3 -m json.tool /Users/juliandickie/code/plugins/.claude-plugin/marketplace.json > /dev/null && echo "outfit catalog JSON ok"
```
Expected: plugin validates clean; the outfit catalog JSON parses without error.

- [ ] **Step 7: Final build and commit (plugin repo)**

```bash
npm run build
git add LICENSE README.md CHANGELOG.md CLAUDE.md dist
git commit -m "docs: add README, CHANGELOG, LICENSE, plugin CLAUDE.md"
git tag v0.1.0
```

- [ ] **Step 8: Commit the outfit-catalog change (separate repo)**

```bash
cd /Users/juliandickie/code/plugins
git add .claude-plugin/marketplace.json
git commit -m "feat: add descript plugin to the outfit catalog"
cd /Users/juliandickie/code/descript-plugin
```

---

## Self-Review

**1. Spec coverage** - every spec section maps to a task:

- Spec 3 (all 11 endpoints) - Tasks 5 and 6, facade Task 7.

- Spec 3.2 (async job model) - Task 8 polling, Task 10 and-wait.

- Spec 3.3 (3-step upload) - Task 9.

- Spec 3.4 and 3.5 (rate limits, errors) - Task 3 errors, Task 4 429 retry.

- Spec 4 (three-layer hybrid) - client Tasks 2 to 7, workflows 8 to 11, CLI 12, MCP 13.

- Spec 6 (component design) - one task per component, boundaries respected.

- Spec 7 (data flow, no-wait) - Task 12 `--no-wait`, Task 10.

- Spec 8 (credentials, profiles) - Task 7.

- Spec 9 (error mapping table) - Tasks 3 and 4; CLI exit code 3 in Task 12.

- Spec 10 (batch manifest) - Task 11.

- Spec 11 (cost and safety gates) - Task 11 dry-run gate, Task 14 disable-model-invocation on publish and batch, edit confirmation in the skill.

- Spec 12 (7 skills, invocation modes) - Task 14.

- Spec 13 (MCP shim) - Task 13, realized in-process (recorded refinement in Conventions).

- Spec 14 (testing) - tests in every code task; the undici-to-fetch-mock refinement is recorded in Conventions.

- Spec 15 (manifest, versioning, dual distribution) - Tasks 15 and 16.

- Spec 16 (risks) - 429 retry (Task 4), poll default (Tasks 8 and 10), dry-run gate (Task 11), streaming upload (Task 9), no blind POST retry (Task 4 retries only 429), token redaction (Task 7).

**2. Placeholder scan** - no TBD or "implement later". Every code step shows complete code. The LICENSE step references the standard MIT License, a fixed well-known document, not a placeholder.

**3. Type consistency** - `DescriptClient`, `HttpClient`, `DescriptApiError`, `resolveCredentials`, `pollJob`, `directUpload`, `importAndWait` / `editAndWait` / `publishAndWait`, `parseManifest` / `planBatch` / `runBatch`, `runCli` / `parseArgv`, `handleRpc` / `TOOLS` / `Executor` are defined once and referenced with consistent signatures across tasks. CLI exit codes are consistent everywhere: 0 success, 2 usage, 3 API error, 4 job or batch failure, 1 other. The MCP `Executor` type and the injected test double match the `realExecutor` signature.

No gaps found. Plan is ready.
