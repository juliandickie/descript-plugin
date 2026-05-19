import { test } from "node:test";
import assert from "node:assert/strict";
import { formatStatus } from "../src/cli/commands/status.js";

// Any 2xx on /status means the token authenticated (a 401 throws before the
// formatter is reached). The line must always be truthful and must never
// contain the literal word "undefined".

test("reports authenticated with drive and api for the live /status shape", () => {
  const line = formatStatus({ drive_id: "a563a718-f83c-413c-b158-9ec7055eb30e", api_version: "v1" });
  assert.ok(!line.includes("undefined"), `line leaked "undefined": ${line}`);
  assert.match(line, /a563a718-f83c-413c-b158-9ec7055eb30e/);
  assert.match(line, /v1/);
  assert.match(line, /authenticat/i);
});

test("still reports authenticated for the documented {status:'ok'} shape", () => {
  const line = formatStatus({ status: "ok" });
  assert.ok(!line.includes("undefined"), `line leaked "undefined": ${line}`);
  assert.match(line, /ok/);
  assert.match(line, /authenticat/i);
});

test("does not crash or print 'undefined' when /status body is empty (204 / empty 2xx)", () => {
  const line = formatStatus(undefined);
  assert.equal(typeof line, "string");
  assert.ok(!line.includes("undefined"), `line leaked "undefined": ${line}`);
  assert.match(line, /authenticat/i);
});
