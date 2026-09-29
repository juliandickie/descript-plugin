import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../../src/cli/index.js";
import { DescriptApiError } from "../../src/client/errors.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());

// =========================================================================
// The API's 400 body carries the useful part in `details`, for example
// {"details":[{"message":"\"folder_id\" must be a valid GUID","path":["folder_id"]}]}.
// Human mode lists each detail message on its own line before the Hint;
// --json output is unchanged (it already carries the body).
// =========================================================================

const ENV = { DESCRIPT_API_TOKEN: "t" };

interface Run { code: number; out: string; err: string }

async function run(argv: string[], status: number, json: unknown): Promise<Run> {
  installMockFetch([{ status, json }]);
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: ENV, stdout: (s) => out.push(s), stderr: (s) => err.push(s) });
  return { code, out: out.join(""), err: err.join("") };
}

const BODY = {
  error: "bad_request",
  message: "Invalid request payload input",
  details: [{ message: "\"folder_id\" must be a valid GUID", path: ["folder_id"] }]
};
const HINT = new DescriptApiError(400, BODY).hint;

test("a 400 with details lists each detail message on its own line, before the Hint", async () => {
  const r = await run(["jobs", "get", "j1"], 400, BODY);
  assert.equal(r.code, 3);
  assert.equal(r.err, [
    "Descript API error 400 (bad_request): Invalid request payload input",
    "  - \"folder_id\" must be a valid GUID",
    `Hint: ${HINT}`,
    ""
  ].join("\n"));
  assert.equal(r.out, "");
});

test("several details each get their own line, in the order the API sent them", async () => {
  const body = { ...BODY, details: [
    { message: "\"project_id\" must be a valid GUID", path: ["project_id"] },
    { message: "\"format\" must be one of [edl, sesx]", path: ["format"] },
    { message: "\"callback_url\" must be a valid uri", path: ["callback_url"] }
  ] };
  const r = await run(["jobs", "get", "j1"], 400, body);
  assert.equal(r.err, [
    "Descript API error 400 (bad_request): Invalid request payload input",
    "  - \"project_id\" must be a valid GUID",
    "  - \"format\" must be one of [edl, sesx]",
    "  - \"callback_url\" must be a valid uri",
    `Hint: ${HINT}`,
    ""
  ].join("\n"));
});

test("a body with no details prints exactly what it did before", async () => {
  const r = await run(["jobs", "get", "j1"], 400, { error: "bad_request", message: "Invalid request payload input" });
  assert.equal(r.err, `Descript API error 400 (bad_request): Invalid request payload input\nHint: ${HINT}\n`);
});

test("details that are not a list of messages are skipped, never printed as noise", async () => {
  for (const details of [undefined, null, "oops", {}, [], [{ path: ["x"] }], [{ message: "" }], [null, 7, "text"]]) {
    const r = await run(["jobs", "get", "j1"], 400, { error: "bad_request", message: "Invalid request payload input", details });
    assert.equal(r.err, `Descript API error 400 (bad_request): Invalid request payload input\nHint: ${HINT}\n`, JSON.stringify(details));
  }
  const mixed = await run(["jobs", "get", "j1"], 400, { ...BODY, details: [{ path: ["a"] }, { message: "\"b\" is required", path: ["b"] }] });
  assert.equal(mixed.err, `Descript API error 400 (bad_request): Invalid request payload input\n  - "b" is required\nHint: ${HINT}\n`);
});

test("--json output is unchanged - the error string has no detail lines and the body rides along as detail", async () => {
  const r = await run(["jobs", "get", "j1", "--json"], 400, BODY);
  assert.equal(r.code, 3);
  assert.deepEqual(JSON.parse(r.err), {
    error: `Descript API error 400 (bad_request): Invalid request payload input\nHint: ${HINT}`,
    detail: BODY
  });
  assert.equal(r.out, "");
});

test("details are also listed for other statuses that carry them", async () => {
  const r = await run(["jobs", "get", "j1"], 422, { error: "unprocessable", message: "Cannot process", details: [{ message: "publish target is invalid" }] });
  assert.equal(r.code, 3);
  assert.match(r.err, /Cannot process\n {2}- publish target is invalid\nHint: /);
});
