import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { HttpClient } from "../../src/client/http.js";
import { DescriptClient } from "../../src/client/index.js";
import { search } from "../../src/client/search.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";
afterEach(() => restoreFetch());
const http = () => new HttpClient({ token: "t" });
const paramsOf = (url) => new URL(url).searchParams;
test("search GETs /search with the query term and bearer auth", async () => {
    const { calls } = installMockFetch([{ status: 200, json: { results: [] } }]);
    await search(http(), { query: "quarterly update" });
    assert.equal(calls[0].method, "GET");
    const url = new URL(calls[0].url);
    assert.equal(url.origin + url.pathname, "https://descriptapi.com/v1/search");
    assert.equal(url.searchParams.get("query"), "quarterly update");
    assert.equal(calls[0].headers["authorization"], "Bearer t");
    assert.equal(calls[0].body, undefined);
});
test("search sends type, match and owner as repeated keys, not a joined value", async () => {
    const { calls } = installMockFetch([{ status: 200, json: { results: [] } }]);
    await search(http(), {
        query: "q",
        type: ["project", "audio"],
        match: ["name", "content"],
        owner: ["3fa85f64-5717-4562-b3fc-2c963f66afa6", "9f36ee32-5a2c-47e7-b1a3-94991d3e3ddb"]
    });
    const p = paramsOf(calls[0].url);
    assert.deepEqual(p.getAll("type"), ["project", "audio"]);
    assert.deepEqual(p.getAll("match"), ["name", "content"]);
    assert.deepEqual(p.getAll("owner"), ["3fa85f64-5717-4562-b3fc-2c963f66afa6", "9f36ee32-5a2c-47e7-b1a3-94991d3e3ddb"]);
    assert.ok(calls[0].url.includes("type=project&type=audio"), `expected repeated type keys: ${calls[0].url}`);
    assert.ok(!calls[0].url.includes("%2C") && !calls[0].url.includes(","), `no comma-joined values expected: ${calls[0].url}`);
});
test("search omits every param that was not set, including empty arrays", async () => {
    const { calls } = installMockFetch([{ status: 200, json: { results: [] } }]);
    await search(http(), { query: "q" });
    assert.deepEqual([...paramsOf(calls[0].url).keys()], ["query"]);
    restoreFetch();
    const second = installMockFetch([{ status: 200, json: { results: [] } }]);
    await search(http(), { query: "q", type: [], match: [], owner: [] });
    assert.deepEqual([...paramsOf(second.calls[0].url).keys()], ["query"]);
});
test("search forwards updated_after, updated_before, sort and limit", async () => {
    const { calls } = installMockFetch([{ status: 200, json: { results: [] } }]);
    await search(http(), { query: "q", updated_after: "2026-08-01", updated_before: "2026-08-31T23:59:59Z", sort: "newest", limit: 100 });
    const p = paramsOf(calls[0].url);
    assert.equal(p.get("updated_after"), "2026-08-01");
    assert.equal(p.get("updated_before"), "2026-08-31T23:59:59Z");
    assert.equal(p.get("sort"), "newest");
    assert.equal(p.get("limit"), "100");
});
test("search returns the parsed response untouched", async () => {
    const body = { results: [
            { type: "project", project_id: "p1", name: "Quarterly update", url: "https://web.descript.com/p1", updated_at: "2026-08-15T14:00:00.000Z" },
            { type: "video", asset_id: "a1", name: "standup.mp4", location: "media_library", url: "https://web.descript.com/a1", updated_at: "2026-08-12T09:30:00.000Z", duration: 184.5 }
        ] };
    installMockFetch([{ status: 200, json: body }]);
    assert.deepEqual(await search(http(), { query: "q" }), body);
});
test("DescriptClient.search delegates to GET /search", async () => {
    const { calls } = installMockFetch([{ status: 200, json: { results: [] } }]);
    const r = await new DescriptClient({ token: "t" }).search({ query: "phrase", match: ["content"] });
    assert.deepEqual(r, { results: [] });
    const p = paramsOf(calls[0].url);
    assert.equal(p.get("query"), "phrase");
    assert.deepEqual(p.getAll("match"), ["content"]);
});
