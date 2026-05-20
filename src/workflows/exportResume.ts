// Resume reconstruction for `descript export --resume`.
//
// Reads a prior export-report.json, runs the semantics table from
// `docs/specs/2026-05-21-export-resume-design.md`, and produces an
// ExportBatchItem[] for exportBatch.ts to execute, plus a list of
// already-handled items that go directly into the resume report.
//
// Pure logic + filesystem existsSync checks. No network, no writes.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { sanitize } from "./filenameSanitize.js";
import type { ExportBatchItem, ExportBatchReport, ExportBatchReportItem } from "./exportBatch.js";
import type { ExportFormat } from "./exportPublished.js";

/**
 * Item shape in resume-report.json. Extends ExportBatchReportItem with
 * resume-only fields per the spec's schema section.
 */
export interface ResumeReportItem extends ExportBatchReportItem {
  resumed: boolean;
  reason?: string;
  partially_resumable?: true;
}

/**
 * Resume report shape per the spec. schema_version present for future
 * resume-of-resume compatibility detection.
 */
export interface ResumeReport {
  schema_version: 1;
  command: "export";
  ok: boolean;
  resumed_from: string;
  all_skipped: boolean;
  items: ResumeReportItem[];
}

export interface ReconstructResult {
  /** Items to run through exportBatch (each carries skipFormats hints). */
  itemsToRun: ExportBatchItem[];
  /**
   * Items that don't need to be run (already complete on disk OR malformed
   * in the prior report). Each carries `resumed: false` and a reason.
   * Goes directly into the resume report alongside whatever itemsToRun produces.
   */
  alreadyHandled: ResumeReportItem[];
  /** True iff every item resolved to alreadyHandled (resume is a structural no-op). */
  allSkipped: boolean;
  /** The effective format set for this resume (used by exportBatch.formats). */
  effectiveFormats: ExportFormat[];
}

/**
 * Parse-time check. The requested --formats set must overlap the union of
 * formats any item in the prior report attempted (written ∪ failed). If the
 * requested set is completely disjoint, the resume can't do anything and the
 * CLI should exit 2 with a clear "run a fresh export" message.
 */
export function validateRequestedFormatsAgainstReport(
  report: ExportBatchReport,
  requestedFormats: ExportFormat[] | undefined
): { ok: true } | { ok: false; reason: string } {
  if (!requestedFormats || requestedFormats.length === 0) return { ok: true };
  const attempted = new Set<ExportFormat>();
  for (const item of report.items) {
    for (const f of item.written) attempted.add(f);
    for (const { format } of item.failed) attempted.add(format);
  }
  const overlap = requestedFormats.some((f) => attempted.has(f));
  if (!overlap) {
    return {
      ok: false,
      reason: `no items in the report attempted any of the requested formats (${requestedFormats.join(", ")}). Run a fresh \`descript export\` with the new formats.`
    };
  }
  return { ok: true };
}

/**
 * Compute the union of formats attempted across every item in the report.
 * Used as the default effective format set when --formats is omitted.
 */
function unionAttempted(report: ExportBatchReport): ExportFormat[] {
  const set = new Set<ExportFormat>();
  for (const item of report.items) {
    for (const f of item.written) set.add(f);
    for (const { format } of item.failed) set.add(format);
  }
  // Preserve mp4/srt/md order for stability
  const order: ExportFormat[] = ["mp4", "srt", "md"];
  return order.filter((f) => set.has(f));
}

/**
 * Check whether the on-disk file for a given format exists. The mp4 format
 * may actually be .mp4 or .mp3 (audio publishes), so check both for that case.
 */
function fileExistsFor(itemDir: string, safeTitle: string, fmt: ExportFormat): boolean {
  if (fmt === "mp4") {
    return existsSync(join(itemDir, `${safeTitle}.mp4`))
        || existsSync(join(itemDir, `${safeTitle}.mp3`));
  }
  return existsSync(join(itemDir, `${safeTitle}.${fmt}`));
}

/**
 * Apply the per-item runtime resolution table from the spec. Pure function
 * over the prior report; no I/O except existsSync.
 */
export function reconstructResumeItems(
  prior: ExportBatchReport,
  requestedFormats: ExportFormat[] | undefined
): ReconstructResult {
  const itemsToRun: ExportBatchItem[] = [];
  const alreadyHandled: ResumeReportItem[] = [];

  // Effective format set for the resume call.
  const effective: ExportFormat[] = requestedFormats && requestedFormats.length > 0
    ? requestedFormats
    : unionAttempted(prior);

  for (const item of prior.items) {
    const itemAttempted = new Set<ExportFormat>();
    for (const f of item.written) itemAttempted.add(f);
    for (const { format } of item.failed) itemAttempted.add(format);

    // Per-item effective formats (narrowed to what this item actually attempted).
    const itemEffective: ExportFormat[] = effective.filter((f) => itemAttempted.has(f));
    // partially_resumable when the requested set asks for formats this item never attempted.
    const partiallyResumable: boolean = effective.length !== itemEffective.length;

    // Special case: no effective formats overlap (item attempted nothing the user wants).
    if (itemEffective.length === 0) {
      alreadyHandled.push({
        ...item,
        resumed: false,
        reason: `none of the requested formats were attempted for this item`,
        ...(partiallyResumable ? { partially_resumable: true as const } : {})
      });
      continue;
    }

    // Decide per-format whether to redo.
    const safeTitle = sanitize(item.title || "untitled");
    const failedFmts = new Set<ExportFormat>(item.failed.map((f) => f.format));

    const formatsToRedo: ExportFormat[] = [];
    for (const f of itemEffective) {
      const wasWritten = item.written.includes(f);
      const wasFailed = failedFmts.has(f);
      if (wasFailed) {
        // Failed in the prior run - always retry.
        formatsToRedo.push(f);
      } else if (wasWritten && item.ok) {
        // ok:true item where the user may have deleted the file. Check disk.
        // Per spec Row 1 + Row 2 (file present = skip; file missing = redownload via slug).
        if (!fileExistsFor(item.outputDir, safeTitle, f)) formatsToRedo.push(f);
      }
      // wasWritten && !item.ok: the prior run partially succeeded for this format.
      // Spec Row 4 says "re-download only the failed formats using slug" - do NOT
      // existsSync-check written formats on ok:false items. Trust the prior report.
      // !wasWritten && !wasFailed: format never attempted - already filtered out via itemEffective.
    }

    if (formatsToRedo.length === 0) {
      // Row 1: already complete (for this resume's effective set).
      alreadyHandled.push({
        ...item,
        resumed: false,
        reason: "already complete",
        ...(partiallyResumable ? { partially_resumable: true as const } : {})
      });
      continue;
    }

    // Build skipFormats: any effective format that does NOT need redoing for this item.
    const skipFormats: ExportFormat[] = effective.filter((f) => !formatsToRedo.includes(f));

    // Decide action: download-only (slug present) or publish-then-download (slug empty).
    if (item.slug) {
      // Row 2 or Row 4: re-download only the missing/failed formats using slug.
      const reconstructed: ExportBatchItem = {
        slug: item.slug,
        ...(skipFormats.length > 0 ? { skipFormats } : {})
      };
      itemsToRun.push(reconstructed);
    } else if (item.projectId && item.compositionId) {
      // Row 5: full publish-then-download (publish failed in prior run).
      const reconstructed: ExportBatchItem = {
        projectId: item.projectId,
        compositionId: item.compositionId,
        ...(skipFormats.length > 0 ? { skipFormats } : {})
      };
      itemsToRun.push(reconstructed);
    } else {
      // Row 6: malformed - no slug AND no projectId+compositionId.
      alreadyHandled.push({
        ...item,
        resumed: false,
        reason: "prior report item has no slug and no project/composition IDs - cannot resume"
      });
    }
  }

  const allSkipped = itemsToRun.length === 0;
  return { itemsToRun, alreadyHandled, allSkipped, effectiveFormats: effective };
}

/**
 * Assemble the final resume report from exportBatch's output + the alreadyHandled list.
 */
export function buildResumeReport(
  resumedFrom: string,
  batchItems: ExportBatchReportItem[],
  alreadyHandled: ResumeReportItem[],
  allSkipped: boolean
): ResumeReport {
  // Mark each batch-produced item as resumed: true.
  const ranItems: ResumeReportItem[] = batchItems.map((i) => ({
    ...i,
    resumed: true
  }));
  // Preserve input order if possible: alreadyHandled items first (they were skipped
  // synchronously), then run items. Tests should not assert order beyond per-item
  // correctness.
  const items: ResumeReportItem[] = [...alreadyHandled, ...ranItems];
  // ok: every item must be ok:true OR resumed:false with reason "already complete".
  const ok = items.every((i) => i.ok || (i.resumed === false && i.reason === "already complete"));
  return {
    schema_version: 1,
    command: "export",
    ok,
    resumed_from: resumedFrom,
    all_skipped: allSkipped,
    items
  };
}
