import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
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
  assert.match(result.failed[0]!.error, /mkdir failed/);
  rmSync(dir, { recursive: true, force: true });
});
