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
    return { path, dir };
}
test("flag token wins over everything", () => {
    const c = resolveCredentials({ flagToken: "FLAG", env: { DESCRIPT_API_TOKEN: "ENV" }, configPath: "/nope" });
    assert.equal(c.token, "FLAG");
    assert.equal(c.source, "flag");
});
test("env var wins over config file", () => {
    const { path, dir } = tmpConfig({ profiles: { default: { api_token: "FILE" } } });
    const c = resolveCredentials({ env: { DESCRIPT_API_TOKEN: "ENV" }, configPath: path });
    assert.equal(c.token, "ENV");
    rmSync(dir, { recursive: true, force: true });
});
test("config file profile is used and profile selectable", () => {
    const { path, dir } = tmpConfig({ default_profile: "idd", profiles: { idd: { api_token: "IDD" }, promo: { api_token: "PROMO" } } });
    assert.equal(resolveCredentials({ env: {}, configPath: path }).token, "IDD");
    assert.equal(resolveCredentials({ env: {}, configPath: path, profile: "promo" }).token, "PROMO");
    assert.equal(resolveCredentials({ env: { DESCRIPT_PROFILE: "promo" }, configPath: path }).token, "PROMO");
    rmSync(dir, { recursive: true, force: true });
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
    const { path, dir } = tmpConfig({ profiles: { default: { api_token: "FILE" } } });
    assert.throws(() => resolveCredentials({ profile: "nonexistent", env: {}, configPath: path }), /No Descript API token/);
    rmSync(dir, { recursive: true, force: true });
});
test("missing named profile falls through to plugin env, never another profile", () => {
    const { path, dir } = tmpConfig({ profiles: { idd: { api_token: "IDD" }, promo: { api_token: "PROMO" } } });
    const c = resolveCredentials({
        profile: "idd-typo",
        env: { CLAUDE_PLUGIN_OPTION_API_TOKEN: "PLUGIN" },
        configPath: path
    });
    assert.equal(c.token, "PLUGIN");
    assert.equal(c.source, "plugin");
    rmSync(dir, { recursive: true, force: true });
});
test("plugin default_profile env selects the profile, but flag and DESCRIPT_PROFILE still win", () => {
    const { path, dir } = tmpConfig({ profiles: { idd: { api_token: "IDD" }, promo: { api_token: "PROMO" } } });
    // plugin-config default selects the profile when nothing higher-precedence is set
    const c = resolveCredentials({ env: { CLAUDE_PLUGIN_OPTION_DEFAULT_PROFILE: "promo" }, configPath: path });
    assert.equal(c.token, "PROMO");
    assert.equal(c.profile, "promo");
    // explicit --profile flag wins over the plugin default
    assert.equal(resolveCredentials({ profile: "idd", env: { CLAUDE_PLUGIN_OPTION_DEFAULT_PROFILE: "promo" }, configPath: path }).token, "IDD");
    // DESCRIPT_PROFILE shell env wins over the plugin default
    assert.equal(resolveCredentials({ env: { DESCRIPT_PROFILE: "idd", CLAUDE_PLUGIN_OPTION_DEFAULT_PROFILE: "promo" }, configPath: path }).token, "IDD");
    rmSync(dir, { recursive: true, force: true });
});
// ---- DESCRIPT_CONFIG_PATH env var precedence in resolveCredentials ----
// These are coverage-gap tests: they document already-correct behavior,
// so they pass against current code by design (not red-green).
test("DESCRIPT_CONFIG_PATH env var resolves token from that file with source=file (coverage gap)", () => {
    const { path, dir } = tmpConfig({ default_profile: "default", profiles: { default: { api_token: "CFG_PATH_TOKEN" } } });
    const c = resolveCredentials({ env: { DESCRIPT_CONFIG_PATH: path } });
    assert.equal(c.token, "CFG_PATH_TOKEN");
    assert.equal(c.source, "file");
    rmSync(dir, { recursive: true, force: true });
});
test("explicit configPath option overrides DESCRIPT_CONFIG_PATH env var (coverage gap)", () => {
    const a = tmpConfig({ default_profile: "default", profiles: { default: { api_token: "FROM_OPT" } } });
    const b = tmpConfig({ default_profile: "default", profiles: { default: { api_token: "FROM_ENV" } } });
    // opts.configPath must win over env.DESCRIPT_CONFIG_PATH
    const c = resolveCredentials({ env: { DESCRIPT_CONFIG_PATH: b.path }, configPath: a.path });
    assert.equal(c.token, "FROM_OPT");
    assert.equal(c.source, "file");
    rmSync(a.dir, { recursive: true, force: true });
    rmSync(b.dir, { recursive: true, force: true });
});
test("--token flag and DESCRIPT_API_TOKEN both win over DESCRIPT_CONFIG_PATH (coverage gap)", () => {
    const { path, dir } = tmpConfig({ default_profile: "default", profiles: { default: { api_token: "FILE_TOKEN" } } });
    // --token (flagToken) has highest precedence
    const fromFlag = resolveCredentials({ flagToken: "FLAG_TOKEN", env: { DESCRIPT_CONFIG_PATH: path } });
    assert.equal(fromFlag.token, "FLAG_TOKEN");
    assert.equal(fromFlag.source, "flag");
    // DESCRIPT_API_TOKEN beats DESCRIPT_CONFIG_PATH
    const fromEnv = resolveCredentials({ env: { DESCRIPT_API_TOKEN: "ENV_TOKEN", DESCRIPT_CONFIG_PATH: path } });
    assert.equal(fromEnv.token, "ENV_TOKEN");
    assert.equal(fromEnv.source, "env");
    rmSync(dir, { recursive: true, force: true });
});
