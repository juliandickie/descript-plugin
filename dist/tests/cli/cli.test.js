import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../../src/cli/index.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";
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
    const c = capture();
    const code = await runCli(["status"], { env: {}, stdout: c.write, stderr: c.write });
    assert.notEqual(code, 0);
    assert.match(c.out.join(""), /No Descript API token/);
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
