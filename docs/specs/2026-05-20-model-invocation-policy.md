# ADR - Model-Invocation Policy for descript-publish and descript-batch (Stream B)

Status - **PENDING APPROVAL** (consensus achieved at iteration 2, awaiting Julian's scope-review checkpoint before v0.3.3 implementation)

Iteration history -

- Iteration 1 - Architect returned APPROVE_WITH_CONCERNS, steelman for adopting Option D's default-private posture inside Option C's structure. Critic returned ITERATE (3 required revisions, 3 nice-to-haves).

- Iteration 2 - All three required revisions absorbed - (a) Option D rejection rewritten to acknowledge that the default-private posture IS adopted as the confirmation default per descript-export precedent; (b) pre-mortem scenario 1 mitigation replaced with concrete plugin-owned mechanism (default-private posture in publish SKILL.md, no Drive-policy delegation); (c) greppable acceptance criterion added for the default-private posture. Three nice-to-haves also absorbed - Why Chosen sentence on third-gate-category cost, contributor rule-of-thumb, Driver 2 sentence on batch's CLI gate being the load-bearing safety. **Architect verdict - APPROVE. Critic verdict - APPROVE.**

Date - 2026-05-20

Author - Claude (via ralplan consensus loop), under Julian Dickie's direction

Inputs -

- `docs/field-reports/2026-05-20-mp4-srt-md-export-workflow.md` §3.6 (the original v0.2.0 push back on the publish gate, "over-defensive, bypassable via Bash, false sense of safety").

- `docs/field-reports/2026-05-20-v030-followup-backlog.md` §5.4 (the deferred Stream B question).

- `docs/plans/2026-05-20-alignment-plan.md` v0.3.3 section (where Stream B was parked).

- `skills/descript-edit/SKILL.md` and `skills/descript-export/SKILL.md` (the model-invocable-with-confirmation precedent).

- `skills/descript-publish/SKILL.md` and `skills/descript-batch/SKILL.md` (the current operator-only gates).

---

## Context

Today's gate matrix (post v0.3.0)

| Skill | Cost class | Risk class | `disable-model-invocation` | Gate type |
|---|---|---|---|---|
| descript-edit | Cost-bearing (AI credits + media seconds) | Low | NO | In-skill confirmation |
| descript-publish | Not billable | Risk-bearing (creates hosted share URL) | YES | Operator-only |
| descript-batch | Conditionally billable (only with agent_prompt items) | Risk-bearing (bulk write) | YES | Operator-only + CLI --confirm dry-run gate |
| descript-export | Not billable per call | Risk-bearing (one publish per composition) | NO | In-skill confirmation |
| descript-download-published | Not billable | Read-only | NO | Unrestricted |
| descript-transcript | Free | Read-only, no artifacts | NO | Unrestricted - model-invocable without confirmation |
| models (no dedicated skill) | Free | Read-only | NO | Unrestricted |
| descript-translate | Billable (AI credits + media seconds, agent endpoint) | Low | NO | In-skill confirmation |

Addendum - 2026-08-27 - transcript and models added post-audit; both fall under the existing read-only unrestricted class.

Addendum - 2026-08-28 - translate added; billable agent wrapper, same confirmation class as edit.

The asymmetry that prompts this decision - `descript-export` is essentially a wrapper around `descript-publish` (it publishes one or many compositions, then downloads the result). Yet export is model-invocable with confirmation and publish is operator-only. A Claude session can publish a composition indirectly via the export skill but not directly via the publish skill.

The original v0.2.0 field report (§3.6) flagged the publish gate as "over-defensive" because (a) it doesn't actually prevent the action - Claude can invoke `descript publish` via Bash - and (b) the asymmetry erodes Claude's ability to reason about the tool surface (Claude has to know that the operation is reachable via export-or-Bash but not via the publish skill).

What does `disable-model-invocation` actually buy

It prevents the Skill tool from invoking the wrapper. Claude can still call the underlying CLI via Bash. So the gate forces a Bash path. The two paths differ in user visibility -

- **Skill path** - Claude invokes the skill, the skill's instructions enforce a confirmation step, the user approves in chat, the command runs.

- **Bash path** - Claude phrases the operation in conversation, runs the CLI command via Bash, the user approves the Bash invocation literally (with the full command visible).

The Bash path is marginally more visible (raw command text shown), but it's not strictly safer. Both paths require explicit user approval. The skill path is more conversational; the Bash path is more terminal-like.

---

## RALPLAN-DR Summary

### Principles

1. Cost gates and risk gates are different. Cost rides confirmation. Risk rides confirmation OR `disable-model-invocation`, decided per-operation.

2. Gates are UX guidance, not runtime barriers. If a gate doesn't actually prevent an action (Bash bypass exists), its job is to nudge the right path, not to enforce safety.

3. Asymmetric gates within one product erode the model's ability to reason about the tool surface. Either all risk-bearing operations are model-invocable with confirmation, or none are - or the carve-outs are justified per operation.

4. Existing skill-level gates that shipped without incident (descript-edit, descript-export) are evidence the in-skill confirmation pattern works.

5. The CLI's own gates (the mandatory `batch plan` then `batch run --confirm` dance for batch) are independent of the skill-level gate and protect their operations regardless.

### Decision Drivers (top 3)

1. **Resolve the descript-export vs descript-publish asymmetry.** The same publish operation reached two ways is gated differently. This is the most user-visible inconsistency in the plugin.

2. **Match the gate to the actual residual risk.** Publish at `access-level=private` has no external leakage. The risk is real only at `unlisted` or `public`.

3. **Don't claim safety the gate doesn't provide.** Field report §3.6 specifically called out that the gate gives a false sense of safety because it's bypassable.

### Viable Options

**Option A - Remove `disable-model-invocation` from both publish and batch, rely on in-skill confirmation uniformly**

Pros - Consistent model. The four model-invocable risk-bearing operations (publish, batch, export, edit) all use the same gate type. No special cases for Claude to learn. Field report §3.6's specific complaint goes away. Resolves the export-vs-publish asymmetry cleanly.

Cons - Two more skills become model-invocable. Confirmation step is the only barrier. If a future SKILL.md edit accidentally weakens the confirmation language, the gate weakens silently. Batch's bulk-write blast radius gets the same confirmation surface as a single publish, which feels under-weighted.

**Option B - Keep both gates, document the Bash bypass and the asymmetry**

Pros - Zero behavior change. Most conservative. If something goes wrong with publish or batch model-invocation in the wild, this option avoided that risk.

Cons - Doesn't resolve §3.6's complaint. Doesn't resolve the export-vs-publish asymmetry. Asymmetry is now documented as intentional, which makes the model surface harder to reason about, not easier. Future v0.4.0 list-projects/list-jobs work and any other model-invocable additions land alongside a frozen asymmetric gate matrix.

**Option C - Remove from publish only, keep batch gated**

Pros - Resolves the export-vs-publish asymmetry (the bigger UX problem). Preserves the batch operator-only gate because batch has additional blast radius properties (touches many projects, can spend AI credits via agent_prompt items). Single-composition publish matches descript-export semantically.

Cons - Adds nuance ("publish is model-invocable, batch is not, here's why") that needs documenting. The carve-out is defensible but creates a third gate category (model-invocable with confirmation, operator-only via flag, operator-only via CLI dry-run + flag). batch's existing CLI `--confirm` flag is the real safety; the skill flag is redundant.

**Option D - Remove from publish, add a `--default-access-level private` posture to the publish skill**

A more nuanced version of Option C. Remove `disable-model-invocation` from publish but constrain the model-invocable path to `access-level=private` by default unless the user explicitly elevates. Operator-only at `unlisted` or `public`.

Pros - Matches actual risk (private has zero external leakage, so the model-invocable path is bounded). Resolves the asymmetry. Operator gate kicks in exactly where it matters (external-reachable URLs).

Cons - Adds a flag-shape constraint inside the skill instructions, which the SKILL.md must enforce conversationally (the CLI itself doesn't have a "model-invocable mode" concept). If the model misreads the SKILL.md and runs `--access-level public`, the gate has failed silently. More mechanism to get wrong than Option A or C.

### Picked

**Option C** - remove `disable-model-invocation` from `descript-publish`, keep it on `descript-batch`.

Reasons - (1) Resolves the export-vs-publish asymmetry, which is the largest live UX problem. (2) Batch retains its operator-only gate because the bulk-write blast radius and possible agent_prompt billing are categorically different from a single publish. (3) The CLI's own `descript batch plan` then `descript batch run --confirm` dance is the actual safety mechanism for batch; that stays. (4) Option D adds mechanism (default-access-level enforcement in the SKILL.md) that the CLI itself doesn't enforce - error-prone. Option A makes batch's gate weaker without compensating elsewhere. Option B leaves §3.6's complaint open.

### Pre-mortem (3 scenarios)

1. **Removing the publish gate causes a real accidental external publish.** A user gives Claude an instruction like "publish this composition" without specifying access-level; the skill's confirmation step misses the access-level question; Claude invokes `descript publish --access-level public` and produces a public URL. Mitigation (concrete, plugin-owned) - the publish SKILL.md defaults the access-level confirmation to `private` unless the user has explicitly stated otherwise. Elevation to `unlisted` or `public` requires affirmative user language confirming the elevation. This mirrors the existing default-private posture in `skills/descript-export/SKILL.md`. The plugin owns this posture in its own SKILL.md prose, not in per-Drive configuration the plugin cannot see or audit.

2. **The asymmetry inverts after this change** - descript-export remains model-invocable but loses its existing confirmation step somehow, while publish gains one. Mitigation - the v0.3.3 implementation includes a code-reviewer agent in the team-verify stage that explicitly diffs the confirmation step shapes across descript-edit, descript-export, descript-publish to ensure they match. This is mechanical, not interpretive.

3. **Future plugin contributors confuse the gate matrix.** A new skill lands without `disable-model-invocation` because the contributor sees publish doesn't have one, missing that batch does. Mitigation - the plugin's CLAUDE.md and root AGENTS.md document the gate matrix explicitly (the table at the top of this ADR's Context section is a candidate to lift verbatim). The v0.3.3 implementation includes updating both files.

---

## Decision

Remove `disable-model-invocation: true` from `skills/descript-publish/SKILL.md`. Keep `disable-model-invocation: true` on `skills/descript-batch/SKILL.md`.

Apply the in-skill confirmation pattern to `descript-publish`. The pattern mirrors what `descript-edit` and `descript-export` already use - the SKILL.md instructions enumerate the confirmation parameters (project id, composition id, media type, resolution, access level) before submitting the command. Confirmation is conversational, in chat, blocking until the user approves.

Update root `AGENTS.md` and `CLAUDE.md` to reflect the new gate matrix.

## Drivers

1. Resolve the descript-export vs descript-publish asymmetry, which is the largest live UX inconsistency in the plugin (post v0.3.0).

2. Match the gate to the actual residual risk - the operator gate stays exactly where blast radius is categorically larger (batch).

3. Honor the field report §3.6 complaint that the publish gate provides no actual safety, only friction. The in-skill confirmation is what actually controls the action; making that the explicit gate aligns the safety story with reality.

## Alternatives Considered

- **Option A** (remove both) - rejected because batch's CLI `plan` then `run --confirm` dance is the load-bearing safety mechanism; the skill-level gate on batch is belt-and-braces. Removing the skill-level gate would not weaken safety meaningfully, but the bulk-write blast radius and possible agent_prompt billing argue for keeping the operator-only label as an honest signal of categorical risk class. Option A is the most defensible if you weigh "skill-level gates should not be redundant with CLI gates" highest; this ADR weighs "operator-only label reflects categorical risk" higher.

- **Option B** (keep both) - rejected because it leaves §3.6's complaint open and freezes the asymmetric gate matrix (export model-invocable, publish operator-only for the same underlying operation) as intentional. That asymmetry erodes the model's ability to reason about the tool surface.

- **Option D** (remove from publish, add default-private posture) - the default-private posture IS adopted in this ADR as the confirmation default in the publish SKILL.md (see Decision). What is rejected from Option D is the separately-proposed additional operator-gate at `unlisted` and `public` access levels. A second gate category on top of the in-skill confirmation would create a four-gate matrix (unrestricted, in-skill confirmation with private posture, operator-only via flag, operator-only via CLI dry-run + flag) which over-complicates the surface. The default-private posture inside the confirmation step is sufficient to bound the model-invocable path without a second gate.

## Why Chosen

Option C resolves the live UX inconsistency without weakening the only place the operator gate is actually load-bearing - batch, where the CLI's mandatory `plan` then `run --confirm` dance is the safety mechanism and the skill-level gate is the honest signal of categorical risk class (bulk-write blast radius, possible agent_prompt billing). The change creates a third gate category in the matrix (model-invocable with confirmation; operator-only via skill flag; operator-only via skill flag + CLI dry-run + CLI --confirm). The boundary is "single-composition operation" versus "bulk-write across many compositions" and is documented as the rule of thumb for future contributors in `AGENTS.md`. The implementation is straightforward (one frontmatter line removed, one confirmation section added with the default-private posture, three doc files updated) and the verify pass can mechanically check that the confirmation step shapes match across the model-invocable skills.

## Consequences

- `descript-publish` becomes model-invocable. Claude can route to the skill from a conversational request rather than having to ask the user to invoke Bash directly.

- The publish skill's instructions gain an explicit confirmation step that matches `descript-edit` and `descript-export` (project id, composition id, media type, resolution, access level explicitly confirmed before submit).

- `descript-batch` stays operator-only. The CLI's `batch plan` then `batch run --confirm` dance remains the bulk-operations safety mechanism.

- Root `AGENTS.md` and `CLAUDE.md` gate matrix is updated.

- Root `AGENTS.md` gains a one-sentence rule of thumb for future contributors - "Operator-gate any skill whose blast radius extends beyond a single composition, or that can spend AI credits transitively via `agent_prompt` items."

- Three model-invocable risk-bearing skills (`descript-edit`, `descript-export`, `descript-publish`) all share the same confirmation pattern. A future contributor adding a fourth knows what to follow.

## Follow-ups

1. Update `skills/descript-publish/SKILL.md` - remove `disable-model-invocation: true` from frontmatter, add an explicit confirmation step in the instructions matching the existing `descript-edit` and `descript-export` confirmation shape, AND add the default-private access-level posture per the pre-mortem scenario 1 mitigation. The posture text should parallel the existing language in `skills/descript-export/SKILL.md` (e.g. "Default is `private`. Only override if the user has explicitly requested `unlisted` or `public`.").

2. Update root `AGENTS.md` cost-and-risk section to reflect new gate matrix.

3. Update `CLAUDE.md` to reflect new gate matrix (the current language says "publish and batch are operator-only via the disable-model-invocation flag" - needs revision to say only batch is).

4. Update `skills/descript-api-reference/SKILL.md` cost annotations to match.

5. Add a CHANGELOG entry for v0.3.3.

6. Bump `package.json` and `plugin.json` to 0.3.3.

7. v0.3.3 ships with no source-code or test changes. `dist/` should produce docstring-only diff if anything (likely zero diff).

---

## Implementation scope for v0.3.3

Documentary only. No source code, no tests.

- 1 frontmatter edit on `skills/descript-publish/SKILL.md` (remove `disable-model-invocation: true`).

- 1 instruction addition on `skills/descript-publish/SKILL.md` (the explicit confirmation step matching descript-edit's shape).

- Updates to root `AGENTS.md`, `CLAUDE.md`, and `skills/descript-api-reference/SKILL.md` to reflect the new gate matrix.

- New CHANGELOG entry.

- Version bump.

Total - ~5 files. ~1 hour of focused work. No test changes (the gate matrix isn't covered by automated tests today; an ADR-driven shape check is the verification).

## Acceptance criteria for v0.3.3

- `skills/descript-publish/SKILL.md` no longer has `disable-model-invocation: true` in frontmatter.

- `skills/descript-publish/SKILL.md` has an explicit "Confirm project id, composition id, media type, resolution, and access level with the user" step that matches descript-edit's and descript-export's confirmation shape (greppable check - the phrase "Before submitting" or equivalent appears).

- `skills/descript-publish/SKILL.md` defaults the access-level confirmation to `private` (greppable check - the phrase `Default is private` OR `private` with the word "default" within 20 characters appears in the confirmation context).

- `skills/descript-batch/SKILL.md` still has `disable-model-invocation: true` (no change).

- Root `AGENTS.md` cost-and-risk gates section reflects the new matrix.

- Root `AGENTS.md` contains the one-sentence rule of thumb (greppable check - the phrase "blast radius extends beyond a single composition" appears).

- `CLAUDE.md` cost-and-risk section reflects the new matrix.

- CHANGELOG entry dated.

- All 161 tests still pass (no test changes expected).

- `npm run build` produces no behavioural diff in `dist/` (any diff is limited to docstring comments).
