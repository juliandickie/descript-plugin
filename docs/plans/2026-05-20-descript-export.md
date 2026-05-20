# Descript Export - MP4, SRT, MD Local Export Workflow - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `descript export` and `descript download-published` as the v0.3.0 release - one-shot local export of MP4 + SRT + Markdown transcripts from one or many Descript compositions, with batch fan-out across projects, a closed-loop read-only re-fetch path for chapter-gen iteration, and a concurrency smoke test in the dev workflow.

**Architecture:** Three new workflow modules in `src/workflows/` (`webvtt.ts`, `filenameSanitize.ts`, `exportPublished.ts`, `exportBatch.ts`) plus two new CLI commands in `src/cli/commands/registry.ts` and two new skills under `skills/`. Both CLI commands always route through `exportBatch` so the report-writing path is uniform (single-comp is a batch of size 1). TDD throughout, matching v0.2.1 discipline.

**Tech Stack:** TypeScript (NodeNext, strict), Node 24 `node:test`, `node:fs`, `node:path`. Zero runtime dependencies. Existing `DescriptClient` and `installMockFetch` helpers used for I/O layers.

---

## Commit gating - read before executing

The user has a standing rule - no commit, push, tag, or version bump without explicit per-commit approval. Every "Commit" step below is therefore **gated**. At each commit step, stage only the exact paths listed, present the staged scope, and wait for explicit approval before running `git commit`. Do not push or tag without further approval.

The plan is structured so each task lands the repo in a passing state. Run `npm test` at the end of every task as the verify step before commit.

---

## Dependencies and sequencing

Phase order:

1. **Phase 1 (Tasks 1-4) - Pure functions.** `filenameSanitize` and `webvtt` modules. No I/O, no client. Foundation everything else builds on.

2. **Phase 2 (Tasks 5-7) - Per-slug pipeline.** `exportPublished.ts`. Depends on Phase 1 for the converter and sanitiser.

3. **Phase 3 (Tasks 8-11) - Batch fan-out.** `exportBatch.ts`. Depends on Phase 2 for the per-slug pipeline.

4. **Phase 4 (Tasks 12-15) - CLI integration.** Registry entries plus integration tests. Depends on Phase 3.

5. **Phase 5 (Tasks 16-18) - Skills and docs.** SKILL.md files, CLAUDE.md addition, README addition. No code dependencies; can run after Phase 4 lands.

6. **Phase 6 (Tasks 19-21) - Smoke test and release.** Smoke test script, run it against a real iDD project, set production `--concurrency` default, version bump.

---

## File Structure

**New files:**

- `src/workflows/filenameSanitize.ts` - pure `sanitize(title: string): string`.
- `src/workflows/webvtt.ts` - pure `parseVtt`, `toSrt`, `toMd`.
- `src/workflows/exportPublished.ts` - per-slug pipeline.
- `src/workflows/exportBatch.ts` - batch fan-out and report writing.
- `tests/workflows/filenameSanitize.test.ts`
- `tests/workflows/webvtt.test.ts`
- `tests/workflows/exportPublished.test.ts`
- `tests/workflows/exportBatch.test.ts`
- `skills/descript-export/SKILL.md`
- `skills/descript-download-published/SKILL.md`
- `scripts/smoke/concurrency.ts` (gitignored output: `scripts/smoke/results/`)

**Modified files:**

- `src/cli/commands/registry.ts` - add `export` and `download-published` entries.
- `src/cli/index.ts` - update global USAGE line.
- `tests/cli/cli.test.ts` - add CLI integration tests for both new commands.
- `CLAUDE.md` - one sentence appended to Cost and Risk Safety.
- `README.md` - one paragraph in use-cases section.
- `package.json` - new `smoke:concurrency` script.
- `.gitignore` - exclude `scripts/smoke/results/`.

**At release (Task 21):**

- `package.json` - version bump.
- `package-lock.json` - version bump.
- `.claude-plugin/plugin.json` - version bump.
- `CHANGELOG.md` - new v0.3.0 entry.

---

### Task 1: `sanitize()` with all CLAUDE.md Drive-sync rules

**Files:**
- Create: `src/workflows/filenameSanitize.ts`
- Test: `tests/workflows/filenameSanitize.test.ts`

- [ ] **Step 1: Write the failing test file with all rule cases**

Create `tests/workflows/filenameSanitize.test.ts`:

```typescript
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
  assert.equal(sanitize("‘hello’"), "'hello'");
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
```

- [ ] **Step 2: Run tests to verify they fail (module does not exist yet)**

Run: `npm test 2>&1 | grep -i sanitize | head -5`

Expected: import error / module not found, all sanitize tests fail.

- [ ] **Step 3: Write the implementation**

Create `src/workflows/filenameSanitize.ts`:

```typescript
const LIGATURES: Record<string, string> = {
  "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl",
  "ﬃ": "ffi", "ﬄ": "ffl",
  "ﬅ": "ft", "ﬆ": "st"
};

const TRADEMARK_GLYPHS = /[™®Ⓡ℠©℗]/g;
const FORBIDDEN_DROP = /[<>?#%*:|\x00-\x1f\x7f]/g;
const WHITESPACE_RUN = /\s+/g;

export function sanitize(title: string): string {
  let s = title;

  // 1. Ligatures
  s = s.replace(/[ﬀ-ﬆ]/g, (ch) => LIGATURES[ch] ?? ch);

  // 2. Curly quotes to straight
  s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

  // 3. Strip trademark / copyright glyphs
  s = s.replace(TRADEMARK_GLYPHS, "");

  // 4. & to "and"
  s = s.replace(/&/g, "and");

  // 5. Slashes to hyphens
  s = s.replace(/[\/\\]/g, "-");

  // 6. Drop forbidden chars and ASCII controls
  s = s.replace(FORBIDDEN_DROP, "");

  // 7. Collapse whitespace and trim
  s = s.replace(WHITESPACE_RUN, " ").trim();

  // 8. Truncate to 200 chars
  if (s.length > 200) s = s.slice(0, 200);

  // 9. Empty / dot fallback
  if (s === "" || s === "." || s === "..") return "untitled";

  return s;
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm test 2>&1 | tail -20`

Expected: all 10 sanitize tests pass, no other tests broken, total count = 111 (was 101).

- [ ] **Step 5: Commit**

Stage and present scope, wait for approval:

```bash
git add src/workflows/filenameSanitize.ts tests/workflows/filenameSanitize.test.ts dist/src/workflows/filenameSanitize.js dist/tests/workflows/filenameSanitize.test.js
```

Run `npm run build` first to generate the dist/ files. Then commit message:

```
feat(workflows): add filename sanitiser for Drive-sync-safe output paths

Pure function applying the CLAUDE.md filename hygiene rules per path
segment (ligatures, curly quotes, trademarks, &, slashes, forbidden
chars, whitespace, truncation, empty fallback). Foundation for the
descript-export output-dir naming.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 2: `webvtt.ts` - `parseVtt()`

**Files:**
- Create: `src/workflows/webvtt.ts` (parseVtt only; toSrt and toMd added in Tasks 3, 4)
- Test: `tests/workflows/webvtt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/workflows/webvtt.test.ts`:

```typescript
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
  assert.equal(cues[0].start, "00:00:00.000");
  assert.equal(cues[0].end, "00:00:02.400");
  assert.equal(cues[0].text, "Ben Sorensen: First cue text.");
});

test("preserves multi-line cue text", () => {
  const cues = parseVtt(SAMPLE_VTT);
  assert.equal(cues[1].text, "Continues here.\nSecond line of cue 2.");
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
  assert.equal(cues[0].text, "Cue with settings.");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -E "webvtt|parseVtt" | head`

Expected: module-not-found error for `parseVtt`.

- [ ] **Step 3: Write the implementation**

Create `src/workflows/webvtt.ts`:

```typescript
export interface Cue {
  start: string;
  end: string;
  text: string;
}

const TIMESTAMP_LINE = /^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/;

export function parseVtt(content: string): Cue[] {
  const lines = content.split(/\r?\n/);
  const cues: Cue[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip WEBVTT header
    if (line === "WEBVTT" || line.startsWith("WEBVTT ")) {
      i++;
      continue;
    }

    // Skip NOTE blocks (multi-line, terminated by blank line)
    if (line === "NOTE" || line.startsWith("NOTE ")) {
      i++;
      while (i < lines.length && lines[i].trim() !== "") i++;
      i++;
      continue;
    }

    const m = line.match(TIMESTAMP_LINE);
    if (!m) {
      i++;
      continue;
    }

    const start = m[1];
    const end = m[2];
    i++;

    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      textLines.push(lines[i]);
      i++;
    }
    cues.push({ start, end, text: textLines.join("\n") });
    i++;
  }
  return cues;
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm test 2>&1 | tail -15`

Expected: all 6 parseVtt tests pass. Total count = 117.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/workflows/webvtt.ts tests/workflows/webvtt.test.ts dist/src/workflows/webvtt.js dist/tests/workflows/webvtt.test.js
```

Commit message:

```
feat(workflows): add WebVTT parser (skips header, NOTE, tolerates CRLF)

First piece of the webvtt module: parseVtt returns Cue[] with start,
end, and multi-line text preserved. Skips the WEBVTT header line and
NOTE blocks. Tolerates Windows line endings. Drops cue-settings on
the timestamp line. Direct port of the field report's Section 5
parser.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 3: `webvtt.ts` - `toSrt()`

**Files:**
- Modify: `src/workflows/webvtt.ts`
- Modify: `tests/workflows/webvtt.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/workflows/webvtt.test.ts`:

```typescript
import { toSrt } from "../../src/workflows/webvtt.js";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -E "toSrt" | head`

Expected: import error for `toSrt`.

- [ ] **Step 3: Add the `toSrt` implementation**

Append to `src/workflows/webvtt.ts`:

```typescript
export function toSrt(cues: Cue[]): string {
  if (cues.length === 0) return "\n";
  return cues
    .map((c, idx) => {
      const start = c.start.replace(".", ",");
      const end = c.end.replace(".", ",");
      return `${idx + 1}\n${start} --> ${end}\n${c.text}`;
    })
    .join("\n\n") + "\n";
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm test 2>&1 | tail -15`

Expected: 3 new toSrt tests pass. Total count = 120.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/workflows/webvtt.ts tests/workflows/webvtt.test.ts dist/src/workflows/webvtt.js dist/tests/workflows/webvtt.test.js
```

Commit message:

```
feat(workflows): add WebVTT to SRT converter (toSrt)

Cues numbered from 1, comma-separated millis, multi-line cue text
preserved verbatim, single POSIX newline at EOF, empty input yields
a trailing newline only. Port of Section 5 toSrt function.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 4: `webvtt.ts` - `toMd()` with endMarker option

**Files:**
- Modify: `src/workflows/webvtt.ts`
- Modify: `tests/workflows/webvtt.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/workflows/webvtt.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -E "toMd" | head`

Expected: import error for `toMd`.

- [ ] **Step 3: Add the `toMd` implementation**

Append to `src/workflows/webvtt.ts`:

```typescript
const SPEAKER_RE = /^([A-Z][\p{L}\s.'\-_0-9]+?):\s+/u;

function truncTimecode(vttTs: string): string {
  const dot = vttTs.indexOf(".");
  return dot === -1 ? vttTs : vttTs.slice(0, dot);
}

export function toMd(cues: Cue[], title: string, opts: { endMarker: boolean }): string {
  const out: string[] = [];
  out.push(`# ${title}`);
  out.push("");

  let currentSpeaker: string | null = null;
  for (const cue of cues) {
    let body = cue.text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

    let speakerForThisPara: string | null = null;
    const m = body.match(SPEAKER_RE);
    if (m) {
      const detected = m[1].trim();
      body = body.slice(m[0].length);
      if (detected !== currentSpeaker) {
        speakerForThisPara = detected;
        currentSpeaker = detected;
      }
    }

    const ts = truncTimecode(cue.start);
    const prefix = speakerForThisPara
      ? `[${ts}] **${speakerForThisPara}:** `
      : `[${ts}] `;

    out.push(`${prefix}${body} `);
    out.push("");
  }

  if (opts.endMarker && cues.length > 0) {
    const lastEnd = truncTimecode(cues[cues.length - 1].end);
    out.push(`[${lastEnd}] END`);
    out.push("");
  }

  return out.join("\n").trimEnd() + "\n";
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npm test 2>&1 | tail -15`

Expected: 5 new toMd tests pass. Total count = 125.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/workflows/webvtt.ts tests/workflows/webvtt.test.ts dist/src/workflows/webvtt.js dist/tests/workflows/webvtt.test.js
```

Commit message:

```
feat(workflows): add WebVTT to Markdown converter (toMd)

H1 title, per-cue paragraphs with [HH:MM:SS] truncated timestamps,
speaker label only on speaker change, optional [HH:MM:SS] END marker
behind the endMarker flag. Port of Section 5 toMd with the only
configurable knob being the end marker. Handles empty cues, multi-
line cue text, hyphenated and apostrophed speaker names.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 5: `exportPublished.ts` - happy path (all three formats)

**Files:**
- Create: `src/workflows/exportPublished.ts`
- Test: `tests/workflows/exportPublished.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/workflows/exportPublished.test.ts`:

```typescript
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DescriptClient } from "../../src/client/index.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";
import { exportPublished } from "../../src/workflows/exportPublished.js";

afterEach(() => restoreFetch());

const SAMPLE_VTT = `WEBVTT

00:00:00.000 --> 00:00:02.400
Ben Sorensen: First.

00:00:02.400 --> 00:00:05.800
Second.
`;

test("happy path writes all three formats with sanitised filenames", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
  installMockFetch([
    {
      status: 200,
      json: {
        download_url: "https://gcs.example/My%20Composition.mp4?sig=abc",
        download_url_expires_at: "2026-05-21T00:00:00Z",
        project_id: "p1",
        publish_type: "video",
        privacy: "private",
        metadata: { title: "My / Composition" },
        subtitles: SAMPLE_VTT
      }
    },
    { status: 200, text: "mp4-bytes-here" }
  ]);

  const client = new DescriptClient({ token: "t" });
  const result = await exportPublished(client, {
    slug: "abc-123",
    outputDir: dir,
    formats: ["mp4", "srt", "md"],
    endMarker: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.slug, "abc-123");
  assert.equal(result.title, "My / Composition");
  assert.deepEqual(result.written, ["mp4", "srt", "md"]);
  assert.deepEqual(result.failed, []);

  const compDir = join(dir, "My - Composition");
  assert.ok(existsSync(join(compDir, "My - Composition.mp4")));
  assert.ok(existsSync(join(compDir, "My - Composition.srt")));
  assert.ok(existsSync(join(compDir, "My - Composition.md")));
  assert.equal(readFileSync(join(compDir, "My - Composition.mp4"), "utf8"), "mp4-bytes-here");
  assert.match(readFileSync(join(compDir, "My - Composition.md"), "utf8"), /\*\*Ben Sorensen:\*\* First\./);

  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -E "exportPublished" | head`

Expected: module-not-found error.

- [ ] **Step 3: Implement the happy path**

Create `src/workflows/exportPublished.ts`:

```typescript
import { mkdirSync, writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { DescriptClient } from "../client/index.js";
import { sanitize } from "./filenameSanitize.js";
import { parseVtt, toSrt, toMd } from "./webvtt.js";

export type ExportFormat = "mp4" | "srt" | "md";

export interface ExportPublishedOptions {
  slug: string;
  outputDir: string;
  formats: ExportFormat[];
  endMarker: boolean;
  projectFolder?: string;
}

export interface ExportPublishedResult {
  ok: boolean;
  slug: string;
  title: string;
  outputDir: string;
  written: ExportFormat[];
  failed: Array<{ format: ExportFormat; error: string }>;
}

function extensionFromUrl(downloadUrl: string, publishType: string): string {
  try {
    const u = new URL(downloadUrl);
    const path = decodeURIComponent(u.pathname);
    const dot = path.lastIndexOf(".");
    if (dot !== -1 && dot < path.length - 1) {
      const ext = path.slice(dot).toLowerCase();
      if (/^\.[a-z0-9]{2,5}$/.test(ext)) return ext;
    }
  } catch { /* fall through */ }
  if (publishType === "audio") return ".mp3";
  return ".mp4";
}

async function writeAtomic(path: string, body: Uint8Array | string): Promise<void> {
  const partial = `${path}.partial`;
  if (existsSync(partial)) unlinkSync(partial);
  writeFileSync(partial, body);
  renameSync(partial, path);
}

export async function exportPublished(
  client: DescriptClient,
  opts: ExportPublishedOptions
): Promise<ExportPublishedResult> {
  const meta = await client.getPublishedProjectMetadata(opts.slug);
  const title = meta.metadata?.title ?? "untitled";
  const safeTitle = sanitize(title);
  const targetDir = opts.projectFolder
    ? join(opts.outputDir, opts.projectFolder, safeTitle)
    : join(opts.outputDir, safeTitle);
  mkdirSync(targetDir, { recursive: true });

  const written: ExportFormat[] = [];
  const failed: Array<{ format: ExportFormat; error: string }> = [];

  for (const fmt of opts.formats) {
    try {
      if (fmt === "mp4") {
        if (!meta.download_url) throw new Error("metadata response has no download_url");
        const ext = extensionFromUrl(meta.download_url, meta.publish_type);
        const out = join(targetDir, `${safeTitle}${ext}`);
        const res = await fetch(meta.download_url);
        if (!res.ok) throw new Error(`download returned ${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        await writeAtomic(out, buf);
        written.push("mp4");
      } else if (fmt === "srt") {
        const cues = parseVtt(meta.subtitles ?? "");
        const srt = toSrt(cues);
        await writeAtomic(join(targetDir, `${safeTitle}.srt`), srt);
        written.push("srt");
      } else if (fmt === "md") {
        const cues = parseVtt(meta.subtitles ?? "");
        const md = toMd(cues, title, { endMarker: opts.endMarker });
        await writeAtomic(join(targetDir, `${safeTitle}.md`), md);
        written.push("md");
      }
    } catch (e) {
      failed.push({ format: fmt, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    ok: failed.length === 0,
    slug: opts.slug,
    title,
    outputDir: targetDir,
    written,
    failed
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test 2>&1 | tail -15`

Expected: happy-path test passes. Total count = 126.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/workflows/exportPublished.ts tests/workflows/exportPublished.test.ts dist/src/workflows/exportPublished.js dist/tests/workflows/exportPublished.test.js
```

Commit message:

```
feat(workflows): add exportPublished (per-slug MP4 + SRT + MD pipeline)

Fetches /published_projects/{slug} once, sanitises the title for the
output folder and filenames, writes each requested format atomically
via .partial+rename. Extension for the primary media file derived
from the GCS download URL with publish_type fallback. Returns a
structured per-file result with written and failed lists.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 6: `exportPublished` - format subsetting, audio extension, .partial cleanup

**Files:**
- Modify: `tests/workflows/exportPublished.test.ts`

- [ ] **Step 1: Add failing tests for format subsetting**

Append to `tests/workflows/exportPublished.test.ts`:

```typescript
import { writeFileSync as writeFileSyncFs } from "node:fs";

test("--formats md,srt skips MP4 entirely (no curl call)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
  const { calls } = installMockFetch([
    {
      status: 200,
      json: {
        download_url: "https://gcs.example/x.mp4?sig=abc",
        project_id: "p", publish_type: "video", privacy: "private",
        metadata: { title: "X" }, subtitles: SAMPLE_VTT
      }
    }
  ]);
  const client = new DescriptClient({ token: "t" });
  const result = await exportPublished(client, {
    slug: "s", outputDir: dir, formats: ["md", "srt"], endMarker: false
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.written, ["md", "srt"]);
  assert.equal(calls.length, 1, "no MP4 curl");
  assert.ok(!existsSync(join(dir, "X", "X.mp4")));
  rmSync(dir, { recursive: true, force: true });
});

test("audio publish writes .mp3 derived from URL", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
  installMockFetch([
    {
      status: 200,
      json: {
        download_url: "https://gcs.example/episode-47.mp3?sig=abc",
        project_id: "p", publish_type: "audio", privacy: "private",
        metadata: { title: "Episode 47" }, subtitles: SAMPLE_VTT
      }
    },
    { status: 200, text: "mp3-bytes" }
  ]);
  const client = new DescriptClient({ token: "t" });
  const result = await exportPublished(client, {
    slug: "s", outputDir: dir, formats: ["mp4"], endMarker: false
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.written, ["mp4"]);
  assert.ok(existsSync(join(dir, "Episode 47", "Episode 47.mp3")));
  rmSync(dir, { recursive: true, force: true });
});

test("audio publish with no URL extension falls back to publish_type", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
  installMockFetch([
    {
      status: 200,
      json: {
        download_url: "https://gcs.example/abc?sig=def",
        project_id: "p", publish_type: "audio", privacy: "private",
        metadata: { title: "Pod" }, subtitles: SAMPLE_VTT
      }
    },
    { status: 200, text: "audio-bytes" }
  ]);
  const client = new DescriptClient({ token: "t" });
  const result = await exportPublished(client, {
    slug: "s", outputDir: dir, formats: ["mp4"], endMarker: false
  });
  assert.ok(existsSync(join(dir, "Pod", "Pod.mp3")));
  rmSync(dir, { recursive: true, force: true });
});

test("unlinks pre-existing .partial from prior interrupted run", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
  const compDir = join(dir, "T");
  mkdirSync(compDir, { recursive: true });
  writeFileSyncFs(join(compDir, "T.mp4.partial"), "stale-bytes");

  installMockFetch([
    {
      status: 200,
      json: {
        download_url: "https://gcs.example/T.mp4?sig=abc",
        project_id: "p", publish_type: "video", privacy: "private",
        metadata: { title: "T" }, subtitles: SAMPLE_VTT
      }
    },
    { status: 200, text: "new-bytes" }
  ]);
  const client = new DescriptClient({ token: "t" });
  const result = await exportPublished(client, {
    slug: "s", outputDir: dir, formats: ["mp4"], endMarker: false
  });
  assert.equal(result.ok, true);
  assert.equal(readFileSync(join(compDir, "T.mp4"), "utf8"), "new-bytes");
  assert.ok(!existsSync(join(compDir, "T.mp4.partial")));
  rmSync(dir, { recursive: true, force: true });
});
```

Add `mkdirSync` to the existing import line if not already there.

- [ ] **Step 2: Run tests to verify the four new ones pass without code changes**

Run: `npm test 2>&1 | tail -15`

Expected: all four pass. The exportPublished implementation from Task 5 already handles all of these (URL parse for ext, publish_type fallback, .partial unlinking, format subsetting was always conditional). Total count = 130.

If any fail, fix the implementation in `src/workflows/exportPublished.ts` to handle them, then re-run.

- [ ] **Step 3: Commit**

```bash
npm run build
git add tests/workflows/exportPublished.test.ts dist/tests/workflows/exportPublished.test.js
```

Commit message:

```
test(workflows): cover exportPublished format subsetting and edge cases

Adds tests for --formats md,srt skipping the MP4 curl, audio publish
extension derived from URL (.mp3), audio publish with no URL
extension falling back to publish_type (.mp3 default), and pre-
existing .partial cleanup before new write.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 7: `exportPublished` - partial failure (curl 503, WebVTT parse error)

**Files:**
- Modify: `tests/workflows/exportPublished.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/workflows/exportPublished.test.ts`:

```typescript
test("partial failure: MP4 curl 503 keeps SRT and MD; reports mp4 failed; ok=false", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
  installMockFetch([
    {
      status: 200,
      json: {
        download_url: "https://gcs.example/X.mp4?sig=abc",
        project_id: "p", publish_type: "video", privacy: "private",
        metadata: { title: "X" }, subtitles: SAMPLE_VTT
      }
    },
    { status: 503, text: "" }
  ]);
  const client = new DescriptClient({ token: "t" });
  const result = await exportPublished(client, {
    slug: "s", outputDir: dir, formats: ["mp4", "srt", "md"], endMarker: false
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.written, ["srt", "md"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].format, "mp4");
  assert.match(result.failed[0].error, /503/);
  assert.ok(existsSync(join(dir, "X", "X.srt")));
  assert.ok(existsSync(join(dir, "X", "X.md")));
  assert.ok(!existsSync(join(dir, "X", "X.mp4")));
  rmSync(dir, { recursive: true, force: true });
});

test("metadata has no download_url then mp4 fails but srt and md still write", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-exp-"));
  installMockFetch([
    {
      status: 200,
      json: {
        project_id: "p", publish_type: "video", privacy: "private",
        metadata: { title: "T" }, subtitles: SAMPLE_VTT
      }
    }
  ]);
  const client = new DescriptClient({ token: "t" });
  const result = await exportPublished(client, {
    slug: "s", outputDir: dir, formats: ["mp4", "srt", "md"], endMarker: false
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.written, ["srt", "md"]);
  assert.equal(result.failed[0].format, "mp4");
  assert.match(result.failed[0].error, /download_url/);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -15`

Expected: both pass without code changes (the exportPublished try/catch already handles per-format failures). Total count = 132.

- [ ] **Step 3: Commit**

```bash
npm run build
git add tests/workflows/exportPublished.test.ts dist/tests/workflows/exportPublished.test.js
```

Commit message:

```
test(workflows): cover exportPublished partial-failure paths

503 from the GCS download fails the mp4 format but SRT and MD still
write. Missing download_url in metadata fails mp4 but other formats
unaffected. ok flag is false whenever any format failed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 8: `exportBatch.ts` - size-1 batch (single item, download mode)

**Files:**
- Create: `src/workflows/exportBatch.ts`
- Test: `tests/workflows/exportBatch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/workflows/exportBatch.test.ts`:

```typescript
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DescriptClient } from "../../src/client/index.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";
import { exportBatch } from "../../src/workflows/exportBatch.js";

afterEach(() => restoreFetch());

const SAMPLE_VTT = `WEBVTT

00:00:00.000 --> 00:00:02.400
Ben: First.
`;

test("size-1 download-mode batch writes files and download-report.json", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-batch-"));
  installMockFetch([
    {
      status: 200,
      json: {
        download_url: "https://gcs.example/T.mp4?sig=abc",
        project_id: "p", publish_type: "video", privacy: "private",
        metadata: { title: "T" }, subtitles: SAMPLE_VTT
      }
    },
    { status: 200, text: "mp4" }
  ]);
  const client = new DescriptClient({ token: "t" });
  const report = await exportBatch(client, {
    items: [{ slug: "abc-123" }],
    outputDir: dir,
    formats: ["mp4", "srt", "md"],
    endMarker: false,
    concurrency: 2,
    command: "download-published"
  });

  assert.equal(report.ok, true);
  assert.equal(report.command, "download-published");
  assert.equal(report.items.length, 1);
  assert.equal(report.items[0].slug, "abc-123");
  assert.deepEqual(report.items[0].written, ["mp4", "srt", "md"]);

  const reportPath = join(dir, "download-report.json");
  assert.ok(existsSync(reportPath));
  const persisted = JSON.parse(readFileSync(reportPath, "utf8"));
  assert.equal(persisted.ok, true);
  assert.equal(persisted.items.length, 1);

  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep -E "exportBatch" | head`

Expected: module-not-found error.

- [ ] **Step 3: Implement `exportBatch`**

Create `src/workflows/exportBatch.ts`:

```typescript
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DescriptClient } from "../client/index.js";
import { exportPublished, type ExportFormat, type ExportPublishedResult } from "./exportPublished.js";
import { publishAndWait } from "./publishAndWait.js";
import { sanitize } from "./filenameSanitize.js";

export interface ExportBatchItem {
  projectId?: string;
  compositionId?: string;
  slug?: string;
  projectFolder?: string;
}

export interface ExportBatchOptions {
  items: ExportBatchItem[];
  outputDir: string;
  formats: ExportFormat[];
  endMarker: boolean;
  concurrency: number;
  command: "export" | "download-published";
  publish?: {
    mediaType: "Video" | "Audio";
    resolution: "480p" | "720p" | "1080p" | "1440p" | "4K";
    accessLevel: "public" | "unlisted" | "private";
  };
}

export interface ExportBatchReportItem extends ExportPublishedResult {
  projectId?: string;
  compositionId?: string;
}

export interface ExportBatchReport {
  ok: boolean;
  command: "export" | "download-published";
  items: ExportBatchReportItem[];
}

function slugFromShareUrl(shareUrl: string): string {
  // Descript share URLs end with /view/<slug>; pull the last path segment.
  try {
    const u = new URL(shareUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  } catch {
    return "";
  }
}

async function processOne(
  client: DescriptClient,
  item: ExportBatchItem,
  opts: ExportBatchOptions
): Promise<ExportBatchReportItem> {
  // Determine the slug. Either passed in (download mode) or via publish (export mode).
  let slug = item.slug;
  if (!slug) {
    if (!item.projectId || !item.compositionId) {
      return {
        ok: false,
        slug: "",
        title: "",
        outputDir: "",
        written: [],
        failed: opts.formats.map((f) => ({ format: f, error: "item missing slug and projectId+compositionId" })),
        projectId: item.projectId,
        compositionId: item.compositionId
      };
    }
    if (!opts.publish) {
      return {
        ok: false,
        slug: "",
        title: "",
        outputDir: "",
        written: [],
        failed: opts.formats.map((f) => ({ format: f, error: "publish options required for export-mode batch" })),
        projectId: item.projectId,
        compositionId: item.compositionId
      };
    }
    try {
      const out = await publishAndWait(client, {
        project_id: item.projectId,
        composition_id: item.compositionId,
        media_type: opts.publish.mediaType,
        resolution: opts.publish.resolution,
        access_level: opts.publish.accessLevel
      });
      if (!out.ok || !out.shareUrl) {
        return {
          ok: false, slug: "", title: "", outputDir: "",
          written: [],
          failed: opts.formats.map((f) => ({ format: f, error: out.error ?? "publish failed without error" })),
          projectId: item.projectId,
          compositionId: item.compositionId
        };
      }
      slug = slugFromShareUrl(out.shareUrl);
    } catch (e) {
      return {
        ok: false, slug: "", title: "", outputDir: "",
        written: [],
        failed: opts.formats.map((f) => ({ format: f, error: e instanceof Error ? e.message : String(e) })),
        projectId: item.projectId,
        compositionId: item.compositionId
      };
    }
  }

  const result = await exportPublished(client, {
    slug: slug!,
    outputDir: opts.outputDir,
    formats: opts.formats,
    endMarker: opts.endMarker,
    projectFolder: item.projectFolder
  });
  return {
    ...result,
    projectId: item.projectId,
    compositionId: item.compositionId
  };
}

async function runPool<T, R>(
  inputs: T[],
  concurrency: number,
  worker: (input: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(inputs.length);
  let next = 0;
  async function workerLoop(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= inputs.length) return;
      results[i] = await worker(inputs[i], i);
    }
  }
  const workers = Array.from({ length: Math.max(1, concurrency) }, () => workerLoop());
  await Promise.all(workers);
  return results;
}

export async function exportBatch(
  client: DescriptClient,
  opts: ExportBatchOptions
): Promise<ExportBatchReport> {
  mkdirSync(opts.outputDir, { recursive: true });

  const items = await runPool(opts.items, opts.concurrency, (item) => processOne(client, item, opts));
  const ok = items.every((i) => i.ok);
  const report: ExportBatchReport = { ok, command: opts.command, items };

  const reportPath = join(
    opts.outputDir,
    opts.command === "export" ? "export-report.json" : "download-report.json"
  );
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");

  return report;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test 2>&1 | tail -15`

Expected: size-1 batch test passes. Total count = 133.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/workflows/exportBatch.ts tests/workflows/exportBatch.test.ts dist/src/workflows/exportBatch.js dist/tests/workflows/exportBatch.test.js
```

Commit message:

```
feat(workflows): add exportBatch with size-1 + download-published path

Bounded-parallelism worker pool dispatches each item to publishAndWait
(when projectId+compositionId present) or exportPublished (when slug
present). Always writes <output-dir>/export-report.json or
download-report.json. Per-item failures are caught and reported, not
thrown. Size-1 single-comp invocations go through the same path so
the report is uniform.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 9: `exportBatch` - concurrency and report ordering

**Files:**
- Modify: `tests/workflows/exportBatch.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/workflows/exportBatch.test.ts`:

```typescript
test("preserves report ordering by input position even with concurrency=N", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-batch-"));
  // Three slugs, each needs a metadata + a curl response. Mock responses are
  // consumed in submission order but each item completes after its own pair.
  installMockFetch([
    { status: 200, json: { download_url: "https://gcs/A.mp4?s=1", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "A" }, subtitles: SAMPLE_VTT } },
    { status: 200, text: "A" },
    { status: 200, json: { download_url: "https://gcs/B.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "B" }, subtitles: SAMPLE_VTT } },
    { status: 200, text: "B" },
    { status: 200, json: { download_url: "https://gcs/C.mp4?s=3", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "C" }, subtitles: SAMPLE_VTT } },
    { status: 200, text: "C" }
  ]);
  const client = new DescriptClient({ token: "t" });
  const report = await exportBatch(client, {
    items: [{ slug: "a" }, { slug: "b" }, { slug: "c" }],
    outputDir: dir, formats: ["mp4"], endMarker: false, concurrency: 3,
    command: "download-published"
  });
  assert.equal(report.items.length, 3);
  assert.equal(report.items[0].slug, "a");
  assert.equal(report.items[1].slug, "b");
  assert.equal(report.items[2].slug, "c");
  rmSync(dir, { recursive: true, force: true });
});

test("concurrency=1 (serial) also preserves ordering", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-batch-"));
  installMockFetch([
    { status: 200, json: { download_url: "https://gcs/A.mp4?s=1", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "A" }, subtitles: SAMPLE_VTT } },
    { status: 200, text: "A" },
    { status: 200, json: { download_url: "https://gcs/B.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "B" }, subtitles: SAMPLE_VTT } },
    { status: 200, text: "B" }
  ]);
  const client = new DescriptClient({ token: "t" });
  const report = await exportBatch(client, {
    items: [{ slug: "a" }, { slug: "b" }],
    outputDir: dir, formats: ["mp4"], endMarker: false, concurrency: 1,
    command: "download-published"
  });
  assert.equal(report.items[0].slug, "a");
  assert.equal(report.items[1].slug, "b");
  rmSync(dir, { recursive: true, force: true });
});

test("one item fails but others succeed; report.ok false, per-item ok accurate", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-batch-"));
  installMockFetch([
    { status: 200, json: { download_url: "https://gcs/A.mp4?s=1", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "A" }, subtitles: SAMPLE_VTT } },
    { status: 200, text: "A" },
    { status: 404, json: { error: "not found", message: "slug not found" } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const report = await exportBatch(client, {
    items: [{ slug: "ok" }, { slug: "bad" }],
    outputDir: dir, formats: ["mp4"], endMarker: false, concurrency: 2,
    command: "download-published"
  });
  assert.equal(report.ok, false);
  assert.equal(report.items[0].ok, true);
  assert.equal(report.items[1].ok, false);
  assert.ok(report.items[1].failed.length >= 1);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -15`

Expected: three new tests pass. Total count = 136.

If the failing-item test fails (e.g., the 404 throws and crashes the worker), wrap the `exportPublished` call in processOne with a try/catch that converts to a failed item result. Look at the existing processOne — it should already catch (exportPublished itself does not throw for API errors; the DescriptApiError is thrown by the client). If a real exception propagates, add a try/catch around the exportPublished call.

- [ ] **Step 3: Commit**

```bash
npm run build
git add tests/workflows/exportBatch.test.ts dist/tests/workflows/exportBatch.test.js
```

Commit message:

```
test(workflows): cover exportBatch concurrency, ordering, partial failure

Asserts report items are ordered by input position regardless of
concurrency (1, 3). Asserts a single item failure does not abort the
batch and report.ok reflects partial failure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 10: `exportBatch` - multi-project folder structure (projectFolder)

**Files:**
- Modify: `tests/workflows/exportBatch.test.ts`

- [ ] **Step 1: Add failing test**

Append to `tests/workflows/exportBatch.test.ts`:

```typescript
test("multi-project items use projectFolder for two-level nesting", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-batch-"));
  installMockFetch([
    { status: 200, json: { download_url: "https://gcs/X.mp4?s=1", project_id: "p1", publish_type: "video", privacy: "private", metadata: { title: "Comp A" }, subtitles: SAMPLE_VTT } },
    { status: 200, text: "X" },
    { status: 200, json: { download_url: "https://gcs/Y.mp4?s=2", project_id: "p2", publish_type: "video", privacy: "private", metadata: { title: "Comp B" }, subtitles: SAMPLE_VTT } },
    { status: 200, text: "Y" }
  ]);
  const client = new DescriptClient({ token: "t" });
  const report = await exportBatch(client, {
    items: [
      { slug: "a", projectFolder: "Project One" },
      { slug: "b", projectFolder: "Project Two" }
    ],
    outputDir: dir, formats: ["mp4"], endMarker: false, concurrency: 2,
    command: "download-published"
  });
  assert.equal(report.ok, true);
  assert.ok(existsSync(join(dir, "Project One", "Comp A", "Comp A.mp4")));
  assert.ok(existsSync(join(dir, "Project Two", "Comp B", "Comp B.mp4")));
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test 2>&1 | tail -15`

Expected: pass (exportPublished already accepts projectFolder; exportBatch passes it through). Total count = 137.

- [ ] **Step 3: Commit**

```bash
npm run build
git add tests/workflows/exportBatch.test.ts dist/tests/workflows/exportBatch.test.js
```

Commit message:

```
test(workflows): cover exportBatch multi-project projectFolder nesting
```

---

### Task 11: `exportBatch` - publish-mode (PID+CID) happy path

**Files:**
- Modify: `tests/workflows/exportBatch.test.ts`

- [ ] **Step 1: Add failing test**

Append to `tests/workflows/exportBatch.test.ts`:

```typescript
test("publish-mode item: publish then download in one go", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-batch-"));
  installMockFetch([
    // 1. POST /jobs/publish -> submit job
    { status: 201, json: { job_id: "j1", drive_id: "d", project_id: "p", project_url: "u" } },
    // 2. GET /jobs/j1 -> stopped with result
    {
      status: 200,
      json: {
        job_id: "j1", job_type: "publish", job_state: "stopped", created_at: "t",
        drive_id: "d", project_id: "p", project_url: "u",
        result: {
          status: "success",
          share_url: "https://web.descript.com/p/view/slug-xyz",
          download_url: "https://gcs/X.mp4?s=1",
          download_url_expires_at: "2026-05-21T00:00:00Z"
        }
      }
    },
    // 3. GET /published_projects/slug-xyz
    {
      status: 200,
      json: {
        download_url: "https://gcs/X.mp4?s=2", project_id: "p",
        publish_type: "video", privacy: "private",
        metadata: { title: "X" }, subtitles: SAMPLE_VTT
      }
    },
    // 4. GCS curl
    { status: 200, text: "X-bytes" }
  ]);
  const client = new DescriptClient({ token: "t" });
  const report = await exportBatch(client, {
    items: [{ projectId: "p", compositionId: "c" }],
    outputDir: dir,
    formats: ["mp4", "srt", "md"],
    endMarker: false,
    concurrency: 1,
    command: "export",
    publish: { mediaType: "Video", resolution: "1080p", accessLevel: "private" }
  });
  assert.equal(report.ok, true);
  assert.equal(report.items[0].slug, "slug-xyz");
  assert.equal(report.items[0].title, "X");
  assert.deepEqual(report.items[0].written, ["mp4", "srt", "md"]);
  assert.ok(existsSync(join(dir, "X", "X.mp4")));
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test 2>&1 | tail -15`

Expected: pass. The exportBatch publish-mode path was already implemented in Task 8. Total count = 138.

- [ ] **Step 3: Commit**

```bash
npm run build
git add tests/workflows/exportBatch.test.ts dist/tests/workflows/exportBatch.test.js
```

Commit message:

```
test(workflows): cover exportBatch publish-mode end-to-end (publish + download)
```

---

### Task 12: CLI - `descript download-published <slug>`

**Files:**
- Modify: `src/cli/commands/registry.ts`
- Modify: `src/cli/index.ts` (USAGE update)
- Modify: `tests/cli/cli.test.ts`

- [ ] **Step 1: Add failing CLI test**

Append to `tests/cli/cli.test.ts`:

```typescript
test("download-published <slug> writes files and exits 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-dlp-"));
  installMockFetch([
    {
      status: 200,
      json: {
        download_url: "https://gcs.example/T.mp4?sig=abc",
        project_id: "p", publish_type: "video", privacy: "private",
        metadata: { title: "T" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nA: hi.\n"
      }
    },
    { status: 200, text: "mp4-bytes" }
  ]);
  const out: string[] = [];
  const code = await runCli(
    ["download-published", "abc-123", "--output-dir", dir, "--formats", "mp4,srt,md", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, "T", "T.mp4")));
  assert.ok(existsSync(join(dir, "T", "T.srt")));
  assert.ok(existsSync(join(dir, "T", "T.md")));
  assert.ok(existsSync(join(dir, "download-report.json")));
  assert.match(out.join(""), /"ok": ?true/);
  rmSync(dir, { recursive: true, force: true });
});

test("download-published without any slug or --slugs or --report exits 2", async () => {
  const out: string[] = [];
  const code = await runCli(
    ["download-published"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
  assert.match(out.join(""), /slug|Usage/);
});
```

Ensure `existsSync` is imported at the top of the test file. Add to the existing imports:

```typescript
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -E "download-published" | head`

Expected: "Unknown command" or similar.

- [ ] **Step 3: Add `download-published` command to registry**

In `src/cli/commands/registry.ts`, add at the top of the file with the existing imports:

```typescript
import { exportBatch } from "../../workflows/exportBatch.js";
import type { ExportFormat } from "../../workflows/exportPublished.js";
import { readFileSync } from "node:fs";
```

(`readFileSync` may already be imported - confirm before duplicating.)

Add a helper near the other parsing helpers:

```typescript
const FORMAT_VALUES = ["mp4", "srt", "md"] as const;

function parseFormats(ctx: Ctx, raw: string | undefined, fallback: ExportFormat[]): ExportFormat[] | null {
  if (raw === undefined) return fallback;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (!FORMAT_VALUES.includes(p as ExportFormat)) {
      fail(ctx.io, `--formats must be a comma-separated subset of: ${FORMAT_VALUES.join(", ")} (got "${p}")`);
      return null;
    }
  }
  // Dedup while preserving order
  const seen = new Set<string>();
  const out: ExportFormat[] = [];
  for (const p of parts) {
    if (!seen.has(p)) { seen.add(p); out.push(p as ExportFormat); }
  }
  return out;
}

function parseConcurrency(ctx: Ctx, raw: string | undefined, fallback: number): number | null {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    fail(ctx.io, `--concurrency must be a positive integer (got "${raw}")`);
    return null;
  }
  return n;
}
```

Add the `download-published` entry to `COMMANDS` (insert near the existing `published` entry):

```typescript
  async "download-published"(ctx) {
    const c = client(ctx);
    const formats = parseFormats(ctx, typeof ctx.flags.formats === "string" ? ctx.flags.formats : undefined, ["mp4", "srt", "md"]);
    if (formats === null) return 2;
    const concurrency = parseConcurrency(ctx, typeof ctx.flags.concurrency === "string" ? ctx.flags.concurrency : undefined, 2);
    if (concurrency === null) return 2;
    const outputDir = typeof ctx.flags["output-dir"] === "string" ? ctx.flags["output-dir"] : ".";
    const endMarker = ctx.flags["no-end-marker"] !== true;

    // Resolve slugs.
    let slugs: string[] = [];
    const positional = ctx.args[0];
    const slugsFlag = typeof ctx.flags.slugs === "string" ? ctx.flags.slugs : undefined;
    const reportFlag = typeof ctx.flags.report === "string" ? ctx.flags.report : undefined;
    const sourcesUsed = [positional, slugsFlag, reportFlag].filter((v) => v !== undefined).length;
    if (sourcesUsed === 0) {
      fail(ctx.io, "Usage: descript download-published <slug> | --slugs s1,s2 | --report <path>");
      return 2;
    }
    if (sourcesUsed > 1) {
      fail(ctx.io, "Provide exactly one of <slug>, --slugs, or --report");
      return 2;
    }
    if (positional) {
      slugs = [positional];
    } else if (slugsFlag) {
      slugs = slugsFlag.split(",").map((s) => s.trim()).filter(Boolean);
      if (slugs.length === 0) {
        fail(ctx.io, "--slugs must be a non-empty comma-separated list");
        return 2;
      }
    } else if (reportFlag) {
      const raw = readJsonFile(ctx, reportFlag);
      if (raw === undefined) return 2;
      const r = raw as { items?: Array<{ slug?: string }> };
      if (!Array.isArray(r.items)) {
        fail(ctx.io, `--report file does not look like an export-report.json (missing items array)`);
        return 2;
      }
      slugs = r.items.map((i) => i.slug).filter((s): s is string => typeof s === "string" && s.length > 0);
      if (slugs.length === 0) {
        fail(ctx.io, `--report file contained no slugs`);
        return 2;
      }
    }

    const report = await exportBatch(c, {
      items: slugs.map((slug) => ({ slug })),
      outputDir, formats, endMarker, concurrency,
      command: "download-published"
    });
    emit(ctx.io, `Downloaded ${report.items.filter((i) => i.ok).length}/${report.items.length} item(s)`, report);
    return report.ok ? 0 : 4;
  },
```

In `src/cli/index.ts`, update the USAGE line to include `download-published` and `export`. Find the line listing commands and add both. (Inspect the current line first; structure may already include a list.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -15`

Expected: both new download-published tests pass. Total count = 140.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/cli/commands/registry.ts src/cli/index.ts tests/cli/cli.test.ts dist/src/cli/commands/registry.js dist/src/cli/index.js dist/tests/cli/cli.test.js
```

Commit message:

```
feat(cli): add download-published command (read-only batch transcript fetch)

Accepts a single slug, --slugs csv, or --report <path> for re-fetch
from a prior export-report.json. Always routes through exportBatch
so the report-writing path is uniform. Read-only - no publish, no
API write. Validates --formats and --concurrency at parse time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 13: CLI - `descript download-published --slugs` and `--report`

**Files:**
- Modify: `tests/cli/cli.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/cli/cli.test.ts`:

```typescript
test("download-published --slugs s1,s2 fans out", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-dlp-"));
  installMockFetch([
    { status: 200, json: { download_url: "https://gcs/A.mp4?s=1", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "A" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx.\n" } },
    { status: 200, text: "A" },
    { status: 200, json: { download_url: "https://gcs/B.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "B" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\ny.\n" } },
    { status: 200, text: "B" }
  ]);
  const out: string[] = [];
  const code = await runCli(
    ["download-published", "--slugs", "a,b", "--output-dir", dir, "--formats", "mp4", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, "A", "A.mp4")));
  assert.ok(existsSync(join(dir, "B", "B.mp4")));
  rmSync(dir, { recursive: true, force: true });
});

test("download-published --report reads slugs from a prior export-report.json", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-dlp-"));
  const reportPath = join(dir, "export-report.json");
  writeFileSync(reportPath, JSON.stringify({
    ok: true, command: "export",
    items: [
      { slug: "abc", ok: true, title: "T1", outputDir: ".", written: ["mp4"], failed: [] },
      { slug: "def", ok: true, title: "T2", outputDir: ".", written: ["mp4"], failed: [] }
    ]
  }));
  installMockFetch([
    { status: 200, json: { download_url: "https://gcs/T1.mp4?s=1", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "T1" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx.\n" } },
    { status: 200, json: { download_url: "https://gcs/T2.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "T2" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\ny.\n" } }
  ]);
  const out: string[] = [];
  const code = await runCli(
    ["download-published", "--report", reportPath, "--output-dir", dir, "--formats", "md", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, "T1", "T1.md")));
  assert.ok(existsSync(join(dir, "T2", "T2.md")));
  rmSync(dir, { recursive: true, force: true });
});

test("download-published with two slug sources (positional + --slugs) exits 2", async () => {
  const out: string[] = [];
  const code = await runCli(
    ["download-published", "abc", "--slugs", "def"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
  assert.match(out.join(""), /exactly one/);
});
```

Ensure `writeFileSync` is in the test file imports.

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -15`

Expected: three new tests pass. Total count = 143.

- [ ] **Step 3: Commit**

```bash
npm run build
git add tests/cli/cli.test.ts dist/tests/cli/cli.test.js
```

Commit message:

```
test(cli): cover download-published --slugs and --report
```

---

### Task 14: CLI - `descript export <PID> <CID>` single composition

**Files:**
- Modify: `src/cli/commands/registry.ts`
- Modify: `tests/cli/cli.test.ts`

- [ ] **Step 1: Add failing test**

Append to `tests/cli/cli.test.ts`:

```typescript
test("export PID CID publishes and downloads in one go", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-exp-cli-"));
  installMockFetch([
    // publish submit
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    // publish job result
    {
      status: 200, json: {
        job_id: "j", job_type: "publish", job_state: "stopped", created_at: "t",
        drive_id: "d", project_id: "p", project_url: "u",
        result: {
          status: "success",
          share_url: "https://web.descript.com/p/view/slug-1",
          download_url: "https://gcs/X.mp4?s=1",
          download_url_expires_at: "2026-05-21T00:00:00Z"
        }
      }
    },
    // metadata
    { status: 200, json: { download_url: "https://gcs/X.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "X" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx.\n" } },
    // curl
    { status: 200, text: "X-bytes" }
  ]);
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "c", "--output-dir", dir, "--formats", "mp4,srt,md", "--access-level", "private", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, "X", "X.mp4")));
  assert.ok(existsSync(join(dir, "X", "X.srt")));
  assert.ok(existsSync(join(dir, "X", "X.md")));
  assert.ok(existsSync(join(dir, "export-report.json")));
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails (Unknown command)**

Run: `npm test 2>&1 | grep -E "export PID" | head`

- [ ] **Step 3: Add `export` command to registry (single-comp path only for now)**

In `src/cli/commands/registry.ts`, add to `COMMANDS`:

```typescript
  async export(ctx) {
    const c = client(ctx);
    const formats = parseFormats(ctx, typeof ctx.flags.formats === "string" ? ctx.flags.formats : undefined, ["mp4", "srt", "md"]);
    if (formats === null) return 2;
    const concurrency = parseConcurrency(ctx, typeof ctx.flags.concurrency === "string" ? ctx.flags.concurrency : undefined, 2);
    if (concurrency === null) return 2;
    if (badEnum(ctx, "media-type", MEDIA_TYPE)) return 2;
    if (badEnum(ctx, "resolution", RESOLUTION)) return 2;
    if (badEnum(ctx, "access-level", ACCESS_LEVEL)) return 2;
    const outputDir = typeof ctx.flags["output-dir"] === "string" ? ctx.flags["output-dir"] : ".";
    const endMarker = ctx.flags["no-end-marker"] !== true;
    const mediaType = (ctx.flags["media-type"] as "Video" | "Audio") ?? "Video";
    const resolution = (ctx.flags.resolution as "480p" | "720p" | "1080p" | "1440p" | "4K") ?? "1080p";
    const accessLevel = (ctx.flags["access-level"] as "public" | "unlisted" | "private") ?? "private";

    // Single-composition shape: descript export <PID> <CID>
    const positionalPid = ctx.args[0];
    const positionalCid = ctx.args[1];
    const projectsFlag = typeof ctx.flags.projects === "string" ? ctx.flags.projects : undefined;
    const compositionIdsFlag = typeof ctx.flags["composition-ids"] === "string" ? ctx.flags["composition-ids"] : undefined;

    if (!positionalPid && !projectsFlag) {
      fail(ctx.io, "Usage: descript export <project-id> [composition-id] | --projects pid1,pid2");
      return 2;
    }

    let items: Array<{ projectId: string; compositionId: string; projectFolder?: string }> = [];
    if (positionalPid && positionalCid) {
      items = [{ projectId: positionalPid, compositionId: positionalCid }];
    } else {
      // Path branches for PID-only and --projects are Task 15. For now, fail with a clear stub.
      fail(ctx.io, "Multi-composition export is implemented in a follow-up task; pass <PID> <CID> for now");
      return 2;
    }

    const report = await exportBatch(c, {
      items, outputDir, formats, endMarker, concurrency,
      command: "export",
      publish: { mediaType, resolution, accessLevel }
    });
    emit(ctx.io, `Exported ${report.items.filter((i) => i.ok).length}/${report.items.length} item(s)`, report);
    return report.ok ? 0 : 4;
  },
```

- [ ] **Step 4: Run tests to verify the single-comp test passes**

Run: `npm test 2>&1 | tail -15`

Expected: pass. Total count = 144.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/cli/commands/registry.ts tests/cli/cli.test.ts dist/src/cli/commands/registry.js dist/tests/cli/cli.test.js
```

Commit message:

```
feat(cli): add export command (single composition via PID + CID)

End-to-end pipeline: publishes the composition with the configured
access level (default private), then downloads the rendered media
and writes the SRT and Markdown transcripts. Always routes through
exportBatch so the export-report.json is written even for single-
comp invocations. Multi-comp and multi-project arg shapes land in
the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 15: CLI - `descript export <PID>` (all comps) and `--projects`

**Files:**
- Modify: `src/cli/commands/registry.ts`
- Modify: `tests/cli/cli.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/cli/cli.test.ts`:

```typescript
test("export PID (no CID) lists project comps and fans out", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-exp-cli-"));
  installMockFetch([
    // GET /projects/p
    { status: 200, json: { id: "p", name: "Proj", compositions: [{ id: "c1", name: "A" }, { id: "c2", name: "B" }] } },
    // publish c1 submit + result, c2 submit + result, metadata + curl per item
    { status: 201, json: { job_id: "j1", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j1", job_type: "publish", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u", result: { status: "success", share_url: "https://web.descript.com/p/view/sA", download_url: "https://gcs/A.mp4?s=1", download_url_expires_at: "t" } } },
    { status: 200, json: { download_url: "https://gcs/A.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "A" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nx.\n" } },
    { status: 200, text: "Abytes" },
    { status: 201, json: { job_id: "j2", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j2", job_type: "publish", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u", result: { status: "success", share_url: "https://web.descript.com/p/view/sB", download_url: "https://gcs/B.mp4?s=1", download_url_expires_at: "t" } } },
    { status: 200, json: { download_url: "https://gcs/B.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "B" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\ny.\n" } },
    { status: 200, text: "Bbytes" }
  ]);
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "--output-dir", dir, "--formats", "mp4", "--concurrency", "1", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, "A", "A.mp4")));
  assert.ok(existsSync(join(dir, "B", "B.mp4")));
  rmSync(dir, { recursive: true, force: true });
});

test("export --composition-ids narrows a project's comp list", async () => {
  const dir = mkdtempSync(join(tmpdir(), "descript-exp-cli-"));
  installMockFetch([
    { status: 200, json: { id: "p", name: "Proj", compositions: [{ id: "c1", name: "A" }, { id: "c2", name: "B" }, { id: "c3", name: "C" }] } },
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "publish", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u", result: { status: "success", share_url: "https://web.descript.com/p/view/sC", download_url: "https://gcs/C.mp4?s=1", download_url_expires_at: "t" } } },
    { status: 200, json: { download_url: "https://gcs/C.mp4?s=2", project_id: "p", publish_type: "video", privacy: "private", metadata: { title: "C" }, subtitles: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nz.\n" } },
    { status: 200, text: "Cbytes" }
  ]);
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "--composition-ids", "c3", "--output-dir", dir, "--formats", "mp4", "--concurrency", "1", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, "C", "C.mp4")));
  assert.ok(!existsSync(join(dir, "A", "A.mp4")));
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run tests to verify they fail (current code returns the stub message)**

Run: `npm test 2>&1 | grep -E "PID \(no CID\)|composition-ids" | head`

- [ ] **Step 3: Implement the multi-comp paths**

Look up the existing `listProjects` / `getProject` shape in `src/client/index.ts` and `types.ts`. The endpoint returns a `Project` with an embedded `compositions: { id: string; name: string }[]`.

Update the `export` command in `src/cli/commands/registry.ts`, replacing the multi-comp stub:

```typescript
    if (positionalPid && positionalCid) {
      items = [{ projectId: positionalPid, compositionId: positionalCid }];
    } else if (positionalPid) {
      // PID-only: list project compositions, optionally narrow via --composition-ids.
      const project = await c.getProject(positionalPid);
      const allComps = project.compositions ?? [];
      let chosen = allComps;
      if (compositionIdsFlag) {
        const requested = new Set(compositionIdsFlag.split(",").map((s) => s.trim()).filter(Boolean));
        chosen = allComps.filter((c) => requested.has(c.id));
        if (chosen.length === 0) {
          fail(ctx.io, `--composition-ids matched nothing in project ${positionalPid}`);
          return 2;
        }
      }
      items = chosen.map((cc) => ({ projectId: positionalPid, compositionId: cc.id }));
    } else if (projectsFlag) {
      // Multi-project: list each project's comps, label with project folder.
      const pids = projectsFlag.split(",").map((s) => s.trim()).filter(Boolean);
      if (pids.length === 0) {
        fail(ctx.io, "--projects must be a non-empty comma-separated list");
        return 2;
      }
      for (const pid of pids) {
        const project = await c.getProject(pid);
        const folder = sanitize(project.name ?? pid);
        for (const cc of project.compositions ?? []) {
          items.push({ projectId: pid, compositionId: cc.id, projectFolder: folder });
        }
      }
    }
    if (items.length === 0) {
      fail(ctx.io, "no compositions to export");
      return 2;
    }
```

Add the `sanitize` import at the top of `registry.ts`:

```typescript
import { sanitize } from "../../workflows/filenameSanitize.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -15`

Expected: both new tests pass plus the existing single-comp test. Total count = 146.

- [ ] **Step 5: Commit**

```bash
npm run build
git add src/cli/commands/registry.ts tests/cli/cli.test.ts dist/src/cli/commands/registry.js dist/tests/cli/cli.test.js
```

Commit message:

```
feat(cli): add export PID-only and --projects multi-project paths

PID-only auto-lists the project's compositions via /projects/{id}.
--composition-ids narrows the list to a subset within one project.
--projects pid1,pid2 fans out across multiple projects with
two-level folder nesting (project name then composition name).
The project name is sanitised for the folder via the same
filenameSanitize rules.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 16: CLI - flag validation tests

**Files:**
- Modify: `tests/cli/cli.test.ts`

- [ ] **Step 1: Add failing tests for flag-validation paths**

Append to `tests/cli/cli.test.ts`:

```typescript
test("export rejects --formats invalid locally without calling the API", async () => {
  const { calls } = installMockFetch([{ status: 200, json: {} }]);
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "c", "--formats", "wav", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
  assert.equal(calls.length, 0);
  assert.match(out.join(""), /formats must be a comma-separated subset/);
});

test("export rejects --concurrency 0", async () => {
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "c", "--concurrency", "0", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
  assert.match(out.join(""), /concurrency must be a positive integer/);
});

test("export rejects --concurrency negative", async () => {
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "c", "--concurrency", "-1", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
});

test("export rejects --concurrency non-numeric", async () => {
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "c", "--concurrency", "abc", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
});

test("export still rejects --access-level drive (v0.2.1 carry-forward)", async () => {
  const out: string[] = [];
  const code = await runCli(
    ["export", "p", "c", "--access-level", "drive", "--json"],
    { env: { DESCRIPT_API_TOKEN: "t" }, stdout: (s) => out.push(s), stderr: (s) => out.push(s) }
  );
  assert.equal(code, 2);
  assert.match(out.join(""), /access-level must be one of/);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test 2>&1 | tail -15`

Expected: all five new validation tests pass. Total count = 151.

- [ ] **Step 3: Commit**

```bash
npm run build
git add tests/cli/cli.test.ts dist/tests/cli/cli.test.js
```

Commit message:

```
test(cli): cover export flag-validation rejections (formats, concurrency, drive)
```

---

### Task 17: Create `descript-export` SKILL.md

**Files:**
- Create: `skills/descript-export/SKILL.md`

- [ ] **Step 1: Create the directory and write the skill**

```bash
mkdir -p skills/descript-export
```

Create `skills/descript-export/SKILL.md`:

```markdown
---
name: descript-export
description: Export Descript compositions to local MP4, SRT, and Markdown transcript files. Use when the user wants to download finished compositions and transcripts for chapter generation, archival, or offline work. Handles single compositions, all compositions in a project, or fan-out across multiple projects.
---

# Descript Export

End-to-end pipeline: publish a composition (or many), download the rendered media, write SRT and Markdown transcripts from the WebVTT subtitles. Model-invocable with mandatory in-skill confirmation because each call triggers one publish per composition (server-side render, free on standard plans, but each publish creates a hosted share URL).

## When to Use
- "Download this composition", "give me the MP4 + transcript", "export everything in project X for chapter generation"
- NOT for: re-pulling transcripts from a composition that has already been published (use descript-download-published - read-only, free, no fresh publish)

## Instructions
1. Confirm scope. One of:
   - Single composition: project id + composition id
   - Whole project: project id only, all compositions
   - Multiple projects: --projects pid1,pid2,...

2. Confirm deliverables. Default is mp4 + srt + md. If the user says "just the transcripts" or "no need for the video", ask explicitly: "Descript renders the MP4 server-side regardless because their API has no transcript-only publish path. Do you want me to also download the MP4 now (one extra download per composition), or skip it (it stays on Descript's CDN - `descript download-published <slug> --formats mp4` will fetch it later)?"

3. Confirm access level. Default is private (export-and-download workflow). Only override if the user specifically needs unlisted or public.

4. Confirm output dir. Default is the current directory. Confirm if not specified.

5. Run:
   ```
   descript export <PID> [CID] \
     --formats <list> \
     --output-dir <path> \
     --access-level private \
     --concurrency 2 \
     [--composition-ids id1,id2] \
     [--no-end-marker] \
     [--profile <name>] \
     --json
   ```
   For multi-project, replace `<PID>` with `--projects pid1,pid2,...`.

6. Report per-composition outcomes. The CLI emits a per-item report (slug, title, output dir, written formats, failed formats). Do not summarize partial success as success - surface every failed format with its error.

7. For iteration ("regenerate just the transcripts after editing my chapter-gen prompt"), use descript-download-published with the slugs from the prior run's export-report.json. That path is read-only and free.

8. A 403 from publish means the Drive's publish settings block the requested access level. Report the hint from the error.
```

- [ ] **Step 2: Run npm test to confirm nothing broke**

Run: `npm test 2>&1 | tail -10`

Expected: still 151 tests passing.

- [ ] **Step 3: Commit**

```bash
git add skills/descript-export/SKILL.md
```

Commit message:

```
feat(skills): add descript-export skill (model-invocable with confirmation)

Mirrors the descript-edit gating pattern (no disable-model-invocation,
mandatory in-skill confirmation step) because the publish step is
risk-bearing but not billable on standard plans. Documents the
MP4-opportunism conversation Claude should have when the user asks
for transcripts only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 18: Create `descript-download-published` SKILL.md

**Files:**
- Create: `skills/descript-download-published/SKILL.md`

- [ ] **Step 1: Create the directory and write the skill**

```bash
mkdir -p skills/descript-download-published
```

Create `skills/descript-download-published/SKILL.md`:

```markdown
---
name: descript-download-published
description: Download MP4, SRT, and Markdown transcript files for previously-published Descript compositions. Read-only - no publish, no API write, no cost. Use when iterating on transcripts for already-published compositions, or re-fetching files after the original download URLs expired.
---

# Descript Download Published

Read-only companion to descript-export. Fetches published-metadata for one or more slugs and writes the local files. No publish step, no API write, no cost. The right entry point for chapter-generation iteration.

## When to Use
- "Re-fetch transcripts for these compositions", "I already published, just give me the files"
- "Re-do that chapter prompt against the same transcript"
- NOT for: first-time export of a composition (use descript-export - that triggers the publish)

## Instructions
1. Determine the slugs. One of:
   - User provides a single slug (the last path segment of a Descript share URL, after `/view/`)
   - User has an export-report.json from a prior descript-export run - use --report <path>
   - User has a list of slugs - use --slugs s1,s2,s3

2. Run:
   ```
   descript download-published <slug> \
     --formats <list> \
     --output-dir <path> \
     [--no-end-marker] \
     [--profile <name>] \
     --json
   ```
   For batch, use --slugs <list> or --report <path> in place of the positional slug.

3. Report per-slug outcomes. Same fail-loud rule as export - surface every failed format with its error.

4. Download URLs are 24h-signed. This command always re-fetches /published_projects/{slug} to mint a fresh URL before downloading, so old slugs still work. The slug itself does not expire - Descript persists published items indefinitely until deleted in the UI.
```

- [ ] **Step 2: Run npm test to confirm nothing broke**

Run: `npm test 2>&1 | tail -10`

Expected: still 151 tests passing.

- [ ] **Step 3: Commit**

```bash
git add skills/descript-download-published/SKILL.md
```

Commit message:

```
feat(skills): add descript-download-published skill (read-only re-fetch)

Companion to descript-export. Read-only, model-invocable without
restrictions. Documents the three slug-source paths (single, --slugs,
--report) and the URL-expiry behaviour. Right entry point for
chapter-generation iteration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 19: Update CLAUDE.md and README

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

- [ ] **Step 1: Append the new sentence to CLAUDE.md Cost and Risk Safety section**

Find the existing line about descript-edit being intentionally model-invocable. Append after it (within the same paragraph):

```
 The descript-export skill triggers a publish per composition and is risk-bearing (creates hosted share URLs); it is intentionally model-invocable WITHOUT disable-model-invocation, gated by the same mandatory in-skill confirmation pattern descript-edit uses. The descript-download-published skill is read-only and unrestricted.
```

Use `Edit` to modify CLAUDE.md, locating the descript-edit sentence and appending the new content.

- [ ] **Step 2: Add the use-case paragraph to README.md**

Locate (or create) a "Use cases" section in README.md and add this paragraph. If the README does not have a section structure suitable for this paragraph, find an appropriate spot (e.g., after the basic-usage section) and add a `## Tip - Per-cue density for chapter generation` heading with the paragraph.

```
For downstream LLM-driven content generation (YouTube descriptions, chapters, summaries), the API-derived per-cue Markdown transcript is denser and more anchor-rich than Descript's UI export. A 30-minute podcast yields ~750 timestamp anchors via this command vs ~50-100 from the UI's paragraph segmentation - useful when the downstream LLM needs many candidate chapter boundaries.
```

- [ ] **Step 3: Run npm test to confirm nothing broke**

Run: `npm test 2>&1 | tail -5`

Expected: still 151 tests passing.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
```

Commit message:

```
docs: note the new export skills in CLAUDE.md and the per-cue use case in README

CLAUDE.md gains one sentence about descript-export's gating model
and descript-download-published's read-only nature. README gains a
short paragraph explaining why the API-derived per-cue Markdown is
denser than Descript's UI export and useful for chapter generation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 20: Concurrency smoke test script

**Files:**
- Create: `scripts/smoke/concurrency.ts`
- Modify: `package.json` (add `smoke:concurrency` script)
- Modify: `.gitignore` (exclude `scripts/smoke/results/`)
- Create: `scripts/smoke/results/.gitkeep`

- [ ] **Step 1: Create the script**

```bash
mkdir -p scripts/smoke/results
touch scripts/smoke/results/.gitkeep
```

Create `scripts/smoke/concurrency.ts`:

```typescript
// Concurrency smoke test - dev workflow, not part of npm test, not CI.
//
// Discovers Descript's real rate-limit ceiling so we can set a sensible
// production default for --concurrency. Defaults to read-mode (download-
// published against an existing project's slugs). Optional --mode write
// exercises the publish path; the script cancels jobs immediately after
// submission so server-side renders are not wasted.
//
// Env:
//   DESCRIPT_API_TOKEN          - required
//   DESCRIPT_SMOKE_PROJECT_ID   - required; must contain at least 5 comps that
//                                 are already published (read mode) or that
//                                 can safely be re-published (write mode)
//   DESCRIPT_SMOKE_PROFILE      - optional, named profile selector
//
// Output: markdown summary to stdout AND scripts/smoke/results/concurrency-<ISO>.md

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DescriptClient } from "../../src/client/index.js";

const CONCURRENCY_LEVELS = [1, 2, 3, 5, 7, 10];

async function readMode(client: DescriptClient, slugs: string[]): Promise<string> {
  const lines: string[] = [];
  lines.push(`# Concurrency smoke - read mode\n`);
  lines.push(`Slugs tested: ${slugs.length}\n`);
  lines.push(`| Concurrency | Wall time (ms) | 429s | Other errors |`);
  lines.push(`|---|---|---|---|`);

  for (const conc of CONCURRENCY_LEVELS) {
    const start = Date.now();
    let rateLimited = 0;
    let other = 0;
    let next = 0;
    async function worker(): Promise<void> {
      while (true) {
        const i = next++;
        if (i >= slugs.length) return;
        try {
          await client.getPublishedProjectMetadata(slugs[i]);
        } catch (e) {
          const msg = String(e);
          if (msg.includes("429")) rateLimited++;
          else other++;
        }
      }
    }
    await Promise.all(Array.from({ length: conc }, () => worker()));
    const elapsed = Date.now() - start;
    lines.push(`| ${conc} | ${elapsed} | ${rateLimited} | ${other} |`);
  }
  return lines.join("\n") + "\n";
}

async function main(): Promise<void> {
  const token = process.env.DESCRIPT_API_TOKEN;
  const projectId = process.env.DESCRIPT_SMOKE_PROJECT_ID;
  if (!token || !projectId) {
    console.error("Required env: DESCRIPT_API_TOKEN, DESCRIPT_SMOKE_PROJECT_ID");
    process.exit(2);
  }
  const client = new DescriptClient({ token });
  const project = await client.getProject(projectId);
  const comps = project.compositions ?? [];
  if (comps.length < 5) {
    console.error(`Smoke project ${projectId} must have at least 5 compositions (has ${comps.length})`);
    process.exit(2);
  }

  // For read mode we need slugs of published compositions. The /projects
  // endpoint does not currently expose per-composition slugs, so we publish
  // each comp once at the start in --no-wait fashion and collect the slug
  // from the published metadata. (This is the warmup cost of the smoke run.)
  // For simplicity in this v1 of the smoke script, we publish synchronously
  // and treat the resulting slugs as inputs.
  console.error(`Warming up: publishing ${comps.length} compositions to obtain slugs...`);
  const slugs: string[] = [];
  for (const cc of comps.slice(0, 5)) {
    const out = await client.publishJob({
      project_id: projectId, composition_id: cc.id,
      media_type: "Video", resolution: "1080p", access_level: "private"
    });
    // Poll briefly until stopped
    let status = await client.getJob(out.job_id);
    while (status.job_state !== "stopped" && status.job_state !== "cancelled") {
      await new Promise((r) => setTimeout(r, 2000));
      status = await client.getJob(out.job_id);
    }
    if (status.result && status.result.status === "success") {
      const slug = (status.result as { share_url?: string }).share_url?.split("/").pop() ?? "";
      if (slug) slugs.push(slug);
    }
  }

  console.error(`Obtained ${slugs.length} slugs. Running smoke...`);
  const md = await readMode(client, slugs);
  process.stdout.write(md);

  mkdirSync("scripts/smoke/results", { recursive: true });
  const out = join("scripts/smoke/results", `concurrency-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  writeFileSync(out, md);
  console.error(`Wrote ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `scripts`:

```json
    "smoke:concurrency": "tsc -p tsconfig.json && node dist/scripts/smoke/concurrency.js"
```

(Adjust the dist path if tsc emits scripts/ elsewhere; the project's existing tsconfig may need `include` updated to cover `scripts/`. If it does not, add `scripts/**/*` to `include` in `tsconfig.json`.)

- [ ] **Step 3: Update .gitignore**

Append to `.gitignore`:

```
scripts/smoke/results/*
!scripts/smoke/results/.gitkeep
```

- [ ] **Step 4: Build and confirm the script compiles**

Run: `npm run build 2>&1 | tail -10`

Expected: no TypeScript errors.

- [ ] **Step 5: Run unit tests to confirm nothing broke**

Run: `npm test 2>&1 | tail -5`

Expected: still 151 tests passing.

- [ ] **Step 6: Commit**

```bash
git add scripts/smoke/concurrency.ts scripts/smoke/results/.gitkeep package.json package-lock.json .gitignore tsconfig.json dist/scripts
```

(`tsconfig.json` only if `include` was updated. `package-lock.json` only if it changed.)

Commit message:

```
feat(scripts): add concurrency smoke test for descript-export

Empirical discovery of Descript's rate-limit ceiling so the
--concurrency default can be raised above the conservative initial
value of 2. Read mode hits /published_projects/{slug} at
[1, 2, 3, 5, 7, 10] concurrency, records 429s and timings, writes a
markdown report. Dev-only - excluded from npm test and CI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 21: Run the smoke test and set the production --concurrency default

**Files:**
- Modify (conditionally): `src/cli/commands/registry.ts`
- Modify (conditionally): `skills/descript-export/SKILL.md`

- [ ] **Step 1: Run the smoke test against a real iDD project**

The user will provide the project ID. Run:

```bash
DESCRIPT_API_TOKEN=<token> DESCRIPT_SMOKE_PROJECT_ID=<pid> npm run smoke:concurrency
```

Inspect the resulting `scripts/smoke/results/concurrency-*.md`. Look for the highest concurrency level that completed with zero 429s and zero other errors.

- [ ] **Step 2: Update the production default if the smoke run cleared a higher value**

In `src/cli/commands/registry.ts`, both the `export` and `download-published` commands call `parseConcurrency(ctx, ..., 2)`. If the smoke run cleared 5 cleanly, change both fallbacks to `5`. If it cleared 7, use `7`. Be conservative - one notch below the highest passing level if there is any noise.

Also update `skills/descript-export/SKILL.md` step 5's example command if the displayed `--concurrency 2` no longer matches the new default.

- [ ] **Step 3: Run tests to confirm nothing broke**

Run: `npm test 2>&1 | tail -5`

Expected: 151 tests still passing.

- [ ] **Step 4: Commit if the default changed**

If the default was unchanged (smoke run hit limits at every level above 2), skip this commit and proceed to Task 22.

If the default changed:

```bash
npm run build
git add src/cli/commands/registry.ts skills/descript-export/SKILL.md dist/src/cli/commands/registry.js scripts/smoke/results/
```

Commit message (substitute the actual measured value):

```
chore(cli): bump --concurrency default to N per smoke test results

Smoke run against the iDD <project name> project at concurrencies
[1, 2, 3, 5, 7, 10] cleared up to N with zero 429s. Defaulting to
N. Users can still override with --concurrency.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

### Task 22: v0.3.0 release - version bump + CHANGELOG + tag + push + GitHub release

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump versions**

In `.claude-plugin/plugin.json`, change `"version": "0.2.1"` to `"version": "0.3.0"`.
In `package.json`, change `"version": "0.2.1"` to `"version": "0.3.0"`.
In `package-lock.json`, change both `"version": "0.2.1"` occurrences (root and the `""` package entry) to `"0.3.0"`.

- [ ] **Step 2: Add CHANGELOG entry**

Prepend (just below the `# Changelog` header):

```markdown
## 0.3.0 - 2026-05-20
- New `descript export <project-id> [composition-id]` command. Publishes one or many compositions (single composition, all compositions in a project, or fan-out across multiple projects via `--projects pid1,pid2`), then downloads the rendered media and writes SRT and Markdown transcripts from the WebVTT subtitles. The Markdown matches the field report's Section 5 format (per-cue paragraphs, `[HH:MM:SS]` timestamps, speaker label on speaker change, optional `[HH:MM:SS] END` marker via the default).

- New `descript download-published <slug>` command. Read-only companion that re-fetches the deliverables for a previously-published composition. Accepts a single slug, `--slugs s1,s2,...`, or `--report <path>` to read slugs back from a prior `export-report.json`. No publish, no API write, no cost. Right entry point for chapter-generation iteration.

- Every run writes `<output-dir>/export-report.json` or `download-report.json` containing per-item slugs, titles, output paths, written formats, and failed formats. Single-composition runs produce the same report shape as multi-composition runs so the closed loop with `--report` works uniformly.

- `--formats mp4,srt,md` flag (default all three). Skip formats to save time and disk - `--formats md` for chapter-gen iteration skips the MP4 download entirely. `--no-end-marker` omits the `[HH:MM:SS] END` line from Markdown for human-readable transcript use cases.

- `--concurrency N` flag with conservative default of 2 (or the smoke-test-cleared higher value, recorded in `scripts/smoke/results/`). Bounded parallelism for publish and download. Per-item failures isolate; the batch keeps going and the report identifies what failed.

- Filename and folder sanitisation per the project's Drive-sync rules - drops `< > ? # % * : |`, replaces `&` with "and", `/` and `\` with `-`, normalises curly quotes to straight, drops trademark glyphs, truncates to 200 chars. Empty-after-sanitise falls back to `untitled`.

- Two new skills - `descript-export` (model-invocable with mandatory in-skill confirmation, matching the `descript-edit` pattern) and `descript-download-published` (read-only and unrestricted).

- New `npm run smoke:concurrency` dev script for empirically discovering Descript's rate-limit ceiling. Excluded from `npm test` and CI.

```

- [ ] **Step 3: Build, run tests, confirm passing**

Run: `npm run build && npm test 2>&1 | tail -10`

Expected: build clean, 151 tests passing.

- [ ] **Step 4: Commit, push, tag, push tag, create release**

Stage and present scope, wait for approval, then:

```bash
git add .claude-plugin/plugin.json package.json package-lock.json CHANGELOG.md
```

Commit message:

```
chore(release): v0.3.0

descript export + descript download-published shipped, closing field-
report items 3.3, 3.4, 3.5, 3.7, and 3.8. Includes WebVTT-to-SRT-and-
MD converter, batch fan-out across compositions and projects, closed
loop via export-report.json, two new skills, README use-case note,
and the concurrency smoke test in the dev workflow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

After approval and commit:

```bash
git push origin main
git tag -a v0.3.0 -m "v0.3.0 - descript export and descript download-published"
git push origin v0.3.0
```

Then create the GitHub release via `gh release create v0.3.0 --title "v0.3.0" --notes "..."` using the CHANGELOG entry as the body (HEREDOC pattern matching the v0.2.1 release).

- [ ] **Step 5: Verify the release**

```bash
gh release view v0.3.0 --json url,tagName,publishedAt
```

Confirm URL is live, tag matches.

---

## Self-review

Done. Plan covers:

- All four new workflow modules (Tasks 1-11) with TDD discipline matching v0.2.1
- Both new CLI commands (Tasks 12-16) with integration tests for every arg shape
- Both new SKILL.md files (Tasks 17-18) using the descript-edit confirmation pattern
- CLAUDE.md and README additions (Task 19)
- Concurrency smoke test (Tasks 20-21) so the production default is data-driven
- v0.3.0 release commit + tag + GitHub release (Task 22)

Each task lands the repo in a passing state, dist/ is rebuilt and committed alongside src/ changes, commits are gated and the user must approve before any `git commit` runs. Total test count goes from 101 (post-v0.2.1) to 151 by end of Task 16.

The plan does not invoke any implementation skill itself - executing-plans or subagent-driven-development picks it up from here.
