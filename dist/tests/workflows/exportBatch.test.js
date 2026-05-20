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
    assert.equal(report.items[0].slug, "abc-123");
    assert.deepEqual(report.items[0].written, ["mp4", "srt", "md"]);
    const reportPath = join(dir, "download-report.json");
    assert.ok(existsSync(reportPath));
    const persisted = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(persisted.ok, true);
    assert.equal(persisted.items.length, 1);
    rmSync(dir, { recursive: true, force: true });
});
