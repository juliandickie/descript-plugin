import { mock } from "node:test";
export function installMockFetch(sequence) {
    const calls = [];
    let i = 0;
    mock.method(globalThis, "fetch", async (input, init = {}) => {
        const headers = {};
        const h = new Headers(init.headers ?? {});
        h.forEach((v, k) => { headers[k] = v; });
        calls.push({
            url: String(input),
            method: init.method ?? "GET",
            headers,
            body: typeof init.body === "string" ? init.body : undefined
        });
        const spec = sequence[Math.min(i, sequence.length - 1)];
        i += 1;
        const respHeaders = new Headers(spec.headers ?? {});
        const bodyText = spec.json !== undefined ? JSON.stringify(spec.json) : (spec.text ?? "");
        const nullBodyStatuses = new Set([101, 204, 205, 304]);
        const responseBody = nullBodyStatuses.has(spec.status) ? null : bodyText;
        return new Response(responseBody, { status: spec.status, headers: respHeaders });
    });
    return { calls };
}
export function restoreFetch() {
    mock.restoreAll();
}
