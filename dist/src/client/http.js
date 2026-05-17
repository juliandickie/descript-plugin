import { DescriptApiError } from "./errors.js";
const DEFAULT_BASE = "https://descriptapi.com/v1";
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
export class HttpClient {
    token;
    baseUrl;
    maxRetries;
    sleep;
    constructor(opts) {
        this.token = opts.token;
        this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
        this.maxRetries = opts.maxRetries ?? 4;
        this.sleep = opts.sleep ?? defaultSleep;
    }
    async request(method, path, opts = {}) {
        const url = new URL(this.baseUrl + path);
        for (const [k, v] of Object.entries(opts.query ?? {})) {
            if (v !== undefined)
                url.searchParams.set(k, String(v));
        }
        const headers = {
            ...(opts.headers ?? {}),
            authorization: `Bearer ${this.token}`,
            accept: "application/json"
        };
        let init = { method, headers };
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
            if (resp.status === 204)
                return undefined;
            if (resp.ok) {
                const text = await resp.text();
                return (text ? JSON.parse(text) : undefined);
            }
            throw await toApiError(resp);
        }
    }
}
function retryAfterMs(resp) {
    const h = resp.headers.get("retry-after");
    const secs = h !== null ? Number(h) : NaN;
    return Number.isFinite(secs) ? secs * 1000 : 1000;
}
async function toApiError(resp) {
    let body;
    try {
        const text = await resp.text();
        body = text ? JSON.parse(text) : undefined;
    }
    catch {
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
