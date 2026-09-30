<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-20 | Updated: 2026-05-20 -->

# descript-jobs

## Purpose

Inspect, list, or cancel Descript jobs. The stop control for a runaway batch. Backs `descript jobs list|get|cancel`.

## Key Files

| File | Description |
|------|-------------|
| `SKILL.md` | Skill manifest plus list/get/cancel commands and job-state semantics. |

## For AI Agents

### Working In This Directory

- Read operations (`list`, `get`) are unrestricted.

- `cancel` requires user confirmation in chat, treat it as risk-bearing (it stops in-flight work).

- Job states: `queued`, `running`, `stopped`, `cancelled`. Completion is `job_state === "stopped"`, then read `result.status` for success/failure.

- `descript jobs cancel <JOB_ID>` is the kill switch for a runaway agent or batch.

- Pair with `descript-batch` (long batches) and `descript-edit` (long agent edits).

## Dependencies

### Internal

- `../../src/cli/commands/registry.ts` (`jobs` handler).

- `../../src/client/jobs.ts` (`listJobs`, `getJob`, `cancelJob`).

### External

- Descript API `/jobs` collection.

<!-- MANUAL: -->
