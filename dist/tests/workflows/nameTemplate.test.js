import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNamingManifest, templatePlaceholders, renderBatchNames, DEFAULT_NAME_TEMPLATE } from "../../src/workflows/nameTemplate.js";
const UISC_FIELDS = {
    acronym: "UISC-AAS200E",
    cc: "01",
    ll: "01",
    lesson: "Unboxing and Initial Setup"
};
function uiscManifest(languages, template) {
    return parseNamingManifest({ ...UISC_FIELDS, ...(template ? { template } : {}), languages });
}
// ---------------------------------------------------------------- parsing
test("parseNamingManifest rejects non-object roots", () => {
    assert.throws(() => parseNamingManifest("nope"), /JSON object/);
    assert.throws(() => parseNamingManifest([1]), /JSON object/);
    assert.throws(() => parseNamingManifest(null), /JSON object/);
});
test("parseNamingManifest rejects non-string fields and bad languages shapes", () => {
    assert.throws(() => parseNamingManifest({ cc: 1 }), /"cc" must be a string/);
    assert.throws(() => parseNamingManifest({ languages: [] }), /languages/);
    assert.throws(() => parseNamingManifest({ languages: { c1: 7 } }), /c1/);
    assert.throws(() => parseNamingManifest({ languages: { c1: " " } }), /c1/);
    assert.throws(() => parseNamingManifest({ template: 5 }), /"template" must be a string/);
});
test("template resolution order: override beats manifest beats default", () => {
    assert.equal(parseNamingManifest({}).template, DEFAULT_NAME_TEMPLATE);
    assert.equal(parseNamingManifest({ template: "{title}" }).template, "{title}");
    assert.equal(parseNamingManifest({ template: "{title}" }, "{id}").template, "{id}");
});
test("templatePlaceholders extracts in order", () => {
    assert.deepEqual(templatePlaceholders("{a} - {b} x {a}"), ["a", "b", "a"]);
    assert.deepEqual(templatePlaceholders("no placeholders"), []);
});
// ---------------------------------------------------------------- rendering
test("default template renders the iDD standard exactly", () => {
    const r = renderBatchNames(uiscManifest({ c1: "fr-CA", c2: "en" }), [
        { compositionId: "c1" },
        { compositionId: "c2" }
    ]);
    assert.ok(r.ok);
    assert.equal(r.names[0].name, "UISC-AAS200E - 01 - 01 - FR-CA French Canada - Unboxing and Initial Setup");
    assert.equal(r.names[1].name, "UISC-AAS200E - 01 - 01 - EN English - Unboxing and Initial Setup");
    assert.equal(r.names[0].over128, false);
});
test("es-419 renders plain ES per the locked standard", () => {
    const r = renderBatchNames(uiscManifest({ c1: "es-419" }), [{ compositionId: "c1" }]);
    assert.ok(r.ok);
    assert.equal(r.names[0].name, "UISC-AAS200E - 01 - 01 - ES Spanish Latino - Unboxing and Initial Setup");
});
test("missing languages fail loud, listing every offender before any publish", () => {
    const r = renderBatchNames(uiscManifest({ c1: "fr-CA" }), [
        { compositionId: "c1" },
        { compositionId: "c2" },
        { compositionId: "c3" }
    ]);
    assert.ok(!r.ok);
    assert.equal(r.errors.filter((e) => /no language mapped/.test(e)).length, 2);
    assert.ok(r.errors.some((e) => e.includes("c2")));
    assert.ok(r.errors.some((e) => e.includes("c3")));
});
test("unknown codes error with the es disambiguation hint", () => {
    const r = renderBatchNames(uiscManifest({ c1: "es" }), [{ compositionId: "c1" }]);
    assert.ok(!r.ok);
    assert.match(r.errors[0], /es-419/);
    assert.match(r.errors[0], /es-ES/);
});
test("missing template fields error by name", () => {
    const manifest = parseNamingManifest({ languages: { c1: "en" } }); // no acronym/cc/ll/lesson
    const r = renderBatchNames(manifest, [{ compositionId: "c1" }]);
    assert.ok(!r.ok);
    assert.ok(r.errors.some((e) => e.includes("{acronym}")));
    assert.ok(r.errors.some((e) => e.includes("{lesson}")));
});
test("slug placeholder is rejected in export mode", () => {
    const manifest = parseNamingManifest({}, "{slug} - {id}");
    const r = renderBatchNames(manifest, [{ compositionId: "c1" }]);
    assert.ok(!r.ok);
    assert.match(r.errors[0], /slug.*not available/i);
});
test("placeholder-free templates are rejected (every file would collide)", () => {
    const manifest = parseNamingManifest({}, "static name");
    const r = renderBatchNames(manifest, [{ compositionId: "c1" }]);
    assert.ok(!r.ok);
    assert.match(r.errors[0], /no \{placeholders\}/);
});
test("duplicate rendered names fail listing both composition ids", () => {
    const r = renderBatchNames(uiscManifest({ c1: "fr-CA", c2: "fr-CA" }), [
        { compositionId: "c1" },
        { compositionId: "c2" }
    ]);
    assert.ok(!r.ok);
    assert.ok(r.errors.some((e) => e.includes("c1") && e.includes("c2")));
});
test("built-ins {title} and {id} render, and rendered names are sanitized", () => {
    const manifest = parseNamingManifest({}, "{title} - {id}");
    const r = renderBatchNames(manifest, [{ compositionId: "c1", title: "My / Composition & Co" }]);
    assert.ok(r.ok);
    assert.equal(r.names[0].name, "My - Composition and Co - c1");
});
test("names over 128 chars flag over128 but still render (warn, never trim)", () => {
    const longLesson = "Radiographic Diagnosis on Developmental Anomalies and Clinical Implications Extended Edition";
    const manifest = parseNamingManifest({ ...UISC_FIELDS, lesson: longLesson, languages: { c1: "zh-Hant" } });
    const r = renderBatchNames(manifest, [{ compositionId: "c1" }]);
    assert.ok(r.ok);
    assert.ok(r.names[0].name.length > 128);
    assert.equal(r.names[0].over128, true);
});
