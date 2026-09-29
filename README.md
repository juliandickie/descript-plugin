# descript

Full programmatic access to the Descript API for Claude Code. A Node/TypeScript CLI covering all 14 documented Descript API endpoints (spec refreshed 2026-09-30) plus polling, the three-step signed-URL upload, and a bulk pipeline runner, wrapped by skills and an optional MCP shim.

## Install (standalone)

```
/plugin marketplace add juliandickie/descript-plugin
/plugin install descript@descript
```

## Setup

Create a token in Descript Settings, API tokens, then:

```
descript config set --token <TOKEN> --profile default
descript status
```

Or set DESCRIPT_API_TOKEN, or the plugin api_token config.

## CLI

descript status, config, import, agent, models, transcript, timeline, translate, publish, jobs, projects, search, published, download-published, export, edit-in-descript, batch

Global flags: --json, --no-wait, --token, --profile.

`descript export --names <file>` (v0.7.0) renders exported files under the iDD language filename standard from a naming manifest (lesson fields plus the composition-to-language map captured at translation time), validated batch-wide before any publish. See the descript-export skill for the manifest shape.

`descript transcript <pid> [cid] --format markdown --timecodes-on-paragraphs --out <path>` exports a transcript for free, with no publish. Timecode flags are `--timecodes-every <sec>`, `--timecodes-offset <sec>`, `--timecodes-on-paragraphs`, `--timecodes-on-speakers` and `--timecodes-on-markers`; `--out` creates missing parent folders. The MCP tool `descript_transcript` takes the same options as a `timecodes` object, for example `{"on_paragraphs": true, "on_speakers": true}`, and rejects arguments it does not recognise instead of ignoring them.

`descript timeline <pid> [cid] --format premiere --out <path>` exports a composition as a timeline file for another editor and saves it, for free: no share page and no AI credits. `--format` is one of `edl` (Reaper, Samplitude), `sesx` (Adobe Audition), `fcp` (Final Cut Pro X), `premiere` (Premiere Pro), `davinci_resolve` (DaVinci Resolve) or `aaf` (Pro Tools, Logic). It submits the export job, waits, downloads the file from its signed storage link (valid 24 hours) and prints the saved path, size and that link; `--json` prints the same as one object. Without `--out` the file lands in the current folder as `<project_id>-<file name>`; `--out` may be a file path or an existing folder, and creates missing parent folders. Options are `--markers` or `--no-markers` (neither uses the format's default), `--track-per-file` (not fcp), `--source-frame-rate` (premiere and davinci_resolve only), `--strip-spaces` (aaf only), `--callback-url` and `--no-wait` (submit and stop). Media is not bundled, the editor relinks to your own files. The endpoint is live but not yet in Descript's published spec, so if it starts returning 404 the plugin needs updating. The MCP tool `descript_timeline` takes the same options, with `markers` as true, false or left out.

`descript search <query words...> [--type project,audio] [--match name,content] [--owner <uuid,...>] [--updated-after <date>] [--updated-before <date>] [--sort relevance|newest|oldest] [--limit 1-100]` searches the Drive for free (read-only) across project, folder, layout pack and media names, composition text and transcripts, covering projects, the drive media library and Brand Studio. It prints one line per result (`type  name  id  url`, media lines add location and seconds) and a count; `--json` prints the raw response. `--type project_folder` and `--type media_library_folder` are the only public source of folder ids. List flags are comma-separated. The MCP tool `descript_search` takes the same options, with `type`, `match` and `owner` as an array or a comma-separated string.

`descript publish` sends `--access-level private` unless you pass a level (`private`, `drive` for members of the Drive only, `unlisted` or `public`; v0.7.1); `--drive-default-access` uses the drive's configured default instead. The same default applies to the MCP tool and to batch manifests.

Unknown flags are usage errors (exit 2, nothing runs), so a typo never silently changes the result. The MCP tools follow the same rule: each accepts only the arguments its command reads, in snake_case or kebab-case, and rejects anything else before running. `descript_projects` and `descript_jobs` accept every list filter the CLI does.

The 2026-09-30 capability audit (`docs/field-reports/2026-09-30-api-and-mcp-capability-audit.md`) lists what the API and Descript's own MCP connector can do that the plugin does not wrap yet, including drive media library import.

## Skills

descript-setup, descript-import, descript-edit, descript-transcript, descript-timeline, descript-search, descript-translate, descript-publish, descript-jobs, descript-export, descript-download-published, descript-batch, descript-api-reference. Edit, translate, publish, export, and batch are cost- or confirmation-gated; transcript, timeline and search are free and ungated.

## Tip - Per-cue density for chapter generation

For downstream LLM-driven content generation (YouTube descriptions, chapters, summaries), the API-derived per-cue Markdown transcript is denser and more anchor-rich than Descript's UI export. A 30-minute podcast yields ~750 timestamp anchors via this command vs ~50-100 from the UI's paragraph segmentation - useful when the downstream LLM needs many candidate chapter boundaries.

## Relationship to the official Descript CLI

Descript publishes its own CLI as `@descript/platform-cli` (`npm install -g @descript/platform-cli@latest`, then `descript-api config set api-key`). It wraps the same API this plugin wraps, with interactive flows for setup, import, and agent prompting. This plugin is parallel, not a replacement. It adds Claude Code skills, an optional MCP shim, a bulk pipeline runner (`descript batch`), the export workflow (`descript export`, `descript download-published`), the partner-gated `edit-in-descript`, and the published-metadata reader. The two surfaces overlap on the basics (status, config, import, agent, publish, jobs, projects) and can coexist on the same machine. Use the official CLI for standalone terminal work; use this plugin for Claude-mediated work.

## Development

```
npm install
npm test
npm run build
```

Zero runtime dependencies.
