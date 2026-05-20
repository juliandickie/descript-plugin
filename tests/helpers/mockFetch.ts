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
    const nullBodyStatuses = new Set([101, 204, 205, 304]);
    const responseBody = nullBodyStatuses.has(spec.status) ? null : bodyText;
    return new Response(responseBody, { status: spec.status, headers: respHeaders });
  });
  return { calls };
}

// Defense-in-depth for hermeticity: any test that reaches the network
// without an explicit mock should fail loudly here, never hit a real API.
export function installNoNetwork(): void {
  mock.method(globalThis, "fetch", async () => {
    throw new Error("unexpected network call in test (no mock fetch installed)");
  });
}

// URL-pattern-aware mock: each rule maps a string-includes pattern to a
// response queue. Incoming fetch URLs are matched in rule order; the first
// match consumes from that rule's queue. An unmatched URL throws.
export function installMockFetchByUrl(
  rules: Array<{ match: string; responses: MockResponseSpec[] }>
): { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const counters = rules.map(() => 0);
  mock.method(globalThis, "fetch", async (input: any, init: any = {}) => {
    const headers: Record<string, string> = {};
    const h = new Headers(init.headers ?? {});
    h.forEach((v, k) => { headers[k] = v; });
    const url = String(input);
    calls.push({ url, method: init.method ?? "GET", headers, body: typeof init.body === "string" ? init.body : undefined });
    const idx = rules.findIndex(r => url.includes(r.match));
    if (idx < 0) throw new Error(`installMockFetchByUrl: no rule matched URL: ${url}`);
    const rule = rules[idx]!;
    const ci = counters[idx]!;
    const spec = rule.responses[Math.min(ci, rule.responses.length - 1)]!;
    counters[idx] = ci + 1;
    const respHeaders = new Headers(spec.headers ?? {});
    const bodyText = spec.json !== undefined ? JSON.stringify(spec.json) : (spec.text ?? "");
    const nullBodyStatuses = new Set([101, 204, 205, 304]);
    const responseBody = nullBodyStatuses.has(spec.status) ? null : bodyText;
    return new Response(responseBody, { status: spec.status, headers: respHeaders });
  });
  return { calls };
}

export function restoreFetch(): void {
  mock.restoreAll();
}
