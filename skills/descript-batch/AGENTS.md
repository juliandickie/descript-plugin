<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# descript-batch

## Purpose

Bulk Descript pipeline runner. Imports, then agent-edits, then publishes across many items from a JSON manifest. Operator-only because (1) a manifest with `agent_prompt` items spends AI credits and media seconds, and (2) any bulk run touches many projects at once. Backs `descript batch plan|run`.

## Key Files

| File | Description |
|------|-------------|
| `SKILL.md` | Skill manifest with `disable-model-invocation: true`. Manifest shape plus mandatory dry-run gate. |

## For AI Agents

### Working In This Directory

- `disable-model-invocation: true` is required. Do not remove. Operator-only.

- Dry-run is mandatory: `descript batch plan <manifest.json> --json`. Present the full plan and estimated spend to the user. Do not summarise items.

- Run only after explicit user approval with `descript batch run <manifest.json> --confirm --json`. The `--confirm` flag is required, the CLI refuses without it.

- Batch is URL-only. For local files, use the `descript-import` skill per item, the batch runner rejects file sources at plan time.

- Pure import-and-publish manifests are NOT billable, but the dry-run gate stays mandatory regardless because of the multi-project blast radius.

- Manifests that include `agent_prompt` items ARE billable. Surface the estimated credit and second spend in the plan output.

- Report per-item outcomes including failures. Never report partial success as success (per Julian's CLAUDE.md "fail loud on actions").

- While a long batch runs, use `descript-jobs` to monitor or cancel runaway items.

### Manifest Shape

```json
{
  "concurrency": 2,
  "items": [
    {
      "name": "...",
      "source": { "url": "https://..." },
      "project_name": "...",
      "agent_prompt": "...",
      "publish": { "media_type": "Video", "resolution": "1080p" }
    }
  ]
}
```

- `agent_prompt` is optional. Omit for import-and-publish-only flows.

- `publish.access_level` is optional. Allowed: `public`, `unlisted`, `private` (the CLI rejects `drive` at parse time).

## Dependencies

### Internal

- `../../src/cli/commands/registry.ts` (`batch` handler).

- `../../src/workflows/batch.ts` (`parseManifest`, `planBatch`, `runBatch`).

- `../descript-jobs/` (monitor and kill switch).

### External

- Descript API `/jobs/import/project_media`, `/jobs/agent`, `/jobs/publish` orchestrated per item.

<!-- MANUAL: -->
