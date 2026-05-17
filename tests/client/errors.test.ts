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
