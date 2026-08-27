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

export interface RawResponse {
  bytes: Uint8Array;
  contentType?: string;
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
    const resp = await this.send(method, path, opts, "application/json");
    if (resp.status === 204) return undefined as T;
    const text = await resp.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // Same auth, query, retry, and error mapping as request(), but returns the
  // response body as bytes for endpoints that serve files (POST /export/transcript
  // returns txt/markdown/html/rtf/srt as text and docx as binary).
  async requestRaw(method: string, path: string, opts: RequestOptions = {}): Promise<RawResponse> {
    const resp = await this.send(method, path, opts, "*/*");
    if (resp.status === 204) return { bytes: new Uint8Array(0) };
    return {
      bytes: new Uint8Array(await resp.arrayBuffer()),
      contentType: resp.headers.get("content-type") ?? undefined
    };
  }

  // Shared plumbing for request() and requestRaw(): builds the URL and
  // headers, retries on 429 honoring Retry-After, and throws
  // DescriptApiError on any other non-2xx status. Returns the raw Response
  // (including 204, which counts as ok) so each caller extracts the body in
  // its own format - parsed JSON for request(), raw bytes for requestRaw().
  private async send(method: string, path: string, opts: RequestOptions, accept: string): Promise<Response> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {
      ...(opts.headers ?? {}),
      authorization: `Bearer ${this.token}`,
      accept
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
      if (resp.ok) return resp;
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
