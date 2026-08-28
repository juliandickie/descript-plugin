import { test, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { DescriptClient } from "../../src/client/index.js";
import { installMockFetch, installMockFetchByUrl, restoreFetch } from "../helpers/mockFetch.js";
import { exportBatch } from "../../src/workflows/exportBatch.js";
afterEach(() => restoreFetch());
const SAMPLE_VTT = `WEBVTT

00:00:00.000 --> 00:00:02.400
Ben: First.
`;
test("size-1 download-mode batch writes files and download-report.json", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-batch-"));
    installMockFetch([
        {
            status: 200,
            json: {
                download_url: "https://gcs.example/T.mp4?sig=abc",
                project_id: "p", publish_type: "video", privacy: "private",
                metadata: { title: "T" }, subtitles: SAMPLE_VTT
            }
        },
        { status: 200, text: "mp4" }
    ]);
    const client = new DescriptClient({ token: "t" });
    const report = await exportBatch(client, {
        items: [{ slug: "abc-123" }],
        outputDir: dir,
        formats: ["mp4", "srt", "md"],
        endMarker: false,
        concurrency: 2,
        command: "download-published"
    });
    assert.equal(report.ok, true);
    assert.equal(report.command, "download-published");
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0].slug, "abc-123");
    assert.deepEqual(report.items[0].written, ["mp4", "srt", "md"]);
    const reportPath = join(dir, "download-report.json");
    assert.ok(existsSync(reportPath));
    const persisted = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(persisted.ok, true);
    assert.equal(persisted.items.length, 1);
    rmSync(dir, { recursive: true, force: true });
});
test("preserves report ordering by input position even with concurrency=N", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-batch-"));
    // Three slugs, each needs a metadata + a curl response. Mock responses are
    // consumed in submission order but each item completes after its own pair.
    installMockFetch([
        { status: 200, json: { download_url: "https://gcs/A.mp4?s=1", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "A" }, subtitles: SAMPLE_VTT } },
        { status: 200, text: "A" },
        { status: 200, json: { download_url: "https://gcs/B.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "B" }, subtitles: SAMPLE_VTT } },
        { status: 200, text: "B" },
        { status: 200, json: { download_url: "https://gcs/C.mp4?s=3", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "C" }, subtitles: SAMPLE_VTT } },
        { status: 200, text: "C" }
    ]);
    const client = new DescriptClient({ token: "t" });
    const report = await exportBatch(client, {
        items: [{ slug: "a" }, { slug: "b" }, { slug: "c" }],
        outputDir: dir, formats: ["mp4"], endMarker: false, concurrency: 3,
        command: "download-published"
    });
    assert.equal(report.items.length, 3);
    assert.equal(report.items[0].slug, "a");
    assert.equal(report.items[1].slug, "b");
    assert.equal(report.items[2].slug, "c");
    rmSync(dir, { recursive: true, force: true });
});
test("concurrency=1 (serial) also preserves ordering", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-batch-"));
    installMockFetch([
        { status: 200, json: { download_url: "https://gcs/A.mp4?s=1", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "A" }, subtitles: SAMPLE_VTT } },
        { status: 200, text: "A" },
        { status: 200, json: { download_url: "https://gcs/B.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "B" }, subtitles: SAMPLE_VTT } },
        { status: 200, text: "B" }
    ]);
    const client = new DescriptClient({ token: "t" });
    const report = await exportBatch(client, {
        items: [{ slug: "a" }, { slug: "b" }],
        outputDir: dir, formats: ["mp4"], endMarker: false, concurrency: 1,
        command: "download-published"
    });
    assert.equal(report.items[0].slug, "a");
    assert.equal(report.items[1].slug, "b");
    rmSync(dir, { recursive: true, force: true });
});
test("one item fails but others succeed; report.ok false, per-item ok accurate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-batch-"));
    installMockFetch([
        { status: 200, json: { download_url: "https://gcs/A.mp4?s=1", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "A" }, subtitles: SAMPLE_VTT } },
        { status: 200, text: "A" },
        { status: 404, json: { error: "not found", message: "slug not found" } }
    ]);
    const client = new DescriptClient({ token: "t" });
    const report = await exportBatch(client, {
        items: [{ slug: "ok" }, { slug: "bad" }],
        outputDir: dir, formats: ["mp4"], endMarker: false, concurrency: 1,
        command: "download-published"
    });
    assert.equal(report.ok, false);
    assert.equal(report.items[0].ok, true);
    assert.equal(report.items[1].ok, false);
    assert.ok(report.items[1].failed.length >= 1);
    rmSync(dir, { recursive: true, force: true });
});
// concurrency>1 failure isolation: uses installMockFetchByUrl so that
// responses are routed by slug regardless of worker interleaving order.
// item "ok1" and "ok2" succeed; item "bad" hits a 404 on metadata.
// With concurrency=2, the two workers race but each item's fate is
// determined by its slug, not queue position.
test("concurrency=2 failure isolation: failed item does not affect sibling items", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-batch-"));
    installMockFetchByUrl([
        {
            match: "/published_projects/bad",
            responses: [{ status: 404, json: { error: "not found", message: "slug not found" } }]
        },
        {
            match: "gcs.example",
            responses: [
                { status: 200, text: "ok1-bytes" },
                { status: 200, text: "ok2-bytes" }
            ]
        },
        {
            match: "/published_projects/",
            responses: [
                {
                    status: 200,
                    json: { download_url: "https://gcs.example/A.mp4?s=1", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "Ok1" }, subtitles: SAMPLE_VTT }
                },
                {
                    status: 200,
                    json: { download_url: "https://gcs.example/B.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "Ok2" }, subtitles: SAMPLE_VTT }
                }
            ]
        }
    ]);
    const client = new DescriptClient({ token: "t" });
    const report = await exportBatch(client, {
        items: [{ slug: "ok1" }, { slug: "bad" }, { slug: "ok2" }],
        outputDir: dir, formats: ["mp4"], endMarker: false, concurrency: 2,
        command: "download-published"
    });
    assert.equal(report.ok, false);
    assert.equal(report.items.length, 3);
    assert.equal(report.items[0].slug, "ok1");
    assert.equal(report.items[0].ok, true);
    assert.equal(report.items[1].slug, "bad");
    assert.equal(report.items[1].ok, false);
    assert.ok(report.items[1].failed.length >= 1);
    assert.equal(report.items[2].slug, "ok2");
    assert.equal(report.items[2].ok, true);
    rmSync(dir, { recursive: true, force: true });
});
test("multi-project items use projectFolder for two-level nesting", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-batch-"));
    installMockFetch([
        { status: 200, json: { download_url: "https://gcs/X.mp4?s=1", project_id: "p1", publish_type: "video", privacy: "private", metadata: { title: "Comp A" }, subtitles: SAMPLE_VTT } },
        { status: 200, text: "X" },
        { status: 200, json: { download_url: "https://gcs/Y.mp4?s=2", project_id: "p2", publish_type: "video", privacy: "private", metadata: { title: "Comp B" }, subtitles: SAMPLE_VTT } },
        { status: 200, text: "Y" }
    ]);
    const client = new DescriptClient({ token: "t" });
    const report = await exportBatch(client, {
        items: [
            { slug: "a", projectFolder: "Project One" },
            { slug: "b", projectFolder: "Project Two" }
        ],
        outputDir: dir, formats: ["mp4"], endMarker: false, concurrency: 1,
        command: "download-published"
    });
    assert.equal(report.ok, true);
    assert.ok(existsSync(join(dir, "Project One", "Comp A", "Comp A.mp4")));
    assert.ok(existsSync(join(dir, "Project Two", "Comp B", "Comp B.mp4")));
    rmSync(dir, { recursive: true, force: true });
});
test("publish-mode item: publish then download in one go", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-batch-"));
    installMockFetch([
        // 1. POST /jobs/publish -> submit job
        { status: 201, json: { job_id: "j1", drive_id: "d", project_id: "p", project_url: "u" } },
        // 2. GET /jobs/j1 -> stopped with result
        {
            status: 200,
            json: {
                job_id: "j1", job_type: "publish", job_state: "stopped", created_at: "t",
                drive_id: "d", project_id: "p", project_url: "u",
                result: {
                    status: "success",
                    share_url: "https://web.descript.com/p/view/slug-xyz",
                    download_url: "https://gcs/X.mp4?s=1",
                    download_url_expires_at: "2026-05-21T00:00:00Z"
                }
            }
        },
        // 3. GET /published_projects/slug-xyz
        {
            status: 200,
            json: {
                download_url: "https://gcs/X.mp4?s=2", project_id: "p",
                publish_type: "video", privacy: "private",
                metadata: { title: "X" }, subtitles: SAMPLE_VTT
            }
        },
        // 4. GCS curl
        { status: 200, text: "X-bytes" }
    ]);
    const client = new DescriptClient({ token: "t" });
    const report = await exportBatch(client, {
        items: [{ projectId: "p", compositionId: "c" }],
        outputDir: dir,
        formats: ["mp4", "srt", "md"],
        endMarker: false,
        concurrency: 1,
        command: "export",
        publish: { mediaType: "Video", resolution: "1080p", accessLevel: "private" }
    });
    assert.equal(report.ok, true);
    assert.equal(report.items[0].slug, "slug-xyz");
    assert.equal(report.items[0].title, "X");
    assert.deepEqual(report.items[0].written, ["mp4", "srt", "md"]);
    assert.ok(existsSync(join(dir, "X", "X.mp4")));
    rmSync(dir, { recursive: true, force: true });
});
// v0.6.0 - folder collision fix (field report 2026-08-27-translated-srt-findings.md).
// Regional translation variants of the same composition publish under
// identical titles; without a batch-scoped claim, the second item's folder
// derivation collides with the first and silently overwrites its files.
test("exportBatch disambiguates colliding titles into distinct folders", async () => {
    installMockFetchByUrl([
        { match: "/jobs/publish", responses: [
                { status: 201, json: { job_id: "j1", drive_id: "d", project_id: "p1", project_url: "u" } },
                { status: 201, json: { job_id: "j2", drive_id: "d", project_id: "p1", project_url: "u" } }
            ] },
        { match: "/jobs/j1", responses: [{ status: 200, json: { job_id: "j1", job_type: "publish", job_state: "stopped", created_at: "a", drive_id: "d", project_id: "p1", project_url: "u", result: { status: "success", composition_id: "c1", share_url: "https://share.descript.com/view/slugAAA" } } }] },
        { match: "/jobs/j2", responses: [{ status: 200, json: { job_id: "j2", job_type: "publish", job_state: "stopped", created_at: "a", drive_id: "d", project_id: "p1", project_url: "u", result: { status: "success", composition_id: "c2", share_url: "https://share.descript.com/view/slugBBB" } } }] },
        { match: "published_projects/slugAAA", responses: [{ status: 200, json: { project_id: "p1", publish_type: "video", privacy: "private", metadata: { title: "759K vues - identical title" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nBonjour" } }] },
        { match: "published_projects/slugBBB", responses: [{ status: 200, json: { project_id: "p1", publish_type: "video", privacy: "private", metadata: { title: "759K vues - identical title" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nBienvenue" } }] }
    ]);
    const dir = mkdtempSync(join(tmpdir(), "collide-"));
    const client = new DescriptClient({ token: "t" });
    const report = await exportBatch(client, {
        items: [
            { projectId: "p1", compositionId: "c1" },
            { projectId: "p1", compositionId: "c2" }
        ],
        outputDir: dir, formats: ["srt"], endMarker: false, concurrency: 1,
        command: "export",
        publish: { mediaType: "Video", resolution: "1080p", accessLevel: "private" }
    });
    assert.equal(report.ok, true);
    const dirs = report.items.map((i) => i.outputDir);
    assert.notEqual(dirs[0], dirs[1], "colliding titles must land in distinct folders");
    assert.ok(dirs[1].includes("slugBBB"), "second claimant folder carries its slug");
    // Filenames mirror the folder-name derivation (see exportPublished.ts), so
    // the claimed (possibly suffixed) folder basename is also the file's base
    // name - this is what keeps the file and its folder consistent.
    assert.ok(readFileSync(join(dirs[0], `${basename(dirs[0])}.srt`), "utf8").includes("Bonjour"));
    assert.ok(readFileSync(join(dirs[1], `${basename(dirs[1])}.srt`), "utf8").includes("Bienvenue"));
    rmSync(dir, { recursive: true, force: true });
});
// v0.6.0 - per-project publish serialization (field report 2026-08-27).
// Descript rejects a publish submission with 429 "A publish job is already
// running for this project" while any publish for the SAME project is in
// flight - one publish per project at a time. Same-project items must chain
// serially even when the batch concurrency allows more parallelism; the pool
// still parallelizes across different projects.
test("same-project publish submissions never overlap even at high concurrency", async () => {
    // Deferred publish mocks: track how many publishes are in flight per project.
    let inFlight = 0, maxInFlight = 0;
    const resolvers = [];
    mock.method(globalThis, "fetch", async (input, init = {}) => {
        const url = String(input);
        if (url.includes("/jobs/publish")) {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((r) => resolvers.push(r));
            inFlight -= 1;
            const n = resolvers.length;
            return new Response(JSON.stringify({ job_id: `j${n}`, drive_id: "d", project_id: "p1", project_url: "u" }), { status: 201 });
        }
        if (url.includes("/jobs/j")) {
            const id = url.split("/").pop();
            return new Response(JSON.stringify({ job_id: id, job_type: "publish", job_state: "stopped", created_at: "a", drive_id: "d", project_id: "p1", project_url: "u", result: { status: "success", composition_id: "c", share_url: `https://share.descript.com/view/slug${id}` } }), { status: 200 });
        }
        if (url.includes("published_projects/")) {
            const slug = url.split("/").pop();
            return new Response(JSON.stringify({ project_id: "p1", publish_type: "video", privacy: "private", metadata: { title: `T ${slug}` }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx" }), { status: 200 });
        }
        throw new Error(`unexpected url ${url}`);
    });
    const dir = mkdtempSync(join(tmpdir(), "serial-"));
    const p = exportBatch(new DescriptClient({ token: "t" }), {
        items: [
            { projectId: "p1", compositionId: "c1" },
            { projectId: "p1", compositionId: "c2" },
            { projectId: "p1", compositionId: "c3" }
        ],
        outputDir: dir, formats: ["srt"], endMarker: false, concurrency: 5,
        command: "export",
        publish: { mediaType: "Video", resolution: "1080p", accessLevel: "private" }
    });
    // Release in-flight submissions one at a time as they appear.
    while (resolvers.length < 1)
        await new Promise((r) => setTimeout(r, 5));
    for (let released = 0; released < 3; released++) {
        resolvers[released]();
        if (released < 2)
            while (resolvers.length < released + 2)
                await new Promise((r) => setTimeout(r, 5));
    }
    const report = await p;
    assert.equal(maxInFlight, 1, "same-project publishes must be serial");
    assert.equal(report.items.filter((i) => i.ok).length, 3);
    rmSync(dir, { recursive: true, force: true });
});
test("already-running 429 waits and retries instead of failing the item", async () => {
    const sleeps = [];
    const seq = [
        { status: 429, json: { error: "rate_limited", message: "A publish job is already running for this project. Please wait for it to complete." } },
        { status: 429, json: { error: "rate_limited", message: "A publish job is already running for this project. Please wait for it to complete." } },
        { status: 201, json: { job_id: "j1", drive_id: "d", project_id: "p1", project_url: "u" } }
    ];
    // The HttpClient itself retries 429s honoring Retry-After; construct the
    // client with maxRetries: 0 so each 429 surfaces to the workflow layer
    // immediately instead of being absorbed at the HTTP layer, and each
    // submission attempt consumes exactly one entry from the sequence above.
    installMockFetchByUrl([
        { match: "/jobs/publish", responses: seq },
        { match: "/jobs/j1", responses: [{ status: 200, json: { job_id: "j1", job_type: "publish", job_state: "stopped", created_at: "a", drive_id: "d", project_id: "p1", project_url: "u", result: { status: "success", composition_id: "c1", share_url: "https://share.descript.com/view/slugZ" } } }] },
        { match: "published_projects/slugZ", responses: [{ status: 200, json: { project_id: "p1", publish_type: "video", privacy: "private", metadata: { title: "T" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx" } }] }
    ]);
    const dir = mkdtempSync(join(tmpdir(), "wait-"));
    const report = await exportBatch(new DescriptClient({ token: "t", maxRetries: 0 }), {
        items: [{ projectId: "p1", compositionId: "c1" }],
        outputDir: dir, formats: ["srt"], endMarker: false, concurrency: 1,
        command: "export",
        publish: { mediaType: "Video", resolution: "1080p", accessLevel: "private" },
        sleep: async (ms) => { sleeps.push(ms); }
    });
    assert.equal(report.items[0].ok, true);
    assert.deepEqual(sleeps, [30000, 30000]);
    rmSync(dir, { recursive: true, force: true });
});
// Fix pass (code review finding): the first version of this retry wrapped
// the ENTIRE publishAndWait call (submit + poll). An "already running"
// error surfacing from the POLL rather than the submission would have
// re-entered the loop and fired a second, duplicate publishJob call,
// orphaning the first job. The retry now lives inside publishAndWait,
// scoped to ONLY the initial client.publishJob call (see
// src/workflows/publishAndWait.ts SubmitRetryOptions) - a poll-time or
// job-status error must always fail the item outright, never resubmit.
test("a post-submission already-running error never triggers a duplicate publish submission", async () => {
    const sleeps = [];
    const { calls } = installMockFetchByUrl([
        { match: "/jobs/publish", responses: [{ status: 201, json: { job_id: "j1", drive_id: "d", project_id: "p1", project_url: "u" } }] },
        { match: "/jobs/j1", responses: [{ status: 429, json: { error: "rate_limited", message: "A publish job is already running for this project. Please wait for it to complete." } }] }
    ]);
    const dir = mkdtempSync(join(tmpdir(), "nodupe-"));
    const report = await exportBatch(new DescriptClient({ token: "t", maxRetries: 0 }), {
        items: [{ projectId: "p1", compositionId: "c1" }],
        outputDir: dir, formats: ["srt"], endMarker: false, concurrency: 1,
        command: "export",
        publish: { mediaType: "Video", resolution: "1080p", accessLevel: "private" },
        sleep: async (ms) => { sleeps.push(ms); }
    });
    const submissions = calls.filter((c) => c.url.includes("/jobs/publish")).length;
    assert.equal(submissions, 1, "a poll-time error must never trigger a second submission");
    assert.equal(report.items[0].ok, false);
    assert.deepEqual(sleeps, [], "the submission retry must never fire for a post-submission error");
    rmSync(dir, { recursive: true, force: true });
});
test("already-running 429 exhausts after 10 retries (11 total attempts) and fails with the original error", async () => {
    const sleeps = [];
    const alreadyRunning = { status: 429, json: { error: "rate_limited", message: "A publish job is already running for this project. Please wait for it to complete." } };
    const { calls } = installMockFetchByUrl([
        { match: "/jobs/publish", responses: Array.from({ length: 11 }, () => alreadyRunning) }
    ]);
    const dir = mkdtempSync(join(tmpdir(), "exhaust-"));
    const report = await exportBatch(new DescriptClient({ token: "t", maxRetries: 0 }), {
        items: [{ projectId: "p1", compositionId: "c1" }],
        outputDir: dir, formats: ["srt"], endMarker: false, concurrency: 1,
        command: "export",
        publish: { mediaType: "Video", resolution: "1080p", accessLevel: "private" },
        sleep: async (ms) => { sleeps.push(ms); }
    });
    const submissions = calls.filter((c) => c.url.includes("/jobs/publish")).length;
    assert.equal(submissions, 11, "initial attempt plus 10 retries");
    assert.deepEqual(sleeps, Array(10).fill(30000));
    assert.equal(report.items[0].ok, false);
    assert.ok(report.items[0].failed[0].error.includes("publish job is already running"), "surfaces the original qualifying error");
    rmSync(dir, { recursive: true, force: true });
});
