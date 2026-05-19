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

export function restoreFetch(): void {
  mock.restoreAll();
}
