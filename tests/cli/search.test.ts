import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../../src/cli/index.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());

const ENV = { DESCRIPT_API_TOKEN: "t" };
const OWNER_A = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const OWNER_B = "9f36ee32-5a2c-47e7-b1a3-94991d3e3ddb";

interface Run { code: number; stdout: string; stderr: string; calls: ReturnType<typeof installMockFetch>["calls"] }

async function run(argv: string[], responses: Parameters<typeof installMockFetch>[0] = [{ status: 200, json: { results: [] } }]): Promise<Run> {
  const { calls } = installMockFetch(responses);
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, { env: ENV, stdout: (s) => { stdout += s; }, stderr: (s) => { stderr += s; } });
  return { code, stdout, stderr, calls };
}

const params = (r: Run) => new URL(r.calls[0]!.url).searchParams;

// One result of every kind the API returns (shapes from docs/descript-openapi.json SearchResponse).
const PROJECT = { type: "project", project_id: "9f36ee32-5a2c-47e7-b1a3-94991d3e3ddb", name: "Quarterly update", url: "https://web.descript.com/9f36ee32", owner: { id: OWNER_A, name: "Ada Lovelace" }, updated_at: "2026-08-15T14:00:00.000Z" };
const LAYOUT_PACK = { type: "layout_pack", project_id: "1c2d3e4f-0000-4000-8000-000000000001", name: "Brand layouts", url: "https://web.descript.com/1c2d3e4f", updated_at: "2026-08-10T00:00:00.000Z" };
const VIDEO = { type: "video", asset_id: "6dc3f30a-58c2-4174-96a6-dc18cf3c7776", name: "standup.mp4", location: "media_library", url: "https://web.descript.com/media/6dc3f30a", thumbnail_url: "https://cdn.example/t.jpg?sig=x", owner: { id: OWNER_A, name: "Ada Lovelace" }, updated_at: "2026-08-12T09:30:00.000Z", duration: 184.5 };
const IMAGE = { type: "image", asset_id: "7c1e2a90-4b3d-4f6a-9c8e-1a2b3c4d5e6f", brand_studio_id: "b5b5b5b5-0000-4000-8000-000000000002", name: "logo.png", location: "brand_studio", url: "https://web.descript.com/brand/7c1e2a90", updated_at: "2026-08-12T09:30:00.000Z" };
const AUDIO = { type: "audio", asset_id: "0a0a0a0a-0000-4000-8000-000000000003", project_id: "9f36ee32-5a2c-47e7-b1a3-94991d3e3ddb", name: "L1-02 - Crowns.m4a", location: "project", url: "https://web.descript.com/9f36ee32?asset=0a0a0a0a", updated_at: "2026-08-11T08:00:00.000Z", duration: 1907.072 };
const PROJECT_FOLDER = { type: "project_folder", folder_id: "f1f1f1f1-0000-4000-8000-000000000004", name: "Courses - Online", url: "https://web.descript.com/folder/f1f1f1f1", updated_at: "2026-07-01T00:00:00.000Z" };
const LIBRARY_FOLDER = { type: "media_library_folder", folder_id: "f2f2f2f2-0000-4000-8000-000000000005", name: "B-roll", location: "media_library", url: "https://web.descript.com/library/f2f2f2f2", updated_at: "2026-07-02T00:00:00.000Z" };
const ALL_KINDS = [PROJECT, LAYOUT_PACK, VIDEO, IMAGE, AUDIO, PROJECT_FOLDER, LIBRARY_FOLDER];

// ---------------------------------------------------------------------------
// Human output
// ---------------------------------------------------------------------------

test("search prints one line per result for every result kind, then a count", async () => {
  const r = await run(["search", "quarterly"], [{ status: 200, json: { results: ALL_KINDS } }]);
  assert.equal(r.code, 0, r.stderr);
  const w = (t: string) => t.padEnd(20);
  assert.equal(r.stdout, [
    `${w("project")}  Quarterly update  9f36ee32-5a2c-47e7-b1a3-94991d3e3ddb  https://web.descript.com/9f36ee32`,
    `${w("layout_pack")}  Brand layouts  1c2d3e4f-0000-4000-8000-000000000001  https://web.descript.com/1c2d3e4f`,
    `${w("video")}  standup.mp4  6dc3f30a-58c2-4174-96a6-dc18cf3c7776  https://web.descript.com/media/6dc3f30a  (media_library, 185s)`,
    `${w("image")}  logo.png  7c1e2a90-4b3d-4f6a-9c8e-1a2b3c4d5e6f  https://web.descript.com/brand/7c1e2a90  (brand_studio)`,
    `${w("audio")}  L1-02 - Crowns.m4a  0a0a0a0a-0000-4000-8000-000000000003  https://web.descript.com/9f36ee32?asset=0a0a0a0a  (project, 1907s)`,
    `${w("project_folder")}  Courses - Online  f1f1f1f1-0000-4000-8000-000000000004  https://web.descript.com/folder/f1f1f1f1`,
    `${w("media_library_folder")}  B-roll  f2f2f2f2-0000-4000-8000-000000000005  https://web.descript.com/library/f2f2f2f2`,
    "7 results",
    ""
  ].join("\n"));
  assert.equal(r.stderr, "");
});

test("search pads the type column to the widest type present, so a project-only list is not over-padded", async () => {
  const r = await run(["search", "q"], [{ status: 200, json: { results: [PROJECT] } }]);
  assert.equal(r.stdout, "project  Quarterly update  9f36ee32-5a2c-47e7-b1a3-94991d3e3ddb  https://web.descript.com/9f36ee32\n1 result\n");
});

test("search keeps every result on one line even when a name contains whitespace runs or newlines", async () => {
  const r = await run(["search", "q"], [{ status: 200, json: { results: [{ ...PROJECT, name: "Two\nline   name" }] } }]);
  const lines = r.stdout.split("\n").filter(Boolean);
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /^project {2}Two line name {2}9f36ee32-/);
});

test("search with no results prints No results and exits 0", async () => {
  const r = await run(["search", "zzz"], [{ status: 200, json: { results: [] } }]);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "No results\n");
});

test("search --json prints the raw API response untouched", async () => {
  const body = { results: ALL_KINDS };
  const r = await run(["search", "quarterly", "--json"], [{ status: 200, json: body }]);
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.stdout), body);
});

test("search --json with no results prints the empty results object", async () => {
  const r = await run(["search", "zzz", "--json"], [{ status: 200, json: { results: [] } }]);
  assert.deepEqual(JSON.parse(r.stdout), { results: [] });
});

// ---------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------

test("search joins every positional word into one query with single spaces", async () => {
  const r = await run(["search", "quarterly", "update", "plan"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.calls.length, 1);
  assert.equal(params(r).get("query"), "quarterly update plan");
});

test("search accepts a single quoted phrase and flags placed before the query", async () => {
  const one = await run(["search", "quarterly update"]);
  assert.equal(params(one).get("query"), "quarterly update");
  restoreFetch();
  const flagFirst = await run(["search", "--sort", "newest", "quarterly", "update"]);
  assert.equal(flagFirst.code, 0, flagFirst.stderr);
  assert.equal(params(flagFirst).get("query"), "quarterly update");
  assert.equal(params(flagFirst).get("sort"), "newest");
});

test("search with no flags sends only the query", async () => {
  const r = await run(["search", "crowns"]);
  assert.deepEqual([...params(r).keys()], ["query"]);
  assert.equal(new URL(r.calls[0]!.url).pathname, "/v1/search");
  assert.equal(r.calls[0]!.method, "GET");
});

test("search turns comma-separated list flags into repeated query keys", async () => {
  const r = await run(["search", "crowns", "--type", "project,audio", "--match", "name,content", "--owner", `${OWNER_A},${OWNER_B}`]);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(params(r).getAll("type"), ["project", "audio"]);
  assert.deepEqual(params(r).getAll("match"), ["name", "content"]);
  assert.deepEqual(params(r).getAll("owner"), [OWNER_A, OWNER_B]);
  assert.ok(r.calls[0]!.url.includes("type=project&type=audio"), r.calls[0]!.url);
});

test("search forwards --updated-after, --updated-before, --sort and --limit", async () => {
  const r = await run(["search", "crowns", "--updated-after", "2026-08-01", "--updated-before", "2026-08-31T23:59:59Z", "--sort", "oldest", "--limit", "100"]);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(params(r).get("updated_after"), "2026-08-01");
  assert.equal(params(r).get("updated_before"), "2026-08-31T23:59:59Z");
  assert.equal(params(r).get("sort"), "oldest");
  assert.equal(params(r).get("limit"), "100");
});

test("search accepts every documented type, match and sort value", async () => {
  const types = "project,video,image,audio,project_folder,media_library_folder,layout_pack";
  const r = await run(["search", "q", "--type", types, "--match", "name,content", "--sort", "relevance", "--limit", "1"]);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(params(r).getAll("type"), types.split(","));
  for (const sort of ["relevance", "newest", "oldest"]) {
    restoreFetch();
    const s = await run(["search", "q", "--sort", sort]);
    assert.equal(s.code, 0, `${sort}: ${s.stderr}`);
  }
});

test("search list flags tolerate spaces, empty elements and duplicates", async () => {
  const r = await run(["search", "q", "--type", "project, audio,,project"]);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(params(r).getAll("type"), ["project", "audio"]);
});

test("search accepts --flag=value syntax", async () => {
  const r = await run(["search", "q", "--type=project_folder", "--limit=5", "--sort=oldest"]);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(params(r).getAll("type"), ["project_folder"]);
  assert.equal(params(r).get("limit"), "5");
  assert.equal(params(r).get("sort"), "oldest");
});

// ---------------------------------------------------------------------------
// Usage errors - exit 2, message says what is wrong, and no API call is made
// ---------------------------------------------------------------------------

test("search without a query is a usage error and makes no API call", async () => {
  const r = await run(["search"]);
  assert.equal(r.code, 2);
  assert.equal(r.calls.length, 0);
  assert.match(r.stderr, /query/i);
  assert.match(r.stderr, /Usage: descript search/);
});

test("search with only flags, or a blank query, is a usage error and makes no API call", async () => {
  for (const argv of [["search", "--type", "project"], ["search", "   "], ["search", "", ""], ["search", "--json"]]) {
    restoreFetch();
    const r = await run(argv);
    assert.equal(r.code, 2, argv.join(" "));
    assert.equal(r.calls.length, 0, argv.join(" "));
    assert.match(r.stderr, /Usage: descript search/, argv.join(" "));
  }
});

test("search rejects an invalid --type element, lists all seven allowed values, and makes no API call", async () => {
  const r = await run(["search", "q", "--type", "project,dubbing"]);
  assert.equal(r.code, 2);
  assert.equal(r.calls.length, 0);
  assert.match(r.stderr, /--type/);
  assert.match(r.stderr, /dubbing/);
  for (const t of ["project", "video", "image", "audio", "project_folder", "media_library_folder", "layout_pack"]) {
    assert.ok(r.stderr.includes(t), `message should list ${t}: ${r.stderr}`);
  }
});

test("search rejects an invalid --match element and lists name and content", async () => {
  const r = await run(["search", "q", "--match", "name,transcript"]);
  assert.equal(r.code, 2);
  assert.equal(r.calls.length, 0);
  assert.match(r.stderr, /--match/);
  assert.match(r.stderr, /transcript/);
  assert.match(r.stderr, /name, content/);
});

test("search rejects an invalid --sort and lists relevance, newest and oldest", async () => {
  const r = await run(["search", "q", "--sort", "popular"]);
  assert.equal(r.code, 2);
  assert.equal(r.calls.length, 0);
  assert.match(r.stderr, /--sort must be one of: relevance, newest, oldest/);
});

test("search rejects --limit outside 1-100 or not an integer, with no API call", async () => {
  for (const bad of ["0", "101", "abc", "2.5", "-3", ""]) {
    restoreFetch();
    const r = await run(["search", "q", `--limit=${bad}`]);
    assert.equal(r.code, 2, `--limit=${bad}`);
    assert.equal(r.calls.length, 0, `--limit=${bad}`);
    assert.match(r.stderr, /--limit must be an integer between 1 and 100/);
  }
});

test("search rejects a non-UUID --owner, quoting the bad value, with no API call", async () => {
  const r = await run(["search", "q", "--owner", `${OWNER_A},not-a-uuid`]);
  assert.equal(r.code, 2);
  assert.equal(r.calls.length, 0);
  assert.match(r.stderr, /--owner/);
  assert.match(r.stderr, /not-a-uuid/);
  assert.match(r.stderr, /UUID/);
});

test("search rejects a list or date flag that was given without a value, instead of ignoring it", async () => {
  const cases: Array<[string[], RegExp]> = [
    [["search", "q", "--type"], /^--type must include at least one of:/m],
    [["search", "q", "--type", ","], /^--type must include at least one of:/m],
    [["search", "q", "--match"], /^--match must include at least one of:/m],
    [["search", "q", "--owner"], /^--owner must include at least one user UUID/m],
    [["search", "q", "--sort"], /^--sort must be one of:/m],
    [["search", "q", "--limit"], /^--limit must be an integer between 1 and 100/m],
    [["search", "q", "--updated-after"], /^--updated-after needs a value/m],
    [["search", "q", "--updated-after="], /^--updated-after needs a value/m],
    [["search", "q", "--updated-before"], /^--updated-before needs a value/m]
  ];
  for (const [argv, message] of cases) {
    restoreFetch();
    const r = await run(argv);
    assert.equal(r.code, 2, argv.join(" "));
    assert.equal(r.calls.length, 0, argv.join(" "));
    assert.match(r.stderr, message, argv.join(" "));
  }
});

test("search rejects a flag that belongs to another command before running", async () => {
  const r = await run(["search", "q", "--folder-path", "Courses"]);
  assert.equal(r.code, 2);
  assert.equal(r.calls.length, 0);
  assert.match(r.stderr, /Unknown option/);
  assert.match(r.stderr, /Nothing was run/);
  assert.match(r.stderr, /--updated-after/);
});

test("search usage errors are reported as JSON on stderr under --json", async () => {
  const r = await run(["search", "q", "--sort", "popular", "--json"]);
  assert.equal(r.code, 2);
  assert.match(JSON.parse(r.stderr).error, /--sort must be one of/);
});

test("search needs no token to report a usage error", async () => {
  const { calls } = installMockFetch([{ status: 200, json: { results: [] } }]);
  let stderr = "";
  const code = await runCli(["search"], { env: { DESCRIPT_CONFIG_PATH: "/nonexistent/descript.json" }, stdout: () => {}, stderr: (s) => { stderr += s; } });
  assert.equal(code, 2);
  assert.equal(calls.length, 0);
  assert.match(stderr, /Usage: descript search/);
});

// ---------------------------------------------------------------------------
// API errors
// ---------------------------------------------------------------------------

test("search maps an API error to exit 3", async () => {
  const r = await run(["search", "q"], [{ status: 401, json: { error: "unauthorized", message: "bad token" } }]);
  assert.equal(r.code, 3);
  assert.match(r.stderr, /bad token/);
});

test("search 404 says search is not enabled for the token's user, not that a job or project is missing", async () => {
  const r = await run(["search", "q"], [{ status: 404, json: { error: "not_found", message: "Search is not enabled" } }]);
  assert.equal(r.code, 3);
  assert.match(r.stderr, /Search is not enabled/);
  assert.match(r.stderr, /not enabled for/i);
  assert.doesNotMatch(r.stderr, /job or project was not found/);
});

// ---------------------------------------------------------------------------
// Discoverability
// ---------------------------------------------------------------------------

test("the usage text lists the search command and its flags", async () => {
  const r = await run(["help"]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^ {2}search <query\.\.\.>/m);
  for (const flag of ["--type", "--match", "--owner", "--updated-after", "--updated-before", "--sort", "--limit"]) {
    const line = r.stdout.split("\n").find((l) => l.trimStart().startsWith("search "))!;
    assert.ok(line.includes(flag), `usage line for search should mention ${flag}: ${line}`);
  }
});
