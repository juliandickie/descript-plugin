import { test } from "node:test";
import assert from "node:assert/strict";
test("toolchain runs typescript tests", () => {
    assert.equal(1 + 1, 2);
});
// package-lock.json sat at 0.3.0 through four releases because nothing checked it.
test("package.json, package-lock.json and plugin.json carry the same version", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    // dist/tests -> repo root
    const root = join(import.meta.dirname, "..", "..");
    const read = (...p) => JSON.parse(readFileSync(join(root, ...p), "utf8"));
    const version = read("package.json").version;
    assert.match(version, /^\d+\.\d+\.\d+$/);
    const lock = read("package-lock.json");
    assert.equal(lock.version, version, "package-lock.json root version (run: npm install --package-lock-only)");
    assert.equal(lock.packages[""].version, version, "package-lock.json packages[\"\"] version");
    assert.equal(read(".claude-plugin", "plugin.json").version, version, ".claude-plugin/plugin.json version");
});
