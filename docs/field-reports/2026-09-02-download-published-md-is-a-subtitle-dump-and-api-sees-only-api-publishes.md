# 2026-09-02 - download-published markdown is a subtitle dump, and the API only lists API publishes

Additive field note from a transcript pull on a second Descript Drive.

**Observed.** `descript download-published <slug> --formats md` writes markdown built from the WebVTT cues, one line per cue with paragraph timestamps every few seconds and a trailing `END` marker. The Descript desktop app's own transcript export for the same composition is paragraph form with a speaker label per paragraph and a timestamp per paragraph. For a 65 second lesson the CLI file had 23 short lines where the app export had 4 paragraphs. For reading, quoting or searching, the app export is the better artifact.

**Also observed.** `projects get <id>` lists only publishes made through the API. On that drive, 106 lesson compositions had been published from the desktop app and exported to Drive as md, srt and mp4, but the API returned 24 publishes across 116 projects. So the API cannot enumerate most published work, and `download-published` cannot reach it.

**What worked.** Treat the Drive export folder the editor writes to as the transcript source (one chapter subfolder each, md plus srt plus mp4 per lesson) and use the API for the inventory layer only: project IDs, composition IDs and names, durations, and the short-form cuts that never reach Drive. `projects list` paginates cleanly at 100 with the cursor; 2,209 projects took 23 pages.

**Possible plugin work.** A `--from-transcript` mode on `download-published`, or an `export-transcript` path that pulls the app-style paragraph transcript, would close the gap if the API exposes it. Not verified whether it does.
