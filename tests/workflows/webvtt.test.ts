import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVtt } from "../../src/workflows/webvtt.js";

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
