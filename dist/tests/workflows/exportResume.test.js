// Tests for the v0.4.1 --resume reconstruction logic. One test per row of the
// semantics table in docs/specs/2026-05-21-export-resume-design.md.
//
// Pure-function tests: construct an ExportBatchReport in memory, call
// reconstructResumeItems, assert on itemsToRun and alreadyHandled. The only
// I/O is existsSync against tmpdir files we set up.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconstructResumeItems, validateRequestedFormatsAgainstReport, buildResumeReport } from "../../src/workflows/exportResume.js";
// Track tmpdirs for cleanup
const dirs = [];
afterEach(() => {
    for (const d of dirs.splice(0))
        rmSync(d, { recursive: true, force: true });
});
function mkdir() {
    const d = mkdtempSync(join(tmpdir(), "descript-resume-"));
    dirs.push(d);
    return d;
}
function touchFile(dir, name) {
    writeFileSync(join(dir, name), "x");
}
// Row 1: ok:true, all files present, requested ⊆ written → skip "already complete"
test("Row 1 - ok:true with all files present is skipped (already complete)", () => {
    const dir = mkdir();
    const compDir = join(dir, "Hello");
    mkdirSync(compDir, { recursive: true });
    touchFile(compDir, "Hello.mp4");
    touchFile(compDir, "Hello.srt");
    touchFile(compDir, "Hello.md");
    const prior = {
        ok: true, command: "export",
        items: [{
                ok: true, slug: "s1", title: "Hello", outputDir: compDir,
                written: ["mp4", "srt", "md"], failed: [], skipped: []
            }]
    };
    const r = reconstructResumeItems(prior, ["mp4", "srt", "md"]);
    assert.equal(r.itemsToRun.length, 0);
    assert.equal(r.alreadyHandled.length, 1);
    assert.equal(r.alreadyHandled[0].reason, "already complete");
    assert.equal(r.alreadyHandled[0].resumed, false);
    assert.equal(r.allSkipped, true);
});
// Row 2: ok:true but a file is missing on disk → redownload using slug, skip publish
test("Row 2 - ok:true with one file missing redownloads via slug, skipFormats covers present files", () => {
    const dir = mkdir();
    const compDir = join(dir, "Hello");
    mkdirSync(compDir, { recursive: true });
    touchFile(compDir, "Hello.mp4"); // mp4 present
    touchFile(compDir, "Hello.srt"); // srt present
    // md MISSING - user deleted it
    const prior = {
        ok: true, command: "export",
        items: [{
                ok: true, slug: "s1", title: "Hello", outputDir: compDir,
                written: ["mp4", "srt", "md"], failed: [], skipped: []
            }]
    };
    const r = reconstructResumeItems(prior, ["mp4", "srt", "md"]);
    assert.equal(r.itemsToRun.length, 1);
    assert.equal(r.itemsToRun[0].slug, "s1");
    // mp4 + srt are present, only md needs work → skipFormats = ["mp4", "srt"]
    assert.deepEqual(r.itemsToRun[0].skipFormats?.sort(), ["mp4", "srt"]);
    assert.equal(r.itemsToRun[0].projectId, undefined, "should NOT republish");
    assert.equal(r.alreadyHandled.length, 0);
    assert.equal(r.allSkipped, false);
});
// Row 3 (heterogeneous): ok:true but requested format wasn't attempted for this item
test("Row 3 - heterogeneous formats - item that didn't attempt the format gets partially_resumable", () => {
    const dir = mkdir();
    const compDir = join(dir, "Hello");
    mkdirSync(compDir, { recursive: true });
    touchFile(compDir, "Hello.mp4");
    touchFile(compDir, "Hello.srt");
    const prior = {
        ok: true, command: "export",
        items: [{
                ok: true, slug: "s1", title: "Hello", outputDir: compDir,
                written: ["mp4", "srt"], failed: [], skipped: []
            }]
    };
    // User requests md, which this item never attempted
    const r = reconstructResumeItems(prior, ["mp4", "md"]);
    // The item gets recorded as alreadyHandled with partially_resumable
    // (effective for this item = ['mp4'], all present → already complete with partially_resumable)
    assert.equal(r.alreadyHandled.length, 1);
    assert.equal(r.alreadyHandled[0].partially_resumable, true);
    assert.equal(r.itemsToRun.length, 0);
});
// Row 4: ok:false but slug present → redownload only failed formats using slug
test("Row 4 - ok:false with slug present redownloads only failed formats (no republish)", () => {
    const prior = {
        ok: false, command: "export",
        items: [{
                ok: false, slug: "s1", title: "Hello", outputDir: "/dev/null/Hello",
                written: ["mp4"], // mp4 succeeded
                failed: [{ format: "md", error: "boom" }], // md failed
                skipped: []
            }]
    };
    const r = reconstructResumeItems(prior, ["mp4", "md"]);
    assert.equal(r.itemsToRun.length, 1);
    assert.equal(r.itemsToRun[0].slug, "s1");
    // Only md needs work, mp4 is in skipFormats
    assert.deepEqual(r.itemsToRun[0].skipFormats, ["mp4"]);
    assert.equal(r.itemsToRun[0].projectId, undefined);
});
// Row 5: ok:false with slug empty → full publish-then-download
test("Row 5 - ok:false with no slug runs full publish-then-download via projectId+compositionId", () => {
    const prior = {
        ok: false, command: "export",
        items: [{
                ok: false, slug: "", title: "", outputDir: "",
                written: [],
                failed: [
                    { format: "mp4", error: "publish failed" },
                    { format: "srt", error: "publish failed" },
                    { format: "md", error: "publish failed" }
                ],
                skipped: [],
                projectId: "p1", compositionId: "c1"
            }]
    };
    const r = reconstructResumeItems(prior, ["mp4", "srt", "md"]);
    assert.equal(r.itemsToRun.length, 1);
    assert.equal(r.itemsToRun[0].projectId, "p1");
    assert.equal(r.itemsToRun[0].compositionId, "c1");
    assert.equal(r.itemsToRun[0].slug, undefined);
    assert.equal(r.itemsToRun[0].skipFormats, undefined);
});
// Row 6: malformed item (no slug, no projectId+compositionId) → fail with reason
test("Row 6 - malformed item with no slug and no projectId+compositionId is recorded as not-resumable", () => {
    const prior = {
        ok: false, command: "export",
        items: [{
                ok: false, slug: "", title: "Lost", outputDir: "",
                written: [], failed: [{ format: "mp4", error: "?" }], skipped: []
            }]
    };
    const r = reconstructResumeItems(prior, ["mp4"]);
    assert.equal(r.itemsToRun.length, 0);
    assert.equal(r.alreadyHandled.length, 1);
    assert.match(r.alreadyHandled[0].reason, /no slug and no project\/composition IDs/);
});
// All-items-already-complete → allSkipped: true
test("All items already complete - allSkipped flag is true", () => {
    const dir = mkdir();
    const compDir1 = join(dir, "A");
    const compDir2 = join(dir, "B");
    mkdirSync(compDir1, { recursive: true });
    mkdirSync(compDir2, { recursive: true });
    touchFile(compDir1, "A.mp4");
    touchFile(compDir2, "B.mp4");
    const prior = {
        ok: true, command: "export",
        items: [
            { ok: true, slug: "a", title: "A", outputDir: compDir1, written: ["mp4"], failed: [], skipped: [] },
            { ok: true, slug: "b", title: "B", outputDir: compDir2, written: ["mp4"], failed: [], skipped: [] }
        ]
    };
    const r = reconstructResumeItems(prior, ["mp4"]);
    assert.equal(r.allSkipped, true);
    assert.equal(r.itemsToRun.length, 0);
    assert.equal(r.alreadyHandled.length, 2);
});
// Audio fallback: file existence check tries .mp3 if .mp4 not present
test("File existence check accepts .mp3 as the mp4 format on disk (audio publishes)", () => {
    const dir = mkdir();
    const compDir = join(dir, "Podcast");
    mkdirSync(compDir, { recursive: true });
    touchFile(compDir, "Podcast.mp3"); // audio publish wrote .mp3 not .mp4
    const prior = {
        ok: true, command: "export",
        items: [{
                ok: true, slug: "s1", title: "Podcast", outputDir: compDir,
                written: ["mp4"], failed: [], skipped: []
            }]
    };
    const r = reconstructResumeItems(prior, ["mp4"]);
    // .mp3 present → "mp4" format considered present on disk → already complete
    assert.equal(r.alreadyHandled.length, 1);
    assert.equal(r.itemsToRun.length, 0);
});
// validateRequestedFormatsAgainstReport - disjoint format set rejected
test("validateRequestedFormatsAgainstReport rejects disjoint format set", () => {
    const prior = {
        ok: true, command: "export",
        items: [{ ok: true, slug: "s", title: "T", outputDir: "/x", written: ["mp4"], failed: [], skipped: [] }]
    };
    const v = validateRequestedFormatsAgainstReport(prior, ["srt", "md"]); // none attempted
    assert.equal(v.ok, false);
    if (!v.ok)
        assert.match(v.reason, /no items in the report attempted/);
});
// validateRequestedFormatsAgainstReport - partial overlap is OK
test("validateRequestedFormatsAgainstReport accepts partial overlap (one format in common)", () => {
    const prior = {
        ok: true, command: "export",
        items: [{ ok: true, slug: "s", title: "T", outputDir: "/x", written: ["mp4", "srt"], failed: [], skipped: [] }]
    };
    const v = validateRequestedFormatsAgainstReport(prior, ["mp4", "md"]); // mp4 in common
    assert.equal(v.ok, true);
});
// validateRequestedFormatsAgainstReport - undefined formats means default-from-prior, always passes
test("validateRequestedFormatsAgainstReport with undefined formats passes (default from prior)", () => {
    const prior = {
        ok: false, command: "export",
        items: [{ ok: false, slug: "s", title: "T", outputDir: "/x", written: [], failed: [{ format: "mp4", error: "?" }], skipped: [] }]
    };
    const v = validateRequestedFormatsAgainstReport(prior, undefined);
    assert.equal(v.ok, true);
});
// buildResumeReport - combines alreadyHandled + ran items, sets ok correctly
test("buildResumeReport combines alreadyHandled and ran items, computes top-level ok", () => {
    const ran = [
        { ok: true, slug: "s1", title: "T1", outputDir: "/x", written: ["mp4"], failed: [], skipped: [] }
    ];
    const alreadyHandled = [
        { ok: true, slug: "s2", title: "T2", outputDir: "/x", written: ["mp4"], failed: [], skipped: [], resumed: false, reason: "already complete" }
    ];
    const report = buildResumeReport("/path/to/report.json", ran, alreadyHandled, false);
    assert.equal(report.schema_version, 1);
    assert.equal(report.command, "export");
    assert.equal(report.ok, true);
    assert.equal(report.resumed_from, "/path/to/report.json");
    assert.equal(report.all_skipped, false);
    assert.equal(report.items.length, 2);
});
// buildResumeReport - one ran item failed → top-level ok false
test("buildResumeReport sets ok:false when any ran item failed", () => {
    const ran = [
        { ok: false, slug: "s1", title: "T1", outputDir: "/x", written: [], failed: [{ format: "mp4", error: "boom" }], skipped: [] }
    ];
    const report = buildResumeReport("/p", ran, [], false);
    assert.equal(report.ok, false);
});
