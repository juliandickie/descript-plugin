import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runCli, parseArgv } from "../../src/cli/index.js";
import { installMockFetch, restoreFetch, installNoNetwork } from "../helpers/mockFetch.js";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

afterEach(() => restoreFetch());

function capture() {
  const out: string[] = [];
  return { out, write: (s: string) => { out.push(s); } };
}

test("status command prints ok and exits 0", async () => {
  installMockFetch([{ status: 200, json: { status: "ok" } }]);
  const c = capture();
  const code = await runCli(["status", "--json"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: c.write, stderr: c.write });
  assert.equal(code, 0);
  assert.match(c.out.join(""), /"status": ?"ok"/);
});

test("missing token exits non-zero with a clear message", async () => {
  // Hermetic: never read the real ~/.config/descript, never touch the network.
  installNoNetwork();
  const dir = mkdtempSync(join(tmpdir(), "descript-noenv-"));
  const c = capture();
  const code = await runCli(["status"], {
    env: { DESCRIPT_CONFIG_PATH: join(dir, "nonexistent.json") },
    stdout: c.write, stderr: c.write
  });
  assert.notEqual(code, 0);
  assert.match(c.out.join(""), /No Descript API token/);
  rmSync(dir, { recursive: true, force: true });
});

test("api error exits with code 3 and prints the hint", async () => {
  installMockFetch([{ status: 401, json: { error: "unauthorized", message: "bad token" } }]);
  const c = capture();
  const code = await runCli(["status"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: c.write, stderr: c.write });
  assert.equal(code, 3);
  assert.match(c.out.join(""), /descript-setup|token/i);
});

test("batch run without --confirm exits non-zero", async () => {
  const c = capture();
  const code = await runCli(["batch", "run", "/nonexistent.json"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: c.write, stderr: c.write });
  assert.notEqual(code, 0);
});

test("unknown command exits 2 with usage", async () => {
  const c = capture();
  const code = await runCli(["wat"], { env: {}, stdout: c.write, stderr: c.write });
  assert.equal(code, 2);
  assert.match(c.out.join(""), /Usage|Unknown command/);
});

test("import --file polls the real upload job, not a second import submit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-cli-"));
  const path = join(dir, "clip.mp4");
  writeFileSync(path, Buffer.alloc(1024, 1));
  const { calls } = installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u",
      upload_urls: { "upload.media": { upload_url: "https://gcs/s", asset_id: "a", artifact_id: "b" } } } },
    { status: 200, text: "" },
    { status: 200, json: { job_id: "j", job_type: "import/project_media", job_state: "stopped", created_at: "t",
      drive_id: "d", project_id: "p", project_url: "u",
      result: { status: "success", media_status: {}, media_seconds_used: 1, created_compositions: [{ id: "c", name: "Cut" }] } } }
  ]);
  const out: string[] = [];
  const code = await runCli(["import", "--file", path, "--name", "P", "--json"], {
    env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s)
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 3); // import submit + signed PUT + ONE getJob poll (no second submit)
  assert.equal(calls[2]!.method, "GET");
  assert.equal(calls[2]!.url, "https://descriptapi.com/v1/jobs/j");
  assert.match(out.join(""), /"ok": ?true/);
  rmSync(dir, { recursive: true, force: true });
});

test("import --file --no-wait emits the submit job without polling or re-submitting", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-cli-"));
  const path = join(dir, "clip.mp4");
  writeFileSync(path, Buffer.alloc(512, 1));
  const { calls } = installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u",
      upload_urls: { "upload.media": { upload_url: "https://gcs/s", asset_id: "a", artifact_id: "b" } } } },
    { status: 200, text: "" }
  ]);
  const out: string[] = [];
  const code = await runCli(["import", "--file", path, "--no-wait", "--json"], {
    env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s)
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 2); // submit + PUT only, no poll, no second submit
  assert.match(out.join(""), /"job_id": ?"j"/);
  rmSync(dir, { recursive: true, force: true });
});

test("import --url passes --callback-url and --team-access into the request body", async () => {
  const { calls } = installMockFetch([{ status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } }]);
  const out: string[] = [];
  const code = await runCli(
    ["import", "--url", "https://x/a.mp4", "--name", "P", "--callback-url", "https://hook.example/cb", "--team-access", "edit", "--no-wait", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  const body = JSON.parse(calls[0]!.body!);
  assert.equal(body.callback_url, "https://hook.example/cb");
  assert.equal(body.team_access, "edit");
});

test("import --media accepts a raw add_media map including a multitrack sequence", async () => {
  const { calls } = installMockFetch([{ status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } }]);
  const media = JSON.stringify({ "cam1.mp4": { url: "https://x/1.mp4" }, "cam2.mp4": { url: "https://x/2.mp4" }, "Multicam": { tracks: [{ media: "cam1.mp4" }, { media: "cam2.mp4", offset: 5 }] } });
  const out: string[] = [];
  const code = await runCli(
    ["import", "--media", media, "--name", "Multi", "--no-wait", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0]!.body!);
  assert.ok(body.add_media["Multicam"].tracks);
  assert.equal(body.add_media["Multicam"].tracks[1].offset, 5);
});

test("import --media with invalid JSON exits 2 without calling the API", async () => {
  const { calls } = installMockFetch([{ status: 201, json: {} }]);
  const out: string[] = [];
  const code = await runCli(
    ["import", "--media", "{not json", "--no-wait", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
  assert.equal(calls.length, 0);
  assert.match(out.join(""), /must be valid JSON/);
});

test("publish rejects an invalid --resolution locally without calling the API", async () => {
  const { calls } = installMockFetch([{ status: 201, json: {} }]);
  const out: string[] = [];
  const code = await runCli(["publish", "--project-id", "p", "--resolution", "9000p", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
  assert.equal(code, 2);
  assert.equal(calls.length, 0);
  assert.match(out.join(""), /resolution must be one of/);
});

test("publish rejects --access-level drive locally (not a real Descript access level)", async () => {
  const { calls } = installMockFetch([{ status: 201, json: {} }]);
  const out: string[] = [];
  const code = await runCli(["publish", "--project-id", "p", "--access-level", "drive", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
  assert.equal(code, 2);
  assert.equal(calls.length, 0);
  assert.match(out.join(""), /access-level must be one of/);
  // The error must enumerate only the three real Descript values, not include 'drive'.
  assert.doesNotMatch(out.join(""), /drive/);
});

test("agent rejects a valueless --prompt without spending credits", async () => {
  const { calls } = installMockFetch([{ status: 201, json: {} }]);
  const out: string[] = [];
  // --prompt with no value parses to boolean true; must NOT submit a job with prompt "true"
  const code = await runCli(["agent", "--project-id", "p", "--prompt", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
  assert.equal(code, 2);
  assert.equal(calls.length, 0);
});

test("batch with a nonexistent manifest exits 2 (usage), not 1", async () => {
  const out: string[] = [];
  const code = await runCli(["batch", "plan", "/no/such/manifest-xyz.json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
  assert.equal(code, 2);
  assert.match(out.join(""), /Could not read JSON/);
});

test("published without a slug exits 2 without calling the API", async () => {
  const { calls } = installMockFetch([{ status: 200, json: {} }]);
  const out: string[] = [];
  const code = await runCli(["published"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
  assert.equal(code, 2);
  assert.equal(calls.length, 0);
});

test("parseArgv supports --key=value including values starting with --", () => {
  const r = parseArgv(["agent", "--prompt=--keep this literal", "--json"]);
  assert.equal(r.command, "agent");
  assert.equal(r.flags.prompt, "--keep this literal");
  assert.equal(r.flags.json, true);
});

test("download-published <slug> writes files and exits 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-dlp-"));
  installMockFetch([
    {
      status: 200,
      json: {
        download_url: "https://gcs.example/T.mp4?sig=abc",
        project_id: "p", publish_type: "video", privacy: "private",
        metadata: { title: "T" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nA: hi.\n"
      }
    },
    { status: 200, text: "mp4-bytes" }
  ]);
  const out: string[] = [];
  const code = await runCli(
    ["download-published", "abc-123", "--output-dir", dir, "--formats", "mp4,srt,md", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, "T", "T.mp4")));
  assert.ok(existsSync(join(dir, "T", "T.srt")));
  assert.ok(existsSync(join(dir, "T", "T.md")));
  assert.ok(existsSync(join(dir, "download-report.json")));
  assert.match(out.join(""), /"ok": ?true/);
  rmSync(dir, { recursive: true, force: true });
});

test("download-published without any slug or --slugs or --report exits 2", async () => {
  const out: string[] = [];
  const code = await runCli(
    ["download-published"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
  assert.match(out.join(""), /slug|Usage/);
});

test("download-published --slugs s1,s2 fans out", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-dlp-"));
  installMockFetch([
    { status: 200, json: { download_url: "https://gcs/A.mp4?s=1", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "A" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx.\n" } },
    { status: 200, text: "A" },
    { status: 200, json: { download_url: "https://gcs/B.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "B" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\ny.\n" } },
    { status: 200, text: "B" }
  ]);
  const out: string[] = [];
  const code = await runCli(
    ["download-published", "--slugs", "a,b", "--output-dir", dir, "--formats", "mp4", "--concurrency", "1", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, "A", "A.mp4")));
  assert.ok(existsSync(join(dir, "B", "B.mp4")));
  rmSync(dir, { recursive: true, force: true });
});

test("download-published --report reads slugs from a prior export-report.json", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-dlp-"));
  const reportPath = join(dir, "export-report.json");
  writeFileSync(reportPath, JSON.stringify({
    ok: true, command: "export",
    items: [
      { slug: "abc", ok: true, title: "T1", outputDir: ".", written: ["mp4"], failed: [] },
      { slug: "def", ok: true, title: "T2", outputDir: ".", written: ["mp4"], failed: [] }
    ]
  }));
  installMockFetch([
    { status: 200, json: { download_url: "https://gcs/T1.mp4?s=1", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "T1" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx.\n" } },
    { status: 200, json: { download_url: "https://gcs/T2.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "T2" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\ny.\n" } }
  ]);
  const out: string[] = [];
  const code = await runCli(
    ["download-published", "--report", reportPath, "--output-dir", dir, "--formats", "md", "--concurrency", "1", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, "T1", "T1.md")));
  assert.ok(existsSync(join(dir, "T2", "T2.md")));
  rmSync(dir, { recursive: true, force: true });
});

test("download-published with two slug sources (positional + --slugs) exits 2", async () => {
  const out: string[] = [];
  const code = await runCli(
    ["download-published", "abc", "--slugs", "def"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
  assert.match(out.join(""), /exactly one/);
});

test("export PID (no CID) lists project comps and fans out", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-exp-cli-"));
  installMockFetch([
    // GET /projects/p
    { status: 200, json: { id: "p", name: "Proj", compositions: [{ id: "c1", name: "A" }, { id: "c2", name: "B" }] } },
    // publish c1 submit + result, c2 submit + result, metadata + curl per item
    { status: 201, json: { job_id: "j1", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j1", job_type: "publish", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u", result: { status: "success", share_url: "https://web.descript.com/p/view/sA", download_url: "https://gcs/A.mp4?s=1", download_url_expires_at: "t" } } },
    { status: 200, json: { download_url: "https://gcs/A.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "A" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx.\n" } },
    { status: 200, text: "Abytes" },
    { status: 201, json: { job_id: "j2", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j2", job_type: "publish", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u", result: { status: "success", share_url: "https://web.descript.com/p/view/sB", download_url: "https://gcs/B.mp4?s=1", download_url_expires_at: "t" } } },
    { status: 200, json: { download_url: "https://gcs/B.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "B" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\ny.\n" } },
    { status: 200, text: "Bbytes" }
  ]);
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "--output-dir", dir, "--formats", "mp4", "--concurrency", "1", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, "A", "A.mp4")));
  assert.ok(existsSync(join(dir, "B", "B.mp4")));
  rmSync(dir, { recursive: true, force: true });
});

test("export --composition-ids narrows a project's comp list", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-exp-cli-"));
  installMockFetch([
    { status: 200, json: { id: "p", name: "Proj", compositions: [{ id: "c1", name: "A" }, { id: "c2", name: "B" }, { id: "c3", name: "C" }] } },
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "publish", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u", result: { status: "success", share_url: "https://web.descript.com/p/view/sC", download_url: "https://gcs/C.mp4?s=1", download_url_expires_at: "t" } } },
    { status: 200, json: { download_url: "https://gcs/C.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "C" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nz.\n" } },
    { status: 200, text: "Cbytes" }
  ]);
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "--composition-ids", "c3", "--output-dir", dir, "--formats", "mp4", "--concurrency", "1", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, "C", "C.mp4")));
  assert.ok(!existsSync(join(dir, "A", "A.mp4")));
  rmSync(dir, { recursive: true, force: true });
});

test("export PID CID publishes and downloads in one go", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-exp-cli-"));
  installMockFetch([
    // publish submit
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    // publish job result
    {
      status: 200, json: {
        job_id: "j", job_type: "publish", job_state: "stopped", created_at: "t",
        drive_id: "d", project_id: "p", project_url: "u",
        result: {
          status: "success",
          share_url: "https://web.descript.com/p/view/slug-1",
          download_url: "https://gcs/X.mp4?s=1",
          download_url_expires_at: "2026-05-21T00:00:00Z"
        }
      }
    },
    // metadata
    { status: 200, json: { download_url: "https://gcs/X.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "X" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx.\n" } },
    // curl
    { status: 200, text: "X-bytes" }
  ]);
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "c", "--output-dir", dir, "--formats", "mp4,srt,md", "--access-level", "private", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, "X", "X.mp4")));
  assert.ok(existsSync(join(dir, "X", "X.srt")));
  assert.ok(existsSync(join(dir, "X", "X.md")));
  assert.ok(existsSync(join(dir, "export-report.json")));
  rmSync(dir, { recursive: true, force: true });
});

test("export rejects --formats invalid locally without calling the API", async () => {
  const { calls } = installMockFetch([{ status: 200, json: {} }]);
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "c", "--formats", "wav", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
  assert.equal(calls.length, 0);
  assert.match(out.join(""), /formats must be a comma-separated subset/);
});

test("export rejects --concurrency 0", async () => {
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "c", "--concurrency", "0", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
  assert.match(out.join(""), /concurrency must be a positive integer/);
});

test("export rejects --concurrency negative", async () => {
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "c", "--concurrency", "-1", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
});

test("export rejects --concurrency non-numeric", async () => {
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "c", "--concurrency", "abc", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
});

test("export still rejects --access-level drive (v0.2.1 carry-forward)", async () => {
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "c", "--access-level", "drive", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
  assert.match(out.join(""), /access-level must be one of/);
});

test("export --projects with --composition-ids exits 2 (mutually exclusive)", async () => {
  const out: string[] = [];
  const code = await runCli(
    ["export", "--projects", "p1,p2", "--composition-ids", "c1"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
  assert.match(out.join(""), /only valid with the <project-id> form/);
});
