import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DescriptClient } from "../../src/client/index.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";
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
  assert.equal(report.items[0]!.slug, "abc-123");
  assert.deepEqual(report.items[0]!.written, ["mp4", "srt", "md"]);

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
  assert.equal(report.items[0]!.slug, "a");
  assert.equal(report.items[1]!.slug, "b");
  assert.equal(report.items[2]!.slug, "c");
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
  assert.equal(report.items[0]!.slug, "a");
  assert.equal(report.items[1]!.slug, "b");
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
  assert.equal(report.items[0]!.ok, true);
  assert.equal(report.items[1]!.ok, false);
  assert.ok(report.items[1]!.failed.length >= 1);
  rmSync(dir, { recursive: true, force: true });
});
