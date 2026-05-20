import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitize } from "../../src/workflows/filenameSanitize.js";
test("clean ASCII title round-trips unchanged", () => {
    assert.equal(sanitize("MC2 - I'd Pay Double - Ben Sorensen - 9x16 - Card"), "MC2 - I'd Pay Double - Ben Sorensen - 9x16 - Card");
});
test("normalises ligatures fi fl ff ffi ffl ft st", () => {
    assert.equal(sanitize("ﬁnal cut"), "final cut");
    assert.equal(sanitize("ﬂag"), "flag");
    assert.equal(sanitize("oﬀer"), "offer");
    assert.equal(sanitize("aﬃx"), "affix");
    assert.equal(sanitize("baﬄing"), "baffling");
    assert.equal(sanitize("soﬅ"), "soft");
    assert.equal(sanitize("ﬆation"), "station");
});
test("normalises curly quotes to straight", () => {
    assert.equal(sanitize("'hello'"), "'hello'");
    assert.equal(sanitize("“holy”"), '"holy"');
});
test("strips trademark / copyright glyphs", () => {
    assert.equal(sanitize("Brand™ X"), "Brand X");
    assert.equal(sanitize("Foo® Bar"), "Foo Bar");
    assert.equal(sanitize("Service℠"), "Service");
    assert.equal(sanitize("Music© 2026"), "Music 2026");
    assert.equal(sanitize("Recording℗"), "Recording");
});
test("replaces & with the word and", () => {
    assert.equal(sanitize("Rock & Roll"), "Rock and Roll");
    assert.equal(sanitize("A&B&C"), "AandBandC");
});
test("replaces / and \\ with -", () => {
    assert.equal(sanitize("foo/bar"), "foo-bar");
    assert.equal(sanitize("foo\\bar"), "foo-bar");
});
test("drops < > ? # % * : | and ASCII control chars", () => {
    assert.equal(sanitize("a<b>c?d#e%f*g:h|i"), "abcdefghi");
    assert.equal(sanitize("a\x00b\x1fc\x7fd"), "abcd");
});
test("collapses whitespace and trims", () => {
    assert.equal(sanitize("  a   b  c  "), "a b c");
    assert.equal(sanitize("a\tb\nc"), "a b c");
});
test("truncates to 200 chars", () => {
    const longTitle = "x".repeat(300);
    assert.equal(sanitize(longTitle).length, 200);
});
test("falls back to untitled-<slug> when result is empty after sanitisation", () => {
    assert.equal(sanitize(""), "untitled");
    assert.equal(sanitize(":|*?"), "untitled");
    assert.equal(sanitize("."), "untitled");
    assert.equal(sanitize(".."), "untitled");
});
