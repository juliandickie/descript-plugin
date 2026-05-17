import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCredentials } from "../../src/config/credentials.js";
import { DescriptClient } from "../../src/client/index.js";
function tmpConfig(contents) {
    const dir = mkdtempSync(join(tmpdir(), "descript-cfg-"));
    const path = join(dir, "credentials.json");
    writeFileSync(path, JSON.stringify(contents));
    return path;
}
test("flag token wins over everything", () => {
    const c = resolveCredentials({ flagToken: "FLAG", env: { DESCRIPT_API_TOKEN: "ENV" }, configPath: "/nope" });
    assert.equal(c.token, "FLAG");
    assert.equal(c.source, "flag");
});
test("env var wins over config file", () => {
    const path = tmpConfig({ profiles: { default: { api_token: "FILE" } } });
    const c = resolveCredentials({ env: { DESCRIPT_API_TOKEN: "ENV" }, configPath: path });
    assert.equal(c.token, "ENV");
    rmSync(path, { force: true });
});
test("config file profile is used and profile selectable", () => {
    const path = tmpConfig({ default_profile: "idd", profiles: { idd: { api_token: "IDD" }, promo: { api_token: "PROMO" } } });
    assert.equal(resolveCredentials({ env: {}, configPath: path }).token, "IDD");
    assert.equal(resolveCredentials({ env: {}, configPath: path, profile: "promo" }).token, "PROMO");
    assert.equal(resolveCredentials({ env: { DESCRIPT_PROFILE: "promo" }, configPath: path }).token, "PROMO");
    rmSync(path, { force: true });
});
test("plugin userConfig env var is the final fallback", () => {
    const c = resolveCredentials({ env: { CLAUDE_PLUGIN_OPTION_API_TOKEN: "PLUGIN" }, configPath: "/nope" });
    assert.equal(c.token, "PLUGIN");
    assert.equal(c.source, "plugin");
});
test("throws a clear error when no token resolves", () => {
    assert.throws(() => resolveCredentials({ env: {}, configPath: "/nope" }), /No Descript API token/);
});
test("DescriptClient exposes every endpoint group", () => {
    const c = new DescriptClient({ token: "t" });
    for (const m of ["importProjectMedia", "agentEditJob", "publishJob", "listJobs", "getJob", "cancelJob", "listProjects", "getProject", "getStatus", "getPublishedProjectMetadata", "postEditInDescriptSchema"]) {
        assert.equal(typeof c[m], "function", `missing ${m}`);
    }
});
test("missing named profile falls through to throw when no other source", () => {
    const path = tmpConfig({ profiles: { default: { api_token: "FILE" } } });
    assert.throws(() => resolveCredentials({ profile: "nonexistent", env: {}, configPath: path }), /No Descript API token/);
    rmSync(path, { force: true });
});
test("missing named profile falls through to plugin env, never another profile", () => {
    const path = tmpConfig({ profiles: { idd: { api_token: "IDD" }, promo: { api_token: "PROMO" } } });
    const c = resolveCredentials({
        profile: "idd-typo",
        env: { CLAUDE_PLUGIN_OPTION_API_TOKEN: "PLUGIN" },
        configPath: path
    });
    assert.equal(c.token, "PLUGIN");
    assert.equal(c.source, "plugin");
    rmSync(path, { force: true });
});
