# descript

Full programmatic access to the Descript API for Claude Code. A Node/TypeScript CLI covering all 11 endpoints plus polling, the three-step signed-URL upload, and a bulk pipeline runner, wrapped by skills and an optional MCP shim.

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

descript status, config, import, agent, publish, jobs, projects, published, edit-in-descript, batch

Global flags: --json, --no-wait, --token, --profile.

## Skills

descript-setup, descript-import, descript-edit, descript-publish, descript-jobs, descript-batch, descript-api-reference. Edit, publish, and batch are cost-gated.

## Tip - Per-cue density for chapter generation

For downstream LLM-driven content generation (YouTube descriptions, chapters, summaries), the API-derived per-cue Markdown transcript is denser and more anchor-rich than Descript's UI export. A 30-minute podcast yields ~750 timestamp anchors via this command vs ~50-100 from the UI's paragraph segmentation - useful when the downstream LLM needs many candidate chapter boundaries.

## Development

```
npm install
npm test
npm run build
```

Zero runtime dependencies.
