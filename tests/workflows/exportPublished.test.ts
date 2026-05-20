import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
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
