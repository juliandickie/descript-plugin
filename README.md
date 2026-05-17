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

## Development

```
npm install
npm test
npm run build
```

Zero runtime dependencies.
