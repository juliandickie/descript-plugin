---
name: descript-api-reference
description: Internal reference of the Descript API surface and the descript CLI. Loaded by Claude when constructing Descript requests.
user-invocable: false
---

# Descript API Reference

Background knowledge for building correct Descript requests.

## Endpoints (all via the `descript` CLI)
- import: POST /jobs/import/project_media - async, returns job_id; URL, direct-upload, or multitrack media
- agent: POST /jobs/agent - async; one-shot prompt; spends AI credits. CLI flags: --project-id OR --project-name (new project from prompt), optional --composition-id, --model.
- publish: POST /jobs/publish - async; Video or Audio, resolution, access_level
- jobs: GET /jobs, GET /jobs/{id}, DELETE /jobs/{id} - state is queued, running, stopped, cancelled
- projects: GET /projects, GET /projects/{id}
- status: GET /status
- published: GET /published_projects/{slug}
- edit_in_descript: POST /edit_in_descript/schema - partner-gated, requires Descript onboarding

## Job completion
A job is done when job_state is stopped. Then result.status is success (or partial for import) or error. The CLI AndWait commands and the workflows handle polling automatically.

## Auth
Bearer token, Drive-scoped. Resolution order: --token, DESCRIPT_API_TOKEN, config file profile, plugin api_token.

## CLI map
descript status, config, import, agent, publish, jobs, projects, published, edit-in-descript, batch. Add --json for machine output, --no-wait to skip polling, --profile to select a Drive. import also accepts --media/--compositions (raw JSON for any import shape incl. multitrack) and --callback-url/--team-access; agent and publish accept --callback-url; agent also --team-access.
