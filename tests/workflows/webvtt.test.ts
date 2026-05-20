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
