# Field Report - Agent Capability Under-Documented + v0.2.1 Status

Date - 2026-05-20 (continuation session, later same day, with a Julian-correction late in the session)

Plugin version observed - source repo at v0.2.1 (commit 845845d), installed cache still at v0.2.0

Author - Julian Dickie, via a Claude Code session

Related - Follow-up to `2026-05-20-mp4-srt-md-export-workflow.md`. That earlier report is the active scope for a separate v0.3 design session in progress and should be treated as a fixed snapshot. This report captures findings from a subsequent session without disturbing the original.

Status - Raw field feedback, intended as input for a follow-up planning session. Not itself a plan or a spec.

> **Note on the rewrite.** This report has been substantially rewritten from an earlier draft that framed the central issue as "no API surface for renaming compositions" and proposed a deterministic plan-rename workaround command. That framing was wrong. The Underlord agent endpoint (`descript agent`) already handles bulk metadata operations across an entire project from a single prompt, and Julian demonstrated this empirically by renaming 40 compositions in one Underlord prompt while this session was running. The real plugin-level issue is that the agent's capability surface is under-documented inside the plugin, which led Claude to mis-scope it and dismiss the right tool for the job. The rewrite reframes accordingly.

---

## 1. Context

While picking up a new task in a continuation session - bulk-rename 40 compositions in the iDD "2026 LPIS Promo Studio Videos" project to append ` - LPIS 2026` to every composition name that did not already have it - Claude initially concluded the descript plugin had no path for the rename. That conclusion was wrong.

What Julian actually did, with a single Underlord prompt in the Descript web app:

```
make sure every composition name has ' - LPIS 2026' added at the end if it hasn't already

don't include the ' marks
```

Underlord iterated over the 42 compositions in the project, skipped the 2 that already had the suffix, and appended ` - LPIS 2026` to the remaining 40. All in one job. The plugin's `descript agent --project-id <PID> --prompt <text>` command wraps the same underlying API endpoint and can do the same from the CLI or a Claude session.

Separately, a quick scan of the plugin source during the same session showed that two issues from the prior field report (3.1 and 3.2) had already been resolved in v0.2.1, and one (3.4) had a design spec in progress. Those observations are recorded in Section 3 as status notes on the prior report, so the audit trail is preserved without modifying the prior report's body.

---

## 2. New issues

### 2.1 The plugin's `agent` documentation undersells Underlord's capability

Observation - The plugin's `descript-api-reference` skill describes the agent endpoint as:

> "agent - POST `/jobs/agent` - async; one-shot prompt; spends AI credits. CLI flags - `--project-id` OR `--project-name` (new project from prompt), optional `--composition-id`, `--model`."

That text accurately describes the HTTP shape and CLI surface but tells the reader almost nothing about what Underlord can actually be asked to do. By contrast, the Descript official MCP server (a separate installation surfacing the same underlying endpoint) describes the same operation as:

> "AI agent that queries, creates, and edits Descript projects using natural language."

And on the parameters:

> "composition_id - Composition to target. ... Omit to target the whole project."

Three capabilities are visible from the MCP's text but not from the plugin's text.

- Underlord **queries** projects (reads), not just edits them. The plugin's text suggests edit-only.

- Underlord can **create new projects** from a prompt via `--project-name`. The plugin's text mentions the flag but does not flag this as a separate capability class.

- Omitting `--composition-id` targets **the whole project**, which is the bulk-operations mode. The plugin's CLI accepts the omission but the help text says nothing about what omitting it means.

Evidence - Julian's empirical demonstration in this session - one Underlord prompt iterated over all 42 compositions in a project, conditionally inspected each name, skipped 2 that already met the criterion, and renamed 40 that did not. Combined with the MCP description, the plugin's agent surface is much broader than its own docs suggest. The Descript public help docs for Underlord (`https://help.descript.com/hc/en-us/articles/36803785502221-Underlord-beta-Your-AI-co-editor-in-Descript`) enumerate the full capability list and are the canonical source.

Impact - High. Claude in this session, reading only the plugin's `descript-api-reference` skill text, dismissed Underlord as "designed to edit video timeline content, would cost AI credits per call, and is not suited to deterministic metadata mutations - not a real option for 40 renames." That dismissal was wrong on all three counts.

- Underlord handles metadata edits, not just timeline content.

- One prompt handles the whole project; not "40 calls".

- It is suited to deterministic mutations when the prompt is unambiguous (which "append X to every name that does not already end with X" is).

The cost (AI credits for one job) is real but small, and would have been disclosed and approved by the user if Underlord had been considered a real option. This is exactly the kind of capability gap that erodes user trust - the plugin had the tool but the docs hid the use case, so Claude routed around it with a worse workaround. AI-credit cost should be surfaced as a confirmable parameter, not a reason to dismiss a capability.

Suggested fix - Expand the plugin's `descript-agent` SKILL.md and the `descript-api-reference` skill to surface Underlord's actual capabilities, sourced directly from Descript's official Underlord help page. Four concrete items.

- Mirror the documented capability classes into `descript-agent` SKILL.md, with at least one example prompt per class. Canonical source files for this mirror are now committed in the plugin repo at `docs/help-docs/` (added late same day on 2026-05-20). The Underlord page enumerates Captions, Clips, Animations & Transitions, Translate, Sound Effects & Music, Slides to Video. The Descript API doc itself contains a "Common use cases" section for the agent endpoint with prompts like "create a 30-second video about cooking tips", "add studio sound to every clip", "remove all filler words from the transcript", "create a 30-second highlight reel", and "remove the section from 1:30 to 2:15" - these should be lifted directly. Plus the implicit (not-listed-but-empirically-confirmed) classes - **metadata edits** (Julian's bulk rename), **query operations** (read-only prompts), and **project-wide bulk operations** (omit `--composition-id`). The help page invites trying capabilities beyond the listed examples ("If you don't see it here—try it anyway, and see what happens"); the SKILL.md should adopt the same encouraging stance rather than presenting the list as a hard limit. Appendix A of this report points at the canonical files for direct lift.

- Treat `docs/help-docs/` as the canonical capability and behavior reference checked into the plugin repo. Since these files are now in-tree, the SKILL.md and `descript-api-reference` skill can reference them by path (e.g. `see docs/help-docs/Descript API.md for endpoint specifics`) rather than (or in addition to) external URLs that can break, require a login, or be Cloudflare-blocked. The companion prompt-writing guide (`docs/help-docs/How to write effective prompts for Descript's AI features.md`) gives a useful "Action, Context, Tone, Format, Constraints" framework for structuring agent prompts, and documents that in-UI prompts can attach context via `@` mentions (scenes, script selections, layers, project files, speakers, timestamps) - an affordance the API does not have, so API/CLI callers need to describe context in prose instead.

- Surface AI-credit cost and model selection together. The CLI already supports `--model` but the help text says nothing about the model options or their cost-quality trade-offs. The help page lists the models - Auto (smart auto-selection), Claude Haiku 4.5 (fast, lower credit cost, "responsive concise help"), Claude Sonnet 4.6 (creative workflows, multi-step tasks, instruction-following), Claude Opus 4.6 and 4.7 (strongest reasoning and nuanced language, highest credit cost), GPT 5.2 (fast and reliable for straightforward tasks), Gemini 3 Pro (multimodal, complex editing), Gemini 3.1 Pro (large projects, volume leveling, text-heavy work). Document these in the CLI help and in SKILL.md so callers can choose intentionally. The skill's confirmation step should state "this will spend AI credits and media seconds; using model X" before invoking the agent and report `ai_credits_used` and `media_seconds_used` from the job result. The plugin's CLAUDE.md already requires this disclosure - the SKILL.md and the agent command output should match.

- Document Underlord's beta caveats from the help page. Underlord "can overpromise, make incorrect assumptions, or follow you into workflows it's not equipped to complete." The skill should encourage users to check Underlord's output and iterate, especially for complex or multi-step prompts. For single-class deterministic prompts like the bulk rename, output verification is straightforward (re-run `descript projects get` and diff the names against the prompt's intent) and should be part of the suggested workflow.

Priority - High. This affects every future Claude session that reads the plugin's docs to decide whether agent is the right tool. Mis-scoping agent's capability is a hard-to-recover-from anti-pattern - the user has to correct Claude empirically, as happened in this session.

### 2.2 The plan-rename workaround proposed in the earlier draft is unnecessary

Observation - The earlier draft of this report proposed a `descript compositions plan-rename <project-id> --append <suffix>` command that would enumerate compositions and emit a markdown checklist for manual UI work. With the corrected understanding of agent's scope in 2.1, that workaround is mostly unnecessary. The agent endpoint handles the whole job in one call.

Evidence - Same empirical demonstration as 2.1.

Impact - Low. The plan-rename approach retains some value as a credit-free alternative for users who want to avoid AI-credit spend or who want explicit per-composition control (e.g. when the rename rule is too nuanced to express as a single natural-language prompt). But it should not be the primary path. The agent is the right tool for this class of operation.

Suggested fix - If `descript compositions plan-rename` is ever shipped, frame it in its SKILL.md as the "deterministic, credit-free alternative to using the agent for the same operation class". Document the agent path as primary. Or, given the limited remaining value, deprioritize plan-rename entirely and focus the documentation pass on Issue 2.1.

Priority - Low.

### 2.3 The plugin's CLI overlaps with an official Descript CLI; positioning should be made explicit

Observation - Descript ships an official CLI as part of the Descript API offering. From `docs/help-docs/Descript API.md` - "The CLI wraps the API into a simple to use command line tool with interactive flows for setting up authentication, importing, and prompting the agent. It also has built-in polling for job completion." Installed via `npm install -g @descript/platform-cli@latest`, configured via `descript-api config set api-key`, with commands `descript-api import`, `descript-api agent`, `descript-api edit --new`, etc. Julian's plugin ships its own CLI (`descript`) that wraps the same underlying API and provides overlapping commands. The plugin's README does not mention the official CLI.

Evidence - The full installation and command surface for the official CLI is documented in `docs/help-docs/Descript API.md`. The plugin's README (at the time of writing) lists its own command surface without referencing the official CLI's existence or how the two relate.

Impact - Medium. Users discovering Descript's API are likely to find both the official CLI (linked from Descript's own docs at descript.com/api) and the plugin (via Claude Code's plugin marketplace). Without explicit positioning in the README, a user has to compare both surfaces themselves to decide. The risk is that the plugin gets perceived as "a worse version of the official thing" rather than "the Claude-Code-friendly entrypoint to the same API". The two are not the same product - the plugin adds Claude skills, an MCP shim, the batch pipeline runner, the `published <slug>` reader, partner-gated `edit-in-descript`, and the disable-model-invocation cost gates. Surfaces overlap on the basics (status, config, import, agent, publish, jobs, projects). Drift between the two CLIs over time is a real risk.

Suggested fix - Three options worth considering.

- Add a "Relationship to the official Descript CLI" section to the plugin README, briefly stating - "The official Descript CLI (`@descript/platform-cli`) is published by Descript at https://descript.com/api. This plugin is parallel - it wraps the same API but is optimized for Claude Code, with skills, an MCP shim, and bulk workflows the official CLI does not currently expose. Use the official CLI for standalone terminal work; use this plugin for Claude-mediated work." That short paragraph eliminates 90% of user confusion.

- Consider whether the plugin's CLI should depend on `@descript/platform-cli` as a runtime dependency rather than reimplementing the wire calls. Trade-off - removes drift risk but introduces a third-party Node dependency the plugin currently does not have ("Zero runtime dependencies" per the plugin's CLAUDE.md). Probably not worth changing for v0.x, but worth a one-line decision-record entry.

- Audit the plugin's command surface for parity with the official CLI's surface, and explicitly document where the plugin diverges (e.g. plugin has `batch` and `published`; whether the official CLI has these or not is currently unknown from the help docs). The audit also surfaces features in the official CLI that the plugin might want (e.g. the interactive flows that `descript-api import` apparently provides - the plugin's `import` may be flag-driven only).

Priority - Medium. Not urgent but blocks coherent positioning of the plugin as it matures.

---

## 3. Status observations on the prior field report

These are NOT new issues. They are observations about the state of issues from `2026-05-20-mp4-srt-md-export-workflow.md` after a quick scan of the plugin source in this continuation session, recorded here for audit trail. The prior report's text was deliberately not modified, so as not to disturb the v0.3 design session that uses it as its scope.

### 3.1 (prior 3.1) - CLAUDE.md cost-claim overreach - Resolved in v0.2.1

Commit fbce711 ("docs: scope cost claims accurately across CLAUDE.md and the batch skill") rewords both files so only the agent operation is described as billable on standard plans. Publish and batch are now correctly framed as risk-gated rather than cost-gated, and batch's conditional-billable case (when manifest items include `agent_prompt`) is explicit. v0.2.1 ships this.

### 3.2 (prior 3.2) - Invalid `drive` access-level - Resolved in v0.2.1

Commit a73dc3b ("fix(cli): reject --access-level drive at parse time (not a real Descript value)") removes `drive` from the CLI's enum so the failure mode is now an immediate local validation error listing the three valid values, not an opaque API 403. v0.2.1 ships this.

### 3.4 (prior 3.4) - No first-class export command - Design in progress

A design spec is being authored at `docs/specs/2026-05-20-descript-export-design.md` (untracked in git at time of writing). No implementation commit yet.

Other issues from the prior report (3.3, 3.5, 3.6, 3.7, 3.8) were not specifically scanned this session and their status is unknown from this report's vantage point. The design spec for 3.4 may incidentally address 3.5 (composition-name-as-filename helper) and 3.7 (the duplicate download URL observation), since both are naturally subsumed by a `descript export` command.

---

## 4. Suggested next steps

Three follow-ups for whoever picks this up next.

1. **Agent capability documentation pass (Issue 2.1) - high impact, small lift.** Read Descript's Underlord help docs (the main page linked in 2.1 plus the prompt-writing companion page), enumerate the capability classes, mirror them into `descript-agent` SKILL.md with example prompts per class, and add a link out to the canonical source. Update `descript-api-reference` similarly. Appendix A of this report has the distilled catalog ready to lift. Can ship as a docs-only point release.

2. **Lesson for the v0.3 design session.** If `descript export` is in scope, consider whether some of its post-processing tasks (e.g. "generate timed YouTube chapters from this transcript") could be implemented by delegating to an agent prompt rather than by hand-rolled deterministic logic. The line between "deterministic CLI feature" and "natural-language agent task" should be drawn intentionally - agent is appropriate wherever the input space is unbounded and deterministic logic would require many cases. The cost-disclosure pattern in 2.1's third bullet applies to any such delegation.

3. **Plugin-level convention worth adopting going forward.** When the plugin's API reference describes an endpoint that wraps a richer upstream capability (Underlord is the textbook example), the plugin's docs should explicitly link to the upstream product docs as the canonical capability reference, rather than try to summarize and risk drifting behind. The plugin's role is the API contract; the product docs are the capability surface.

---

## Appendix A - Underlord capability catalog

The canonical Descript documentation was committed to the plugin repo at `docs/help-docs/` on 2026-05-20. The plugin author can lift directly from those files rather than re-fetching from the help center (which is Cloudflare-protected and may block automation).

### A.1 Canonical source files in `docs/help-docs/`

Read order roughly matches "most-important-for-plugin-docs-mirror first".

- `Descript API.md` - The full API documentation including the agent endpoint's "Common use cases" section (cooking-tips video, studio sound, filler words, highlight reel, time-range removal), the publish endpoint's republish-keying behavior, direct file upload three-step flow, rate-limit headers, list_projects filtering, Edit-in-Descript partner integration. The plugin's `descript-api-reference` skill currently captures a fraction of this.

- `Underlord (beta) Your AI co-editor in Descript.md` - The Underlord page that started this trail. Capability classes with example prompts (Captions, Clips, Animations & Transitions, Translate, Sound Effects & Music, Slides to Video). Model selector table. Beta caveats. Note that AI-Tool-panel actions (Remove Filler Words, Shorten Word Gaps, Edit for Clarity) are folded into Underlord.

- `How to write effective prompts for Descript's AI features.md` - Action / Context / Tone / Format / Constraints prompt framework. Worked example. The in-UI `@` mention affordance for attaching scenes, script passages, layers, files, speakers, timestamps as context (not available in the API; API callers describe context in prose).

- `Track and understand your media minutes and AI credits.md` - The full credit cost table per feature (see A.5 below for the agent-relevant subset). The Haiku 4.5 model is currently the most cost-efficient option.

- `AI Tools Overview.md` - The five AI Tool categories (Sound good, Look good, Repurpose, Publish, Write). Each is a category of operations Underlord can also be asked to perform via natural-language prompt.

- `Edit for Clarity.md`, `Create clips from your content.md`, `Repurpose with AI Tools.md`, `Publish with AI Tools.md` - feature-specific docs for individual AI tools.

- `Translate and dub speech overview.md`, `Manage your do not translate list.md` - localization-specific docs. Notable: translation creates a NEW composition with new audio; not a toggle.

- `Automatic multicam.md` - multicam scene generation.

### A.2 Empirically-confirmed capability classes not in the help page's example table

The help page invites trying capabilities beyond the documented examples ("If you don't see it here—try it anyway, and see what happens"). The classes below are confirmed by empirical demonstration during the 2026-05-20 session or implied by the official MCP tool description ("AI agent that queries, creates, and edits Descript projects using natural language").

**Metadata edits** - rename, retag, reorganize compositions. Confirmed by Julian's 2026-05-20 demo on the LPIS Promo Studio Videos project, where one Underlord prompt renamed 40 of 42 compositions, conditionally skipping the 2 that already met the rule.

- Example - "Make sure every composition name has ` - LPIS 2026` added at the end if it hasn't already."

**Query / read operations** - implicit in the MCP description ("queries, creates, and edits") and in the help page's "Underlord is a Descript expert—if you don't know how to do something, just ask Underlord" framing.

- Example - "Which compositions are shorter than 30 seconds?"

- Example - "List every composition that has not been published yet."

**Project-wide bulk operations** - any prompt where the operation iterates across all compositions in the project. Triggered by omitting `--composition-id` per the MCP tool description ("Omit to target the whole project"). Confirmed by Julian's demo above. The single most impactful affordance to surface in the plugin's docs, since the plugin's CLI accepts the omission but the help text does not explain what omitting it does.

- Example - "Append ` - LPIS 2026` to every composition name in this project that doesn't already end with it."

### A.3 Model selection

The plugin already exposes `--model`. The available values per the help page are below. Premium models (the Opus tier and Gemini 3.x Pro) cost more AI credits per call.

| Model | Notes from the help page |
| --- | --- |
| `Auto` | Smart model selection based on the request. Recommended default. |
| `Claude Haiku 4.5` | Fast and efficient. Quick edits, summarization, everyday writing. Responsive, concise. Lower credit cost. |
| `Claude Sonnet 4.6` | Creative workflows, multi-step tasks, instruction-following matters. |
| `Claude Opus 4.6` | Strong reasoning and nuanced language. Complex edits, detailed rewrites, creative tasks needing context. Higher credit cost. |
| `Claude Opus 4.7` | Same strengths as 4.6, one model newer. Higher credit cost. |
| `GPT 5.2` | Fast, reliable, straightforward editing tasks. |
| `Gemini 3 Pro` | Multimodal capabilities, complex editing tasks. |
| `Gemini 3.1 Pro` | Larger projects, volume leveling, text-heavy work. |

### A.4 Beta caveats (from the help page)

- Underlord is beta. Capabilities are growing; behavior may change.

- Underlord can overpromise, make incorrect assumptions, or follow callers into workflows it cannot complete. Verify output, especially for complex or multi-step prompts.

- Underlord cannot make edits in the background while recording is in progress; the narration or script must be in place first.

- Pointing Underlord at specific scenes, layers, or script passages helps it succeed. The prompt-writing companion page has detail.

### A.5 AI Credits cost table (from `Track and understand your media minutes and AI credits.md`)

The plugin's `descript-agent` SKILL.md currently gives no per-operation cost guidance. The credits doc has a specific table that the SKILL.md should mirror or link to, so users know what they're committing to. Highlights for agent-relevant operations -

| Operation | Cost | Unit |
| --- | --- | --- |
| Underlord chat message (any) | "a few credits" | per message |
| Create clips | 30 | per use |
| Edit for clarity | 15 | per use |
| Studio Sound | 10 | per use |
| Remove filler words | 10 | per use |
| Shorten word gaps | 10 | per use |
| Translate captions | 10 | per use |
| Most "draft X" operations (title, summary, show notes, YouTube description, social, blog) | 10 | per use |
| Find highlights | 5 | per use |
| Create highlight reel | 20 | per use |
| Quick Design | 25 | per use |
| AI Video Maker | 25 | per use |
| Image generation | 3-5 | per image |
| Text-to-speech | ~5 | per minute |
| Dubbing | ~15 | per minute |
| Avatar | ~67 | per minute |
| Lip sync | ~50 | per minute |
| Video generation | 8-24 | per video |

For credit conservation, the credits doc explicitly recommends the Haiku 4.5 model as the most cost-efficient option. The plugin's `--model` help text should surface this.

### A.6 Agent endpoint API specifics (from `Descript API.md`)

Details surfaced in the API doc that the plugin's `descript-api-reference` skill currently omits.

- **composition_id accepts three formats** - full UUID, 5-character short ID (e.g. `39677` from a Descript URL), or a full Descript project URL (e.g. `https://web.descript.com/{project_id}/39677`). The plugin's CLI may already accept these via its own parsing, but the help text doesn't say.

- **Publish republish behavior** - publishing the same composition again automatically reuses the previous share URL, overwriting its content. Republish matching is keyed on `(project_id, composition_id, media_type)`, so a Video publish and an Audio publish of the same composition produce two separate share URLs. Worth documenting in `descript-publish` SKILL.md.

- **Rate limiting** - the API uses 429 responses with `Retry-After`, `X-RateLimit-Remaining`, and `X-RateLimit-Consumed` headers. Plugin should honor `Retry-After` (probably does via its built-in polling layer, but worth confirming).

- **list_projects filtering** - the endpoint supports `name` (case-insensitive contains), `folder_path`, `created_by` (`me` is a valid value), `created_after/before`, `updated_after/before`, `sort` (name|created_at|updated_at|last_viewed_at), `direction` (asc|desc), and pagination. The plugin's `projects list` may not expose all these.

- **Common use cases for the agent endpoint** (verbatim from the API doc) - "create a 30-second video about cooking tips", "add studio sound to every clip", "remove all filler words from the transcript", "create a 30-second highlight reel", "remove the section from 1:30 to 2:15". These belong in `descript-agent` SKILL.md alongside the canonical-source-of-truth link.
