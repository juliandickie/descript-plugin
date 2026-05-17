---
name: descript-batch
description: Run a bulk Descript pipeline - import then agent-edit then publish across many items from a manifest. Use for large batch content operations across many videos.
disable-model-invocation: true
---

# Descript Batch

Operator-triggered. Bulk operations spend significant AI credits and media seconds.

## Instructions
1. Build a JSON manifest: { "concurrency": 2, "items": [ { "name": "...", "source": {"url": "..."}, "project_name": "...", "agent_prompt": "...", "publish": {"media_type":"Video","resolution":"1080p"} } ] }
2. ALWAYS plan first: `descript batch plan manifest.json --json`. Present the full plan and estimated spend to the user. Do not summarize it.
3. Only after explicit user approval: `descript batch run manifest.json --confirm --json`
4. Report per-item outcomes including failures. Never report partial success as success.
