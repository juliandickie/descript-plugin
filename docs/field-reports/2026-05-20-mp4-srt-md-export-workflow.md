# Field Report - MP4 + SRT + MD Export Workflow

Date - 2026-05-20

Plugin version - 0.2.0

Author - Julian Dickie, via a Claude Code session

Status - Raw field feedback, intended as input for a follow-up planning session in `docs/plans/`. Not itself a plan or a spec.

---

## 1. Context

During a real-world session, Julian used the descript plugin to export one composition from the iDD Drive ("MC2 - I'd Pay Double - Ben Sorensen - 9x16 - Card", a 24-second 9x16 promo for the LPIS 2026 course) as three deliverables - MP4, SRT, and a markdown transcript - so the transcript can be fed into a separate AI session that generates the YouTube title, description, and timed chapters for the published video.

The workflow that ultimately produced clean output looked like this.

1. `descript projects get <PID> --json` - identify the composition ID by name from the project's compositions list.

2. `descript publish --project-id <PID> --composition-id <CID> --media-type Video --resolution 1080p --access-level private --profile idd --json` - render the MP4 to Descript's CDN, returning a `downloadUrl`.

3. `curl <downloadUrl>` - download the MP4 to a local path.

4. `descript published <slug> --profile idd --json` - fetch the published metadata, which carries the WebVTT `subtitles` field and the composition title via `metadata.title`.

5. A local Node script (see Section 5) converts the WebVTT to SRT and to a Descript-UI-style MD transcript with `[HH:MM:SS]` per-cue timestamps and a final `[HH:MM:SS] END` marker.

This works, but it required reasoning about several plugin behaviors that should arguably be the plugin's job to handle. The rest of this report enumerates the friction points.

---

## 2. What worked well

Worth recording so the next iteration does not regress these.

- Token setup via `descript config edit --profile <name>` followed by `descript status --profile <name>` was clean and gave a clear authenticated-or-not answer with the Drive ID. Profile selection across CLI flag, env var, file, and plugin option was unambiguous.

- The synchronous `descript publish` (with built-in polling via `publishAndWait`) gave a single-command experience for short clips. Output via `--json` with a stdout redirect to a file made the result easy to consume programmatically.

- The 403 error from Descript was helpfully decorated by the plugin with a `Hint` field and the literal list of allowed access levels for the Drive. This let us pivot from `--access-level drive` to `--access-level private` immediately without a separate lookup.

- Exit codes were meaningful and disjoint - 0 success, 3 forbidden, 4 generic publish failure. Useful for shell pipelines.

- The published-projects endpoint returns the composition title in `metadata.title`, which is exactly what is needed for sensible default filenames.

---

## 3. Issues found

Each issue lists the observation, the evidence, the user impact, a suggested fix, and a priority. Priority is from the lens of "would this materially improve the next user's experience".

### 3.1 CLAUDE.md overstates the cost surface of `descript publish`

Observation - The plugin's `CLAUDE.md` says "The agent, publish, and batch operations spend money (AI credits and media seconds)". This caused Claude to warn the user about a cost commitment before running `descript publish`, which is incorrect. The publish operation, including downloading the rendered file, is free on standard Descript paid plans.

Evidence - Empirical (the publish ran at zero cost during this session). Also, the plugin's own `descript-api-reference` skill correctly annotates only the agent endpoint as "spends AI credits", with no cost annotation on publish.

Impact - High. Inflated cost warnings undermine user trust and slow the workflow with unnecessary scope-review checkpoints. Claude propagated the inflated claim to the user, who pushed back, who was correct.

Suggested fix - Reword the cost paragraph in `CLAUDE.md` to scope each operation accurately. Something like - "The agent operation spends AI credits. The publish and batch operations are gated for risk reasons (publish creates a hosted artifact, batch chains multiple operations including possibly agent); they are not themselves billable." Audit the `descript-publish` SKILL.md similarly, where "Operator-triggered because publishing spends resources" is also ambiguous.

Priority - High.

### 3.2 The plugin's `--access-level drive` value is not a valid Descript option

Observation - The plugin's CLI accepts `drive` as a value for `--access-level`, but Descript's publish settings UI universally offers only three options - "Public", "Anyone with the link", and "Project access required". Submitting `drive` to the publish API returns 403 with the message "Access level \"drive\" is not permitted by this drive's publish settings. Allowed levels: public, unlisted, private." Despite the wording of the API error ("this drive's publish settings"), this is not a per-Drive configuration. Descript's standard UI exposes the same three options across Drives, and the plugin's fourth option does not correspond to anything a user can configure or enable.

Evidence - The plugin source at `dist/src/cli/commands/registry.js:26` defines `const ACCESS_LEVEL = ["public", "unlisted", "drive", "private"];`. The Descript web app's publish UI offers three options that map cleanly to three of these four API values. The 403 returned during this session listed `public, unlisted, private` as the allowed values. Julian's operator experience across multiple Descript Drives (iDD, Pro Marketing) confirms the UI is consistent. The fourth option (`drive`) is therefore either legacy, internal-only, or aspirational, but it is not user-reachable through the standard Descript product.

Impact - Medium-high. The plugin offers a value that will fail on any current Descript Drive. A user (or Claude on the user's behalf) reading the CLI's accepted-values list has no way to know `drive` is functionally dead. During this session, Claude selected `drive` as a "Recommended" default for the user, based on the assumption that an internal-Drive level would be the least-leakage choice for an export workflow. The API immediately returned 403, costing one round-trip before recovery.

Suggested fix - One of these, in priority order.

- Remove `drive` from the `ACCESS_LEVEL` array in `src/cli/commands/registry.ts` (and recompile `dist/`). Simplest, removes the footgun entirely. Any caller who passes `drive` will then fail at the CLI's `badEnum` check with a clear list of valid values, rather than after a network round-trip with an opaque 403.

- If `drive` is kept for forward compatibility with possible future Descript behavior, gate it behind a `--allow-unsupported-access-level` flag or emit a warning at the CLI when it is selected, so the user is informed before the API round-trip.

- At minimum, update `descript-publish` SKILL.md and the CLI's `--access-level` help text to enumerate the three working values (public, unlisted, private) and note that `drive`, while present in the enum, is currently rejected by Descript's API. The SKILL.md's instructions step 2 should pivot its access-level guidance accordingly.

Priority - Medium-high. This is an actual user-facing bug rather than a documentation gap, since the CLI presents a value whose only failure mode is at the API layer.

### 3.3 No paragraph-structured transcript via the API

Observation - The Descript public API only exposes WebVTT subtitles via `GET /published_projects/{slug}` in the `subtitles` field. There is no endpoint that returns the paragraph-structured transcript that Descript's web app produces via Export → Transcript → Markdown.

Evidence - Inspected `docs/descript-openapi.json` (out of scope of this report to enumerate). The `descript-api-reference` skill confirms the endpoint surface. The WebVTT for the test composition contained 10 cues; the UI export of the same composition produced 7 paragraphs with timecodes that did not match any cue start. The paragraph structure is internal to Descript's composition data and not surfaced via WebVTT.

Impact - Medium. Users wanting to replicate Descript's UI MD export via the API have to (a) accept paragraph segmentation derived from WebVTT cues, or (b) use the UI export. For Julian's chapter-generation use case the WebVTT-derived per-cue paragraphing turned out to be a feature (denser timestamps = better chapter anchoring), but other use cases will want UI-style paragraphs.

Suggested fix - Long-term, lobby Descript to add a paragraph-aware transcript endpoint to the public API. Short-term, document the limitation in `descript-publish` SKILL.md and in the README, and ship a built-in WebVTT-to-MD converter (see Section 5).

Priority - Medium.

### 3.4 No first-class "export composition as files" command

Observation - To get the three logical deliverables (MP4, SRT, MD transcript) for one composition, the user needs four steps - publish, curl, fetch-published, local conversion. Each step needs hand-wired flags and output paths. There is no `descript export <slug>` or `descript download-published <slug>` that bundles them.

Evidence - The workflow in Section 1 above.

Impact - Medium. Multi-step workflows are error-prone (e.g., it is easy to forget the `2>&1` redirect and lose stderr error output, as happened during the first 403). They also obscure the actual user intent, which is "give me the files".

Suggested fix - Add a high-level convenience command, for example `descript download-published <slug> [--output-dir <path>]`, that does the following.

- Calls `GET /published_projects/{slug}` once to get the title, `download_url`, and `subtitles`.

- Curls the `download_url` to `<output-dir>/<composition title>.mp4`.

- Writes `<output-dir>/<composition title>.srt` via WebVTT-to-SRT.

- Writes `<output-dir>/<composition title>.md` via WebVTT-to-MD with the same format as the standalone converter in Section 5.

- Reports the three file paths.

Or even higher level - `descript export <project-id> <composition-id> [--output-dir]` that does publish, fetch, curl, convert in one shot.

Priority - Medium.

### 3.5 No composition-name-as-filename helper

Observation - When publishing a composition and downloading the resulting MP4, the user has to manually extract the composition title from `metadata.title` in the published-metadata response and use it as the local filename. The Descript web app's local export uses the composition name verbatim as the filename for all three exports; the API path does not match this behavior by default.

Evidence - Initial deliverables from this session were named `video.mp4`, `captions.srt`, `transcript.md`. The user requested they be renamed to `<composition name>.mp4` etc. to match Descript's local-export convention.

Impact - Low to medium. Easily worked around but each user has to think about it.

Suggested fix - When 3.4 is implemented, default the filenames to `<composition title>.{mp4,srt,md}`. The composition title is already available in `metadata.title`.

Priority - Low. Subsumed by 3.4.

### 3.6 `disable-model-invocation: true` on `descript-publish` is over-defensive

Observation - The `descript-publish` skill blocks Claude from invoking it via the Skill tool. The plugin's `CLAUDE.md` justifies this with "publishing spends resources and produces a public artifact". With `--access-level private`, the publish does not produce a public artifact (only the publisher can view the share URL). The gate also does not actually prevent Claude from running the operation - Claude can call `descript publish` via Bash, bypassing the skill entirely.

Evidence - This session, after Julian explicitly authorized it, Claude invoked publish via Bash and produced the expected outputs at zero cost. The gate slowed the workflow without preventing the action.

Impact - Low to medium. Adds friction without adding protection. May give a false sense of safety to plugin authors who believe the gate is a real barrier.

Suggested fix - Two options worth considering.

- Remove `disable-model-invocation` from `descript-publish` and rely on the skill's existing "Confirm project id, composition id, media type, resolution, and access level with the user" step as the gate. This is functionally what happened in this session.

- Split into `descript-publish-private` (model-invocable, defaults to access-level private, refuses if a higher access level is requested) and `descript-publish-share` (operator-only, allows any access level). Keeps the safety surface explicit.

- Or, keep the gate and document explicitly that the gate is bypassable via Bash, so users don't infer false safety from it.

Priority - Low.

### 3.7 The published-metadata endpoint duplicates the publish job's download URL

Observation - Both the publish job result and the published-metadata response carry a fresh GCS-signed `download_url`. These are different URLs for the same object, with independent 24-hour expirations from each respective call's time.

Evidence - During this session, the publish job's `downloadUrl` and the published-metadata's `download_url` had different signatures and different `expires_at` timestamps for the same MP4.

Impact - Low. Mildly confusing for someone tracing what URL came from where, but not harmful. Worth noting because a unified `descript export` command (3.4) could choose either source.

Suggested fix - When implementing 3.4, prefer the published-metadata `download_url` so a single API call yields title, subtitles, and download URL together. Cuts one API call.

Priority - Low (informational).

### 3.8 WebVTT cue density is well-suited for downstream chapter generation

Observation - WebVTT cues are denser than Descript's UI paragraph segmentation. For Julian's downstream use case (feed transcript MD to another LLM session that generates YouTube chapters), this denser timing is desirable. Each WebVTT cue gives a `[HH:MM:SS]` anchor every ~2-3 seconds, vs Descript's UI which merges cues into longer paragraphs with sparser timestamps.

Evidence - For a 24-second test clip, WebVTT had 10 cues, UI export had 7 paragraphs. Extrapolated to a 30-minute podcast, WebVTT would give ~750 anchors vs UI ~50-100. For chapter generation needing ~10-15 chapters, WebVTT anchor resolution is roughly 50x finer than chapter spacing.

Impact - Positive. This is a feature, not a bug, but it is undocumented as a use case. New users may not realize the API path is actually better than the UI path for this specific downstream workflow.

Suggested fix - Add a use-case note to the plugin README - "For downstream LLM-driven content generation (YouTube descriptions, chapters, summarization), the API-derived WebVTT-based transcript is denser and more anchor-rich than the Descript UI's MD export. Use the API path for batch automation of content workflows."

Priority - Low (documentation).

---

## 4. Descript access-level behavior - universal notes

Recording the access-level model here so the follow-up session has a clear picture independent of any specific Drive. None of the items below are iDD-specific; they describe Descript's product behavior across Drives.

- Descript's web app publish UI offers three options - "Public", "Anyone with the link", and "Project access required". These map to API values `public`, `unlisted`, and `private` respectively, in the same order Descript's API returns them in its 403 error message.

- The plugin's CLI also accepts `drive` as a fourth value, which is not surfaced anywhere in Descript's UI and is rejected with 403 from the API. See Section 3.2.

- Semantics - `public` makes the share URL indexable by search engines. `unlisted` makes the share URL accessible without auth but not indexed. `private` restricts the share URL to users with explicit project access on Descript. The authenticated API `download_url` works regardless of access level, because access control on the download is enforced by the GCS-signed URL itself, not by Descript's privacy setting.

- For export-and-download workflows where the goal is just to render and pull the file locally (the use case driving this report), `private` is the appropriate choice on any Drive. The downstream signed `download_url` works for the authenticated caller no matter what access level was used. Anything more permissive than `private` is leakage surface without a corresponding download benefit.

- The API error message phrases the allowed list as "this drive's publish settings", which can mislead a reader into assuming the constraint is per-Drive. As far as is currently known, the three allowed values are constant across Descript Drives.

---

## 5. Candidate feature - built-in WebVTT-to-SRT-and-MD converter

During this session, a local Node script was written to convert the WebVTT subtitles from the published-metadata response into SRT and MD outputs. It is currently stored at `/Users/juliandickie/Downloads/descript-exports/MC2-Id-Pay-Double/convert.js` and is **not** part of the plugin source. It is reproduced here in full so a follow-up planning session can decide whether to upstream it as a plugin capability.

### Behaviors worth preserving

- Reads `published-result.json` (the output of `descript published <slug> --json`) and writes outputs adjacent to it.

- Filenames are `<composition title>.srt` and `<composition title>.md`, where the title is read from `metadata.title` in the published-metadata response.

- WebVTT to SRT - strips `WEBVTT` header and NOTE blocks; replaces `.` with `,` in timestamps; numbers cues sequentially starting at 1; preserves multi-line cue text as-is.

- WebVTT to MD - one paragraph per cue (chosen for downstream chapter-generation density, not for parity with Descript's UI export); `[HH:MM:SS]` timestamp (truncated to whole seconds, matching Descript's UI format); `**Speaker:**` label only on speaker change (matches Descript's "Speaker labels on every paragraph - OFF"); no metadata block; trailing space then blank line between paragraphs; final `[HH:MM:SS] END` marker using the END time of the last cue, so a downstream LLM knows the full video duration.

- Trims trailing whitespace, exits with a single POSIX newline at end of file.

### The script verbatim

```javascript
// Converts published-result.json (from `descript published <slug> --json`)
// into ${composition_name}.srt and ${composition_name}.md.
//
// MD format matches Descript's web app Transcript export with these settings:
//   - Include composition name: ON (used as # H1 title)
//   - Include speaker labels: ON
//   - Speaker labels on every paragraph: OFF (label only on speaker change)
//   - Timecodes (paragraph breaks): ON, format [HH:MM:SS]
//   - Include ignored text / highlights / markers: not handled here (would
//     require richer composition data than the WebVTT API surface exposes)
//
// One paragraph per WebVTT cue. Descript's UI uses internal composition
// paragraph segmentation that is NOT exposed in the public API's WebVTT.
// For chapter generation the per-cue density is a feature.

const fs = require("node:fs");
const path = require("node:path");

const dir = __dirname;
const published = JSON.parse(
  fs.readFileSync(path.join(dir, "published-result.json"), "utf8"),
);

const vtt = published.subtitles;
const meta = published.metadata || {};
const title = meta.title || "Untitled";

// Parse WebVTT into [{start, end, text}]
function parseVtt(content) {
  const lines = content.split(/\r?\n/);
  const cues = [];
  let i = 0;
  while (
    i < lines.length &&
    !/^\d{2}:\d{2}:\d{2}\.\d{3} --> /.test(lines[i])
  ) {
    i++;
  }
  while (i < lines.length) {
    const m = lines[i].match(
      /^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/,
    );
    if (!m) {
      i++;
      continue;
    }
    const start = m[1];
    const end = m[2];
    i++;
    const text = [];
    while (i < lines.length && lines[i].trim() !== "") {
      text.push(lines[i]);
      i++;
    }
    cues.push({ start, end, text: text.join("\n") });
    i++;
  }
  return cues;
}

// HH:MM:SS.mmm -> HH:MM:SS (Descript UI truncates, doesn't round)
function truncTimecode(vttTs) {
  return vttTs.split(".")[0];
}

// WebVTT -> SRT (numbered cues, comma-separated millis)
function toSrt(cues) {
  return (
    cues
      .map((c, idx) => {
        const start = c.start.replace(".", ",");
        const end = c.end.replace(".", ",");
        return `${idx + 1}\n${start} --> ${end}\n${c.text}`;
      })
      .join("\n\n") + "\n"
  );
}

// WebVTT -> MD (one paragraph per cue, Descript-UI-style format)
function toMd(cues, title) {
  // Matches "Ben Sorensen: ", "Dr. Jane Smith-Brown: ", "ID Speaker_1: ", etc.
  const speakerRe = /^([A-Z][\p{L}\s.'\-_0-9]+?):\s+/u;
  let currentSpeaker = null;
  const out = [];
  out.push(`# ${title}`);
  out.push("");

  for (const cue of cues) {
    let body = cue.text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

    let speakerForThisPara = null;
    const m = body.match(speakerRe);
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

  // End-of-content marker so a downstream LLM (e.g. YouTube chapter generator)
  // knows where the video actually finishes.
  if (cues.length > 0) {
    const lastEnd = truncTimecode(cues[cues.length - 1].end);
    out.push(`[${lastEnd}] END`);
    out.push("");
  }

  return out.join("\n").trimEnd() + "\n";
}

const cues = parseVtt(vtt);
const srtPath = path.join(dir, `${title}.srt`);
const mdPath = path.join(dir, `${title}.md`);

fs.writeFileSync(srtPath, toSrt(cues));
fs.writeFileSync(mdPath, toMd(cues, title));

console.log(`title: ${title}`);
console.log(`cues:  ${cues.length}`);
console.log(`wrote: ${srtPath}`);
console.log(`wrote: ${mdPath}`);
```

### Caveats

- Tested only on a single-speaker, 24-second WebVTT. Multi-speaker WebVTT (with `Name:` prefixes mid-transcript when speakers change) is handled by the speaker-change detection logic but has not been verified on real multi-speaker content.

- WebVTT cue settings (positioning, styling) are ignored. Descript does not currently emit these in our test output but the parser would lose them silently if it did.

- The script reads from a local `published-result.json` file in the same directory. To integrate as a plugin capability it would need to take the published-metadata as an in-process input rather than reading from disk.

- Inline markers and highlights are not handled. Julian's UI export settings included "Include markers - ON" and "Include highlights - OFF". If markers ever appear in the WebVTT, the converter should preserve them; for now we have not encountered any in test output.

---

## 6. Reference artifacts from the session

These live outside the plugin source but are referenced for completeness. They are not durable; the Downloads folder contents could be deleted at any time.

- `/Users/juliandickie/Downloads/descript-exports/MC2-Id-Pay-Double/` - the session's output directory.

- `MC2 - I'd Pay Double - Ben Sorensen - 9x16 - Card.{mp4,srt,md}` - the three deliverables.

- `publish-result.json` and `published-result.json` - raw API responses for audit.

- `convert.js` - the local converter reproduced in Section 5.

- `archive/descript-ui-export-reference.md` - the Descript web app's MD export of the same composition, kept as the format reference we attempted to match via API.

- `archive/transcript-v1-with-metadata-block.md` - an earlier API-derived MD with an inflated metadata block that the user rejected.

- `archive/captions-v1.srt` - identical to the canonical `.srt` but under an old generic filename.

---

## 7. Suggested next steps for a follow-up session

For whoever picks this up next.

1. Read this report and decide which issues to act on. The high-impact ones (3.1) and the convenience-feature one (3.4) together would substantially improve the next user's experience.

2. If acting on 3.4 (convenience export command), the script in Section 5 is a viable starting point. It would need to be ported to TypeScript and to take the published-metadata as an in-process input, not from disk. The MD format choices in Section 5 should be preserved as defaults but be overridable via flags (e.g., `--paragraph-mode {per-cue,single}`, `--end-marker {include,omit}`).

3. If acting on 3.1 (CLAUDE.md cost-claim audit), the audit should also extend to all SKILL.md files in `skills/` to ensure cost claims are accurate per-skill.

4. Consider whether 3.6 (disable-model-invocation on publish) merits its own design discussion. The current gate is bypassable and arguably misleading.

5. Bump the plugin version, update CHANGELOG, and ship.
