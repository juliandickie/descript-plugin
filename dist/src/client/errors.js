export function categoryForStatus(status) {
    switch (status) {
        case 400: return "bad_request";
        case 401: return "unauthorized";
        case 402: return "payment_required";
        case 403: return "forbidden";
        case 404: return "not_found";
        case 422: return "unprocessable";
        case 429: return "rate_limited";
    }
    if (status >= 500)
        return "server_error";
    return "http_error";
}
const HINTS = {
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
export class DescriptApiError extends Error {
    status;
    category;
    body;
    hint;
    retryAfterSeconds;
    rateLimitRemaining;
    rateLimitConsumed;
    constructor(status, body, meta = {}) {
        const category = categoryForStatus(status);
        const summary = body?.message || body?.error || `HTTP ${status}`;
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
