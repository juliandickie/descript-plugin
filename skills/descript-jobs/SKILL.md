---
name: descript-jobs
description: Inspect, list, or cancel Descript jobs. Use when the user asks about the status of a Descript import, edit, or publish, wants to see recent jobs, or needs to cancel a running or runaway job.
---

# Descript Jobs

## When to Use
- "Is my Descript edit done?", "list recent Descript jobs", "cancel that job"

## Instructions
- List: `descript jobs list --json`
- Get one: `descript jobs get <JOB_ID> --json` - completion is job_state stopped, then read result.status.
- Cancel: confirm with the user first, then `descript jobs cancel <JOB_ID> --json`. Cancel is the stop control for a runaway batch.
