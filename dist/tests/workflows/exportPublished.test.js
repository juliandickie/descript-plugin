import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DescriptClient } from "../../src/client/index.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";
import { exportPublished } from "../../src/workflows/exportPublished.js";
afterEach(() => restoreFetch());
const SAMPLE_VTT = `WEBVTT

00:00:00.000 --> 00:00:02.400
Ben Sorensen: First.

00:00:02.400 --> 00:00:05.800
Second.
`;
test("happy path writes all three formats with sanitised filenames", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
    installMockFetch([
        {
            status: 200,
            json: {
                download_url: "https://gcs.example/My%20Composition.mp4?sig=abc",
                download_url_expires_at: "2026-05-21T00:00:00Z",
                project_id: "p1",
                publish_type: "video",
                privacy: "private",
                metadata: { title: "My / Composition" },
                subtitles: SAMPLE_VTT
            }
        },
        { status: 200, text: "mp4-bytes-here" }
    ]);
    const client = new DescriptClient({ token: "t" });
    const result = await exportPublished(client, {
        slug: "abc-123",
        outputDir: dir,
        formats: ["mp4", "srt", "md"],
        endMarker: true
    });
    assert.equal(result.ok, true);
    assert.equal(result.slug, "abc-123");
    assert.equal(result.title, "My / Composition");
    assert.deepEqual(result.written, ["mp4", "srt", "md"]);
    assert.deepEqual(result.failed, []);
    const compDir = join(dir, "My - Composition");
    assert.ok(existsSync(join(compDir, "My - Composition.mp4")));
    assert.ok(existsSync(join(compDir, "My - Composition.srt")));
    assert.ok(existsSync(join(compDir, "My - Composition.md")));
    assert.equal(readFileSync(join(compDir, "My - Composition.mp4"), "utf8"), "mp4-bytes-here");
    assert.match(readFileSync(join(compDir, "My - Composition.md"), "utf8"), /\*\*Ben Sorensen:\*\* First\./);
    rmSync(dir, { recursive: true, force: true });
});
test("mkdir failure surfaces as a per-format failed result (not a thrown exception)", async () => {
    // Pass an output dir that cannot be created: nested under a path that
    // exists but is a file, not a directory.
    const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
    const blocker = join(dir, "blocker");
    // Create a regular file at the path where the output dir would go,
    // so mkdir cannot make it a directory.
    writeFileSync(blocker, "I am a file");
    // The composition will try to mkdir <dir>/blocker/<safeTitle>/, which fails
    // because /blocker is not a directory.
    installMockFetch([
        {
            status: 200,
            json: {
                download_url: "https://gcs.example/X.mp4?sig=abc",
                project_id: "p", publish_type: "video", privacy: "private",
                metadata: { title: "X" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\na.\n"
            }
        }
    ]);
    const client = new DescriptClient({ token: "t" });
    const result = await exportPublished(client, {
        slug: "s",
        outputDir: blocker, // a file, not a dir
        formats: ["mp4", "srt", "md"],
        endMarker: false
    });
    assert.equal(result.ok, false);
    assert.equal(result.written.length, 0);
    assert.equal(result.failed.length, 3); // all three formats failed
    assert.match(result.failed[0].error, /mkdir failed/);
    rmSync(dir, { recursive: true, force: true });
});
test("--formats md,srt skips MP4 entirely (no curl call)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
    const { calls } = installMockFetch([
        {
            status: 200,
            json: {
                download_url: "https://gcs.example/x.mp4?sig=abc",
                project_id: "p", publish_type: "video", privacy: "private",
                metadata: { title: "X" }, subtitles: SAMPLE_VTT
            }
        }
    ]);
    const client = new DescriptClient({ token: "t" });
    const result = await exportPublished(client, {
        slug: "s", outputDir: dir, formats: ["md", "srt"], endMarker: false
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.written, ["md", "srt"]);
    assert.equal(calls.length, 1, "no MP4 curl");
    assert.ok(!existsSync(join(dir, "X", "X.mp4")));
    rmSync(dir, { recursive: true, force: true });
});
test("audio publish writes .mp3 derived from URL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
    installMockFetch([
        {
            status: 200,
            json: {
                download_url: "https://gcs.example/episode-47.mp3?sig=abc",
                project_id: "p", publish_type: "audio", privacy: "private",
                metadata: { title: "Episode 47" }, subtitles: SAMPLE_VTT
            }
        },
        { status: 200, text: "mp3-bytes" }
    ]);
    const client = new DescriptClient({ token: "t" });
    const result = await exportPublished(client, {
        slug: "s", outputDir: dir, formats: ["mp4"], endMarker: false
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.written, ["mp4"]);
    assert.ok(existsSync(join(dir, "Episode 47", "Episode 47.mp3")));
    rmSync(dir, { recursive: true, force: true });
});
test("audio publish with no URL extension falls back to publish_type", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
    installMockFetch([
        {
            status: 200,
            json: {
                download_url: "https://gcs.example/abc?sig=def",
                project_id: "p", publish_type: "audio", privacy: "private",
                metadata: { title: "Pod" }, subtitles: SAMPLE_VTT
            }
        },
        { status: 200, text: "audio-bytes" }
    ]);
    const client = new DescriptClient({ token: "t" });
    const result = await exportPublished(client, {
        slug: "s", outputDir: dir, formats: ["mp4"], endMarker: false
    });
    assert.ok(existsSync(join(dir, "Pod", "Pod.mp3")));
    rmSync(dir, { recursive: true, force: true });
});
test("unlinks pre-existing .partial from prior interrupted run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
    const compDir = join(dir, "T");
    mkdirSync(compDir, { recursive: true });
    writeFileSync(join(compDir, "T.mp4.partial"), "stale-bytes");
    installMockFetch([
        {
            status: 200,
            json: {
                download_url: "https://gcs.example/T.mp4?sig=abc",
                project_id: "p", publish_type: "video", privacy: "private",
                metadata: { title: "T" }, subtitles: SAMPLE_VTT
            }
        },
        { status: 200, text: "new-bytes" }
    ]);
    const client = new DescriptClient({ token: "t" });
    const result = await exportPublished(client, {
        slug: "s", outputDir: dir, formats: ["mp4"], endMarker: false
    });
    assert.equal(result.ok, true);
    assert.equal(readFileSync(join(compDir, "T.mp4"), "utf8"), "new-bytes");
    assert.ok(!existsSync(join(compDir, "T.mp4.partial")));
    rmSync(dir, { recursive: true, force: true });
});
test("partial failure: MP4 curl 503 keeps SRT and MD; reports mp4 failed; ok=false", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
    installMockFetch([
        {
            status: 200,
            json: {
                download_url: "https://gcs.example/X.mp4?sig=abc",
                project_id: "p", publish_type: "video", privacy: "private",
                metadata: { title: "X" }, subtitles: SAMPLE_VTT
            }
        },
        { status: 503, text: "" }
    ]);
    const client = new DescriptClient({ token: "t" });
    const result = await exportPublished(client, {
        slug: "s", outputDir: dir, formats: ["mp4", "srt", "md"], endMarker: false
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.written, ["srt", "md"]);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].format, "mp4");
    assert.match(result.failed[0].error, /503/);
    assert.ok(existsSync(join(dir, "X", "X.srt")));
    assert.ok(existsSync(join(dir, "X", "X.md")));
    assert.ok(!existsSync(join(dir, "X", "X.mp4")));
    rmSync(dir, { recursive: true, force: true });
});
test("metadata has no download_url then mp4 fails but srt and md still write", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
    installMockFetch([
        {
            status: 200,
            json: {
                project_id: "p", publish_type: "video", privacy: "private",
                metadata: { title: "T" }, subtitles: SAMPLE_VTT
            }
        }
    ]);
    const client = new DescriptClient({ token: "t" });
    const result = await exportPublished(client, {
        slug: "s", outputDir: dir, formats: ["mp4", "srt", "md"], endMarker: false
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.written, ["srt", "md"]);
    assert.equal(result.failed[0].format, "mp4");
    assert.match(result.failed[0].error, /download_url/);
    rmSync(dir, { recursive: true, force: true });
});
// v0.4.1 - skipFormats behavior (per docs/specs/2026-05-21-export-resume-design.md)
test("skipFormats excludes listed formats from work, adds them to result.skipped", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-exp-skip-"));
    // Only one fetch expected - metadata. mp4 is skipped so no curl.
    installMockFetch([
        {
            status: 200,
            json: {
                download_url: "https://gcs/T.mp4?s=x", project_id: "p",
                publish_type: "video", privacy: "private",
                metadata: { title: "T" }, subtitles: SAMPLE_VTT
            }
        }
    ]);
    const client = new DescriptClient({ token: "t" });
    const result = await exportPublished(client, {
        slug: "s", outputDir: dir, formats: ["mp4", "srt", "md"], endMarker: false,
        skipFormats: ["mp4"]
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.written.sort(), ["md", "srt"]);
    assert.deepEqual(result.skipped, ["mp4"]);
    assert.equal(result.failed.length, 0);
    // mp4 file should NOT have been written
    assert.ok(!existsSync(join(dir, "T", "T.mp4")));
    // srt and md should be present
    assert.ok(existsSync(join(dir, "T", "T.srt")));
    assert.ok(existsSync(join(dir, "T", "T.md")));
    rmSync(dir, { recursive: true, force: true });
});
test("skipFormats covering ALL requested formats writes nothing but ok stays true", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-exp-skip-all-"));
    // Only metadata is fetched even though all formats are skipped (we still need title etc.)
    installMockFetch([
        {
            status: 200,
            json: {
                download_url: "https://gcs/T.mp4?s=x", project_id: "p",
                publish_type: "video", privacy: "private",
                metadata: { title: "T" }, subtitles: SAMPLE_VTT
            }
        }
    ]);
    const client = new DescriptClient({ token: "t" });
    const result = await exportPublished(client, {
        slug: "s", outputDir: dir, formats: ["mp4", "srt", "md"], endMarker: false,
        skipFormats: ["mp4", "srt", "md"]
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.written, []);
    assert.deepEqual(result.skipped.sort(), ["md", "mp4", "srt"]);
    rmSync(dir, { recursive: true, force: true });
});
test("skipFormats with no overlap with formats is a no-op (no skipped entries)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-exp-skip-noop-"));
    installMockFetch([
        {
            status: 200,
            json: {
                download_url: "https://gcs/T.mp4?s=x", project_id: "p",
                publish_type: "video", privacy: "private",
                metadata: { title: "T" }, subtitles: SAMPLE_VTT
            }
        },
        { status: 200, text: "mp4bytes" }
    ]);
    const client = new DescriptClient({ token: "t" });
    // formats=[mp4], skipFormats=[srt,md] - srt/md aren't in formats so skipped[] stays []
    const result = await exportPublished(client, {
        slug: "s", outputDir: dir, formats: ["mp4"], endMarker: false,
        skipFormats: ["srt", "md"]
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.written, ["mp4"]);
    assert.deepEqual(result.skipped, []);
    rmSync(dir, { recursive: true, force: true });
});
test("result.skipped is empty array when skipFormats option is omitted (backward compat)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "descript-exp-no-skip-"));
    installMockFetch([
        {
            status: 200,
            json: {
                download_url: "https://gcs/T.mp4?s=x", project_id: "p",
                publish_type: "video", privacy: "private",
                metadata: { title: "T" }, subtitles: SAMPLE_VTT
            }
        },
        { status: 200, text: "mp4bytes" }
    ]);
    const client = new DescriptClient({ token: "t" });
    const result = await exportPublished(client, {
        slug: "s", outputDir: dir, formats: ["mp4"], endMarker: false
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.skipped, []);
    rmSync(dir, { recursive: true, force: true });
});
