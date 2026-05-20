import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVtt, toSrt } from "../../src/workflows/webvtt.js";

const SAMPLE_VTT = `WEBVTT

NOTE
This is a Descript-emitted comment that should be skipped.

00:00:00.000 --> 00:00:02.400
Ben Sorensen: First cue text.

00:00:02.400 --> 00:00:05.800
Continues here.
Second line of cue 2.

00:00:05.800 --> 00:00:08.000
Final cue.
`;

test("parses cues and skips header and NOTE blocks", () => {
  const cues = parseVtt(SAMPLE_VTT);
  assert.equal(cues.length, 3);
  const c = cues[0];
  assert.ok(c !== undefined);
  assert.equal(c.start, "00:00:00.000");
  assert.equal(c.end, "00:00:02.400");
  assert.equal(c.text, "Ben Sorensen: First cue text.");
});

test("preserves multi-line cue text", () => {
  const cues = parseVtt(SAMPLE_VTT);
  const c = cues[1];
  assert.ok(c !== undefined);
  assert.equal(c.text, "Continues here.\nSecond line of cue 2.");
});

test("returns empty array for empty input", () => {
  assert.deepEqual(parseVtt(""), []);
});

test("returns empty array for WEBVTT-only input with no cues", () => {
  assert.deepEqual(parseVtt("WEBVTT\n\n"), []);
});

test("tolerates Windows CRLF line endings", () => {
  const crlf = SAMPLE_VTT.replace(/\n/g, "\r\n");
  const cues = parseVtt(crlf);
  assert.equal(cues.length, 3);
});

test("drops cue settings appended to the timestamp line", () => {
  const withSettings = `WEBVTT

00:00:00.000 --> 00:00:01.000 align:start position:10%
Cue with settings.
`;
  const cues = parseVtt(withSettings);
  assert.equal(cues.length, 1);
  const c = cues[0];
  assert.ok(c !== undefined);
  assert.equal(c.text, "Cue with settings.");
});

// v0.3.0 followup §3.2 edge cases - none of these caused bugs in the shipped code,
// but they document the defensive parser behaviour so a future refactor cannot
// silently regress.

test("parseVtt handles NOTE block at EOF without trailing blank line (v0.3.0 followup §3.2)", () => {
  // The NOTE consumer reads until a blank line or EOF. With no trailing blank,
  // the loop exits via the i >= lines.length condition and parsing completes cleanly.
  const noTrailingBlank = "WEBVTT\n\nNOTE\nA closing note without a trailing newline";
  const cues = parseVtt(noTrailingBlank);
  assert.deepEqual(cues, []);
});

test("parseVtt handles timestamp-line followed immediately by EOF without text lines", () => {
  // No text lines under the timestamp. The text-collection loop never enters,
  // producing a cue with empty text rather than crashing.
  const noTextBelow = "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n";
  const cues = parseVtt(noTextBelow);
  assert.equal(cues.length, 1);
  const c = cues[0];
  assert.ok(c !== undefined);
  assert.equal(c.text, "");
  assert.equal(c.start, "00:00:00.000");
  assert.equal(c.end, "00:00:01.000");
});

test("parseVtt skips NOTE body that itself contains a timestamp-looking pattern", () => {
  // The NOTE consumer treats every line up to the next blank line as note body,
  // including lines that happen to look like timestamps. The fake timestamp must
  // not produce a phantom cue.
  const noteWithFakeTimestamp = `WEBVTT

NOTE
this looks like 00:00:00.000 --> 00:00:01.000 but is inside a NOTE

00:00:02.000 --> 00:00:03.000
real cue.
`;
  const cues = parseVtt(noteWithFakeTimestamp);
  assert.equal(cues.length, 1);
  const c = cues[0];
  assert.ok(c !== undefined);
  assert.equal(c.start, "00:00:02.000");
  assert.equal(c.text, "real cue.");
});

test("toSrt numbers cues starting at 1 and uses comma millis", () => {
  const cues = [
    { start: "00:00:00.000", end: "00:00:02.400", text: "First." },
    { start: "00:00:02.400", end: "00:00:05.800", text: "Second." }
  ];
  const srt = toSrt(cues);
  assert.equal(srt,
    "1\n" +
    "00:00:00,000 --> 00:00:02,400\n" +
    "First.\n" +
    "\n" +
    "2\n" +
    "00:00:02,400 --> 00:00:05,800\n" +
    "Second.\n"
  );
});

test("toSrt preserves multi-line cue text verbatim", () => {
  const cues = [{ start: "00:00:00.000", end: "00:00:02.000", text: "Line 1.\nLine 2." }];
  const srt = toSrt(cues);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:02,000\nLine 1\.\nLine 2\.\n$/);
});

test("toSrt returns just a trailing newline for empty input", () => {
  assert.equal(toSrt([]), "\n");
});

import { toMd } from "../../src/workflows/webvtt.js";

test("toMd renders H1 title, per-cue paragraphs, speaker on change, END marker", () => {
  const cues = [
    { start: "00:00:00.000", end: "00:00:02.400", text: "Ben Sorensen: First cue text." },
    { start: "00:00:02.400", end: "00:00:05.800", text: "Same speaker, second cue." },
    { start: "00:00:05.800", end: "00:00:08.000", text: "Alice Jones: Speaker changed here." }
  ];
  const md = toMd(cues, "My Test Title", { endMarker: true });
  const expected =
    "# My Test Title\n" +
    "\n" +
    "[00:00:00] **Ben Sorensen:** First cue text. \n" +
    "\n" +
    "[00:00:02] Same speaker, second cue. \n" +
    "\n" +
    "[00:00:05] **Alice Jones:** Speaker changed here. \n" +
    "\n" +
    "[00:00:08] END\n";
  assert.equal(md, expected);
});

test("toMd with endMarker false omits the END line entirely", () => {
  const cues = [
    { start: "00:00:00.000", end: "00:00:02.000", text: "Ben: hello." }
  ];
  const md = toMd(cues, "T", { endMarker: false });
  const expected =
    "# T\n" +
    "\n" +
    "[00:00:00] **Ben:** hello. \n";
  assert.equal(md, expected);
});

test("toMd handles empty cues with just the H1 and newline", () => {
  const md = toMd([], "Empty", { endMarker: true });
  assert.equal(md, "# Empty\n");
});

test("toMd timestamp truncates, never rounds", () => {
  const cues = [{ start: "00:00:01.999", end: "00:00:02.999", text: "Speaker: x." }];
  const md = toMd(cues, "T", { endMarker: false });
  assert.match(md, /\[00:00:01\] /);
});

test("toMd detects hyphenated, apostrophed, period-containing speaker names", () => {
  const cues = [
    { start: "00:00:00.000", end: "00:00:01.000", text: "Dr. Jane Smith-Brown: hello." },
    { start: "00:00:01.000", end: "00:00:02.000", text: "ID Speaker_1: world." }
  ];
  const md = toMd(cues, "T", { endMarker: false });
  assert.match(md, /\*\*Dr\. Jane Smith-Brown:\*\* hello\./);
  assert.match(md, /\*\*ID Speaker_1:\*\* world\./);
});
