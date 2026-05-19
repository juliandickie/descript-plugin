import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runCli, parseArgv } from "../../src/cli/index.js";
import { installMockFetch, restoreFetch, installNoNetwork } from "../helpers/mockFetch.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
afterEach(() => restoreFetch());
function capture() {
    const out = [];
    return { out, write: (s) => { out.push(s); } };
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
    const out = [];
    const code = await runCli(["import", "--file", path, "--name", "P", "--json"], {
        env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s)
    });
    assert.equal(code, 0);
    assert.equal(calls.length, 3); // import submit + signed PUT + ONE getJob poll (no second submit)
    assert.equal(calls[2].method, "GET");
    assert.equal(calls[2].url, "https://descriptapi.com/v1/jobs/j");
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
    const out = [];
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
    const out = [];
    const code = await runCli(["import", "--url", "https://x/a.mp4", "--name", "P", "--callback-url", "https://hook.example/cb", "--team-access", "edit", "--no-wait", "--json"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
    assert.equal(code, 0);
    const body = JSON.parse(calls[0].body);
    assert.equal(body.callback_url, "https://hook.example/cb");
    assert.equal(body.team_access, "edit");
});
test("import --media accepts a raw add_media map including a multitrack sequence", async () => {
    const { calls } = installMockFetch([{ status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } }]);
    const media = JSON.stringify({ "cam1.mp4": { url: "https://x/1.mp4" }, "cam2.mp4": { url: "https://x/2.mp4" }, "Multicam": { tracks: [{ media: "cam1.mp4" }, { media: "cam2.mp4", offset: 5 }] } });
    const out = [];
    const code = await runCli(["import", "--media", media, "--name", "Multi", "--no-wait", "--json"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
    assert.equal(code, 0);
    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0].body);
    assert.ok(body.add_media["Multicam"].tracks);
    assert.equal(body.add_media["Multicam"].tracks[1].offset, 5);
});
test("import --media with invalid JSON exits 2 without calling the API", async () => {
    const { calls } = installMockFetch([{ status: 201, json: {} }]);
    const out = [];
    const code = await runCli(["import", "--media", "{not json", "--no-wait", "--json"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
    assert.equal(code, 2);
    assert.equal(calls.length, 0);
    assert.match(out.join(""), /must be valid JSON/);
});
test("publish rejects an invalid --resolution locally without calling the API", async () => {
    const { calls } = installMockFetch([{ status: 201, json: {} }]);
    const out = [];
    const code = await runCli(["publish", "--project-id", "p", "--resolution", "9000p", "--json"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
    assert.equal(code, 2);
    assert.equal(calls.length, 0);
    assert.match(out.join(""), /resolution must be one of/);
});
test("agent rejects a valueless --prompt without spending credits", async () => {
    const { calls } = installMockFetch([{ status: 201, json: {} }]);
    const out = [];
    // --prompt with no value parses to boolean true; must NOT submit a job with prompt "true"
    const code = await runCli(["agent", "--project-id", "p", "--prompt", "--json"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
    assert.equal(code, 2);
    assert.equal(calls.length, 0);
});
test("batch with a nonexistent manifest exits 2 (usage), not 1", async () => {
    const out = [];
    const code = await runCli(["batch", "plan", "/no/such/manifest-xyz.json"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
    assert.equal(code, 2);
    assert.match(out.join(""), /Could not read JSON/);
});
test("published without a slug exits 2 without calling the API", async () => {
    const { calls } = installMockFetch([{ status: 200, json: {} }]);
    const out = [];
    const code = await runCli(["published"], { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) });
    assert.equal(code, 2);
    assert.equal(calls.length, 0);
});
test("parseArgv supports --key=value including values starting with --", () => {
    const r = parseArgv(["agent", "--prompt=--keep this literal", "--json"]);
    assert.equal(r.command, "agent");
    assert.equal(r.flags.prompt, "--keep this literal");
    assert.equal(r.flags.json, true);
});
