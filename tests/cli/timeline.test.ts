import { test, afterEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../src/cli/index.js";
import { installMockFetch, installMockFetchByUrl, restoreFetch, type MockResponseSpec, type RecordedCall } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());

// =========================================================================
// descript timeline - POST /jobs/export/timeline (live-verified 2026-09-29/30,
// not yet in the public spec). Submit, poll to stopped, then download the signed
// storage URL from result.download_url with a plain fetch (no Authorization).
// =========================================================================

const ENV = { DESCRIPT_API_TOKEN: "t" };
const FAST_POLL = { intervalMs: 1, maxIntervalMs: 1, sleep: async () => {} };

const PID = "88dc66c3-3f2a-4d7e-9b1c-5a6b7c8d9e0f";
const CID = "c1c1c1c1-0000-4000-8000-000000000001";
const JOB = "job-tl-1";
const STORAGE_URL = "https://storage.example.com/exports/timeline.edl?sig=abc&exp=123";
const EXPIRES = "2026-10-01T03:00:00.000Z";

const SUBMIT = { job_id: JOB, drive_id: "d1", drive_name: "iDD", project_id: PID, project_url: "https://web.descript.com/88dc66c3", format: "edl" };
const jobBase = { job_id: JOB, job_type: "export/timeline", created_at: "t", drive_id: "d1", project_id: PID, project_url: SUBMIT.project_url };
const running = (label?: string): MockResponseSpec => ({ status: 200, json: { ...jobBase, job_state: "running", ...(label ? { progress: { label } } : {}) } });
const stopped = (result: unknown): MockResponseSpec => ({ status: 200, json: { ...jobBase, job_state: "stopped", result } });
const success = (over: Record<string, unknown> = {}) => ({
  status: "success", composition_id: CID, file_name: "timeline.edl", content_type: "text/plain",
  download_url: STORAGE_URL, download_url_expires_at: EXPIRES, ...over
});

const EDL_TEXT = "TITLE: Lesson 1\nFORMAT: SAMPLITUDE EDL\nSAMPLE RATE: 48000\n";
const EDL_BYTES = new TextEncoder().encode(EDL_TEXT);
const AAF_BYTES = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00, 0xff, 0xfe, 0x80, 0x0a, 0x0d, 0x00]);

interface Run { code: number; out: string; err: string; calls: RecordedCall[] }

// Submit, poll and storage each get their own queue, matched by URL.
function flow(poll: MockResponseSpec[], download: MockResponseSpec = { status: 200, bytes: EDL_BYTES }, submit: MockResponseSpec = { status: 201, json: SUBMIT }) {
  return [
    { match: "/jobs/export/timeline", responses: [submit] },
    { match: `/jobs/${JOB}`, responses: poll },
    { match: "storage.example.com", responses: [download] }
  ];
}

async function run(argv: string[], rules: ReturnType<typeof flow>): Promise<Run> {
  const { calls } = installMockFetchByUrl(rules);
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: ENV, stdout: (s) => out.push(s), stderr: (s) => err.push(s), poll: FAST_POLL });
  return { code, out: out.join(""), err: err.join(""), calls };
}

// A usage error must stop before any request goes out.
async function usageError(argv: string[]): Promise<Run> {
  const { calls } = installMockFetch([{ status: 500, json: { error: "unexpected", message: "no request expected" } }]);
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: ENV, stdout: (s) => out.push(s), stderr: (s) => err.push(s), poll: FAST_POLL });
  assert.equal(code, 2, `${argv.join(" ")}\n${out.join("")}${err.join("")}`);
  assert.equal(calls.length, 0, `${argv.join(" ")} must not call the API`);
  return { code, out: out.join(""), err: err.join(""), calls };
}

const tempDirs: string[] = [];
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "descript-timeline-"));
  tempDirs.push(dir);
  return dir;
}
after(() => { for (const d of tempDirs) rmSync(d, { recursive: true, force: true }); });

const submitBody = (r: Run) => JSON.parse(r.calls.find((c) => c.method === "POST")!.body!) as Record<string, unknown>;
const sentBody = async (argv: string[]) => submitBody(await run([...argv, "--no-wait"], flow([running()])));

// ---------------------------------------------------------------------------
// Parse-time validation (exit 2, zero fetch calls)
// ---------------------------------------------------------------------------

test("timeline without a project id is a usage error", async () => {
  const r = await usageError(["timeline", "--format", "edl"]);
  assert.match(r.err, /Usage: descript timeline <project-id> \[composition-id\] --format /);
});

test("timeline without --format is a usage error that lists all six formats and what each is for", async () => {
  const r = await usageError(["timeline", PID]);
  assert.match(r.err, /--format is required/);
  for (const f of ["edl", "sesx", "fcp", "premiere", "davinci_resolve", "aaf"]) assert.match(r.err, new RegExp(`\\b${f}\\b`), f);
  for (const app of ["Reaper", "Samplitude", "Audition", "Final Cut", "Premiere", "DaVinci Resolve", "Pro Tools", "Logic"]) assert.match(r.err, new RegExp(app), app);
});

test("timeline --format with an unknown value names the value and lists the six formats", async () => {
  const r = await usageError(["timeline", PID, "--format", "xml"]);
  assert.match(r.err, /--format must be one of/);
  assert.match(r.err, /"xml"/);
  for (const f of ["edl", "sesx", "fcp", "premiere", "davinci_resolve", "aaf"]) assert.match(r.err, new RegExp(`\\b${f}\\b`), f);
  // formats are matched exactly, so a near miss is not quietly accepted
  await usageError(["timeline", PID, "--format", "EDL"]);
  await usageError(["timeline", PID, "--format", "resolve"]);
});

test("timeline --format with no value is a usage error", async () => {
  await usageError(["timeline", PID, "--format"]);
});

test("timeline --markers and --no-markers together is a usage error", async () => {
  const r = await usageError(["timeline", PID, "--format", "edl", "--markers", "--no-markers"]);
  assert.match(r.err, /--markers and --no-markers cannot be used together/);
});

test("timeline --track-per-file is rejected for fcp and names the reason", async () => {
  const r = await usageError(["timeline", PID, "--format", "fcp", "--track-per-file"]);
  assert.match(r.err, /--track-per-file/);
  assert.match(r.err, /fcp/);
});

test("timeline --source-frame-rate is rejected for every format except premiere and davinci_resolve", async () => {
  for (const format of ["edl", "sesx", "fcp", "aaf"]) {
    const r = await usageError(["timeline", PID, "--format", format, "--source-frame-rate"]);
    assert.match(r.err, /--source-frame-rate/, format);
    assert.match(r.err, /premiere/, format);
    assert.match(r.err, /davinci_resolve/, format);
  }
});

test("timeline --strip-spaces is rejected for every format except aaf", async () => {
  for (const format of ["edl", "sesx", "fcp", "premiere", "davinci_resolve"]) {
    const r = await usageError(["timeline", PID, "--format", format, "--strip-spaces"]);
    assert.match(r.err, /--strip-spaces/, format);
    assert.match(r.err, /aaf/, format);
  }
});

test("timeline rejects a switch that swallowed the next word instead of silently dropping it", async () => {
  // parseArgv reads `--markers <word>` as a value, so the project id would vanish or an option would be lost
  const front = await usageError(["timeline", "--markers", PID, "--format", "edl"]);
  assert.match(front.err, /--markers is a switch/);
  assert.match(front.err, new RegExp(PID));
  for (const flag of ["no-markers", "track-per-file", "no-wait"]) {
    const r = await usageError(["timeline", PID, `--${flag}`, "premiere-ish", "--format", "premiere"]);
    assert.match(r.err, new RegExp(`--${flag} is a switch`), flag);
  }
  await usageError(["timeline", PID, "--format", "premiere", "--source-frame-rate", "yes"]);
  await usageError(["timeline", PID, "--format", "aaf", "--strip-spaces", "yes"]);
});

test("timeline rejects --out and --callback-url given without a value, and extra positional words", async () => {
  await usageError(["timeline", PID, "--format", "edl", "--out"]);
  await usageError(["timeline", PID, "--format", "edl", "--callback-url"]);
  const extra = await usageError(["timeline", PID, CID, "spare", "--format", "edl"]);
  assert.match(extra.err, /spare/);
});

test("timeline rejects a flag it does not have before anything runs", async () => {
  const r = await usageError(["timeline", PID, "--format", "edl", "--markers=yes-please", "--include-markers"]);
  assert.match(r.err, /Unknown option/);
});

// ---------------------------------------------------------------------------
// Request building - only the fields the user set are sent
// ---------------------------------------------------------------------------

test("timeline sends only project_id and format when nothing else was set", async () => {
  const body = await sentBody(["timeline", PID, "--format", "edl"]);
  assert.deepEqual(body, { project_id: PID, format: "edl" });
});

test("timeline sends the composition id (UUID, short id or URL) when one is given", async () => {
  for (const id of [CID, "c1c1c", "https://web.descript.com/88dc66c3?comp=x"]) {
    const body = await sentBody(["timeline", PID, id, "--format", "sesx"]);
    assert.deepEqual(body, { project_id: PID, composition_id: id, format: "sesx" }, id);
    restoreFetch();
  }
});

test("timeline --markers sends include_markers true, --no-markers sends false, neither leaves it out", async () => {
  const on = await sentBody(["timeline", PID, "--format", "premiere", "--markers"]);
  assert.equal(on.include_markers, true);
  restoreFetch();
  const off = await sentBody(["timeline", PID, "--format", "premiere", "--no-markers"]);
  assert.equal(off.include_markers, false);
  restoreFetch();
  const neither = await sentBody(["timeline", PID, "--format", "premiere"]);
  assert.equal("include_markers" in neither, false);
});

test("timeline maps --track-per-file, --source-frame-rate, --strip-spaces and --callback-url onto their API fields", async () => {
  const premiere = await sentBody(["timeline", PID, CID, "--format", "premiere", "--markers", "--track-per-file", "--source-frame-rate", "--callback-url", "https://hooks.example.com/done"]);
  assert.deepEqual(premiere, {
    project_id: PID, composition_id: CID, format: "premiere", include_markers: true,
    create_track_per_file: true, snap_frame_rates: false, callback_url: "https://hooks.example.com/done"
  });
  restoreFetch();
  const resolve_ = await sentBody(["timeline", PID, "--format", "davinci_resolve", "--source-frame-rate"]);
  assert.deepEqual(resolve_, { project_id: PID, format: "davinci_resolve", snap_frame_rates: false });
  restoreFetch();
  const aaf = await sentBody(["timeline", PID, "--format", "aaf", "--strip-spaces", "--track-per-file"]);
  assert.deepEqual(aaf, { project_id: PID, format: "aaf", strip_spaces: true, create_track_per_file: true });
});

test("timeline never sends snap_frame_rates, create_track_per_file or strip_spaces unless asked", async () => {
  const body = await sentBody(["timeline", PID, "--format", "aaf"]);
  for (const k of ["snap_frame_rates", "create_track_per_file", "strip_spaces", "include_markers", "callback_url", "composition_id"]) {
    assert.equal(k in body, false, k);
  }
});

// ---------------------------------------------------------------------------
// The flow - submit, poll, download, write
// ---------------------------------------------------------------------------

test("timeline submits, polls, downloads the signed URL without an Authorization header and writes the exact bytes", async () => {
  const dir = tmp();
  const out = join(dir, "lesson.edl");
  const r = await run(["timeline", PID, CID, "--format", "edl", "--out", out], flow([running(), stopped(success())]));
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(readFileSync(out), Buffer.from(EDL_BYTES));

  assert.equal(r.calls.length, 4);
  const [submit, poll1, poll2, download] = r.calls;
  assert.equal(submit!.method, "POST");
  assert.equal(new URL(submit!.url).pathname, "/v1/jobs/export/timeline");
  assert.equal(submit!.headers["authorization"], "Bearer t");
  assert.equal(poll1!.method, "GET");
  assert.equal(new URL(poll1!.url).pathname, `/v1/jobs/${JOB}`);
  assert.equal(poll2!.headers["authorization"], "Bearer t");
  assert.equal(download!.url, STORAGE_URL);
  assert.equal(download!.method, "GET");
  assert.equal(download!.headers["authorization"], undefined, "the signed storage URL must not receive the Descript token");
  assert.deepEqual(download!.headers, {});
  assert.equal(r.err, "");
});

test("timeline human output names the saved path, size, format and composition, then the download link and its expiry", async () => {
  const dir = tmp();
  const out = join(dir, "lesson.edl");
  const r = await run(["timeline", PID, "--format", "edl", "--out", out], flow([stopped(success())]));
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out, [
    `Saved ${resolve(out)} (${EDL_BYTES.length} bytes, edl, composition ${CID})`,
    `Download link (valid 24 hours, expires ${EXPIRES}): ${STORAGE_URL}`,
    ""
  ].join("\n"));
});

test("timeline --json prints ok, ids, file details, the saved path and the download link", async () => {
  const dir = tmp();
  const out = join(dir, "lesson.edl");
  const r = await run(["timeline", PID, "--format", "edl", "--out", out, "--json"], flow([stopped(success())]));
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(JSON.parse(r.out), {
    ok: true, jobId: JOB, projectId: PID, compositionId: CID, format: "edl",
    fileName: "timeline.edl", contentType: "text/plain", path: resolve(out), bytes: EDL_BYTES.length,
    downloadUrl: STORAGE_URL, downloadUrlExpiresAt: EXPIRES
  });
  assert.equal(r.err, "");
});

test("timeline writes an aaf file byte for byte (binary safe)", async () => {
  const dir = tmp();
  const out = join(dir, "session.aaf");
  const aafSuccess = success({ file_name: "timeline.aaf", content_type: "application/octet-stream", download_url: "https://storage.example.com/exports/timeline.aaf?sig=z" });
  const r = await run(["timeline", PID, "--format", "aaf", "--strip-spaces", "--out", out, "--json"],
    flow([stopped(aafSuccess)], { status: 200, bytes: AAF_BYTES }, { status: 201, json: { ...SUBMIT, format: "aaf" } }));
  assert.equal(r.code, 0, r.err);
  const written = readFileSync(out);
  assert.deepEqual([...written], [...AAF_BYTES]);
  assert.deepEqual([...written.subarray(0, 4)], [0xd0, 0xcf, 0x11, 0xe0]);
  const json = JSON.parse(r.out);
  assert.equal(json.bytes, AAF_BYTES.length);
  assert.equal(json.format, "aaf");
  assert.equal(json.contentType, "application/octet-stream");
});

test("timeline --out creates missing parent folders", async () => {
  const dir = tmp();
  const out = join(dir, "a", "b", "c", "lesson.edl");
  const r = await run(["timeline", PID, "--format", "edl", "--out", out], flow([stopped(success())]));
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(readFileSync(out), Buffer.from(EDL_BYTES));
});

test("timeline --out that is an existing directory writes result.file_name inside it", async () => {
  const dir = tmp();
  const r = await run(["timeline", PID, "--format", "edl", "--out", dir, "--json"], flow([stopped(success({ file_name: "timeline.edl" }))]));
  assert.equal(r.code, 0, r.err);
  const expected = join(dir, "timeline.edl");
  assert.deepEqual(readFileSync(expected), Buffer.from(EDL_BYTES));
  assert.equal(JSON.parse(r.out).path, resolve(expected));
  assert.deepEqual(readdirSync(dir), ["timeline.edl"]);
});

test("timeline --out with a trailing slash on a folder that does not exist yet creates it and writes file_name inside", async () => {
  const dir = tmp();
  const target = join(dir, "exports", "lesson-1");
  const r = await run(["timeline", PID, "--format", "edl", "--out", `${target}/`, "--json"], flow([stopped(success())]));
  assert.equal(r.code, 0, r.err);
  assert.equal(statSync(target).isDirectory(), true);
  assert.deepEqual(readFileSync(join(target, "timeline.edl")), Buffer.from(EDL_BYTES));
});

test("timeline keeps a path traversal in result.file_name inside the target folder", async () => {
  const dir = tmp();
  const r = await run(["timeline", PID, "--format", "edl", "--out", dir], flow([stopped(success({ file_name: "../../evil.edl" }))]));
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(readdirSync(dir), ["evil.edl"]);
});

test("timeline without --out writes ./<project_id>-<file_name> in the current directory", async () => {
  const dir = tmp();
  const before = process.cwd();
  process.chdir(dir);
  try {
    const r = await run(["timeline", PID, "--format", "edl", "--json"], flow([stopped(success())]));
    assert.equal(r.code, 0, r.err);
    const expected = join(process.cwd(), `${PID}-timeline.edl`);
    assert.deepEqual(readFileSync(expected), Buffer.from(EDL_BYTES));
    assert.equal(JSON.parse(r.out).path, expected);
  } finally {
    process.chdir(before);
  }
});

test("timeline overwrites an existing output file, as transcript --out does", async () => {
  const dir = tmp();
  const out = join(dir, "lesson.edl");
  writeFileSync(out, "OLD CONTENT THAT IS LONGER THAN THE NEW CONTENT ".repeat(20));
  const r = await run(["timeline", PID, "--format", "edl", "--out", out], flow([stopped(success())]));
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(readFileSync(out), Buffer.from(EDL_BYTES));
});

test("timeline in human mode shows Underlord's progress labels on stderr, --json shows none", async () => {
  const dir = tmp();
  const human = await run(["timeline", PID, "--format", "edl", "--out", join(dir, "a.edl")],
    flow([running("Preparing export"), running("Preparing export"), running("Writing EDL"), stopped(success())]));
  assert.equal(human.code, 0, human.err);
  assert.equal(human.err, "  progress - Preparing export\n  progress - Writing EDL\n");
  restoreFetch();
  const json = await run(["timeline", PID, "--format", "edl", "--out", join(dir, "b.edl"), "--json"],
    flow([running("Preparing export"), stopped(success())]));
  assert.equal(json.err, "");
});

// ---------------------------------------------------------------------------
// --no-wait
// ---------------------------------------------------------------------------

test("timeline --no-wait prints the submit response and stops - no poll, no download, no file", async () => {
  const dir = tmp();
  const before = process.cwd();
  process.chdir(dir);
  try {
    const human = await run(["timeline", PID, "--format", "edl", "--no-wait"], flow([stopped(success())]));
    assert.equal(human.code, 0, human.err);
    assert.equal(human.calls.length, 1);
    assert.equal(human.calls[0]!.method, "POST");
    assert.match(human.out, new RegExp(`Submitted timeline export ${JOB}`));
    assert.match(human.out, /edl/);
    assert.match(human.out, new RegExp(`descript jobs get ${JOB}`));
    restoreFetch();
    const json = await run(["timeline", PID, "--format", "edl", "--no-wait", "--json"], flow([stopped(success())]));
    assert.equal(json.code, 0, json.err);
    assert.equal(json.calls.length, 1);
    assert.deepEqual(JSON.parse(json.out), SUBMIT);
    assert.deepEqual(readdirSync(process.cwd()), []);
  } finally {
    process.chdir(before);
  }
});

// ---------------------------------------------------------------------------
// Failures - exit 4
// ---------------------------------------------------------------------------

test("timeline job error prints Timeline export failed and exits 4, with no download and no file", async () => {
  const dir = tmp();
  const out = join(dir, "lesson.edl");
  const r = await run(["timeline", PID, "--format", "edl", "--out", out], flow([running(), stopped({ status: "error", error_message: "Composition has no clips" })]));
  assert.equal(r.code, 4);
  assert.equal(r.out, "Timeline export failed: Composition has no clips\n");
  assert.equal(r.calls.some((c) => c.url.includes("storage.example.com")), false);
  assert.equal(existsSync(out), false);
});

test("timeline --json job error is { ok: false, jobId, error } and exits 4", async () => {
  const r = await run(["timeline", PID, "--format", "edl", "--out", join(tmp(), "x.edl"), "--json"], flow([stopped({ status: "error", error_message: "Composition has no clips" })]));
  assert.equal(r.code, 4);
  assert.deepEqual(JSON.parse(r.out), { ok: false, jobId: JOB, error: "Composition has no clips" });
});

test("timeline treats a job that stopped with no result, or a success with no download link, as a failed export", async () => {
  const noResult = await run(["timeline", PID, "--format", "edl", "--out", join(tmp(), "x.edl"), "--json"], flow([stopped(undefined)]));
  assert.equal(noResult.code, 4);
  assert.deepEqual(JSON.parse(noResult.out), { ok: false, jobId: JOB, error: "Job stopped without a result" });
  restoreFetch();
  const noUrl = await run(["timeline", PID, "--format", "edl", "--out", join(tmp(), "x.edl"), "--json"], flow([stopped(success({ download_url: undefined }))]));
  assert.equal(noUrl.code, 4);
  const parsed = JSON.parse(noUrl.out);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.jobId, JOB);
  assert.match(parsed.error, /no download URL/);
});

test("timeline download failure (non-2xx) exits 4 and keeps the download URL in the message so it can be retried by hand", async () => {
  const dir = tmp();
  const out = join(dir, "lesson.edl");
  const r = await run(["timeline", PID, "--format", "edl", "--out", out], flow([stopped(success())], { status: 403, text: "<Error>Request has expired</Error>" }));
  assert.equal(r.code, 4);
  assert.match(r.out, /Timeline export finished but the download failed/);
  assert.match(r.out, /HTTP 403/);
  assert.ok(r.out.includes(STORAGE_URL), r.out);
  assert.ok(r.out.includes(EXPIRES), r.out);
  assert.equal(existsSync(out), false, "a failed download must not leave a file behind");
  const dl = r.calls.find((c) => c.url.includes("storage.example.com"))!;
  assert.equal(dl.headers["authorization"], undefined);
});

test("timeline --json download failure carries ok false, the job id, the error and the download link", async () => {
  const r = await run(["timeline", PID, "--format", "edl", "--out", join(tmp(), "x.edl"), "--json"], flow([stopped(success())], { status: 500, text: "oops" }));
  assert.equal(r.code, 4);
  const parsed = JSON.parse(r.out);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.jobId, JOB);
  assert.match(parsed.error, /HTTP 500/);
  assert.ok(parsed.error.includes(STORAGE_URL));
  assert.equal(parsed.downloadUrl, STORAGE_URL);
  assert.equal(parsed.downloadUrlExpiresAt, EXPIRES);
});

test("timeline download that fails at the network level exits 4 with the URL, not a bare stack message", async () => {
  mock.method(globalThis, "fetch", async (input: unknown) => {
    const url = String(input);
    if (url.includes("storage.example.com")) throw new TypeError("fetch failed");
    if (url.includes("/jobs/export/timeline")) return new Response(JSON.stringify(SUBMIT), { status: 201 });
    return new Response(JSON.stringify({ ...jobBase, job_state: "stopped", result: success() }), { status: 200 });
  });
  const out: string[] = [];
  const code = await runCli(["timeline", PID, "--format", "edl", "--out", join(tmp(), "x.edl")], { env: ENV, stdout: (s) => out.push(s), stderr: () => {}, poll: FAST_POLL });
  assert.equal(code, 4);
  assert.match(out.join(""), /fetch failed/);
  assert.ok(out.join("").includes(STORAGE_URL));
});

test("timeline exits 4 with the download link when the file cannot be written", async () => {
  const dir = tmp();
  const blocker = join(dir, "blocker");
  writeFileSync(blocker, "a file where a folder is needed");
  const r = await run(["timeline", PID, "--format", "edl", "--out", join(blocker, "lesson.edl")], flow([stopped(success())]));
  assert.equal(r.code, 4);
  assert.match(r.out, /Could not write/);
  assert.ok(r.out.includes(STORAGE_URL), r.out);
});

test("timeline reports an API rejection of the submit with the validation details, exit 3", async () => {
  const body = { error: "bad_request", message: "Invalid request payload input", details: [{ message: "\"project_id\" must be a valid GUID", path: ["project_id"] }] };
  const r = await run(["timeline", "not-a-uuid", "--format", "edl"], flow([running()], undefined, { status: 400, json: body }));
  assert.equal(r.code, 3);
  assert.match(r.err, /Descript API error 400 \(bad_request\): Invalid request payload input\n {2}- "project_id" must be a valid GUID\nHint: /);
  assert.equal(r.calls.length, 1);
});

test("timeline appears in the usage text with its flags", async () => {
  const out: string[] = [];
  assert.equal(await runCli(["help"], { env: {}, stdout: (s) => out.push(s), stderr: () => {} }), 0);
  const text = out.join("");
  assert.match(text, /^ {2}timeline <pid> \[cid\]/m);
  for (const f of ["--format edl|sesx|fcp|premiere|davinci_resolve|aaf", "--out", "--markers", "--no-markers", "--track-per-file", "--source-frame-rate", "--strip-spaces"]) {
    assert.ok(text.includes(f), `usage should mention ${f}`);
  }
});
