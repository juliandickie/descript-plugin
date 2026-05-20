import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DescriptClient } from "../client/index.js";
import { exportPublished, type ExportFormat, type ExportPublishedResult } from "./exportPublished.js";
import { publishAndWait } from "./publishAndWait.js";

export interface ExportBatchItem {
  projectId?: string;
  compositionId?: string;
  slug?: string;
  projectFolder?: string;
  /**
   * Formats to skip for this item. Used by `descript export --resume` to avoid
   * re-downloading or re-publishing what the prior report already covered. See
   * `docs/specs/2026-05-21-export-resume-design.md` for the semantics table.
   */
  skipFormats?: ExportFormat[];
}

export interface ExportBatchOptions {
  items: ExportBatchItem[];
  outputDir: string;
  formats: ExportFormat[];
  endMarker: boolean;
  concurrency: number;
  command: "export" | "download-published";
  publish?: {
    mediaType: "Video" | "Audio";
    resolution: "480p" | "720p" | "1080p" | "1440p" | "4K";
    accessLevel: "public" | "unlisted" | "private";
  };
  /**
   * When false, exportBatch returns the in-memory report but does NOT write
   * <outputDir>/<command>-report.json. Used by `descript export --resume`
   * which writes its own `resume-report.json` with a different shape.
   * Defaults to true.
   */
  writeReport?: boolean;
}

export interface ExportBatchReportItem extends ExportPublishedResult {
  projectId?: string;
  compositionId?: string;
}

export interface ExportBatchReport {
  ok: boolean;
  command: "export" | "download-published";
  items: ExportBatchReportItem[];
}

function slugFromShareUrl(shareUrl: string): string {
  // Descript share URLs end with /view/<slug>; pull the last path segment.
  try {
    const u = new URL(shareUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "";
  } catch {
    return "";
  }
}

async function processOne(
  client: DescriptClient,
  item: ExportBatchItem,
  opts: ExportBatchOptions
): Promise<ExportBatchReportItem> {
  // Reject items that carry both slug AND projectId+compositionId. The two
  // shapes are mutually exclusive at the boundary (slug = download-mode,
  // projectId+compositionId = publish-then-download mode). The current CLI
  // never constructs such items, but enforcing the contract here prevents
  // ambiguous behaviour for any future caller (per v0.3.0 followup §2.1).
  if (item.slug && (item.projectId || item.compositionId)) {
    return {
      ok: false,
      slug: item.slug,
      title: "",
      outputDir: "",
      written: [],
      failed: opts.formats.map((f) => ({ format: f, error: "item carries both slug and projectId+compositionId (mutually exclusive)" })),
      skipped: [],
      projectId: item.projectId,
      compositionId: item.compositionId
    };
  }

  // Determine the slug. Either passed in (download mode) or via publish (export mode).
  let slug = item.slug;
  if (!slug) {
    if (!item.projectId || !item.compositionId) {
      return {
        ok: false,
        slug: "",
        title: "",
        outputDir: "",
        written: [],
        failed: opts.formats.map((f) => ({ format: f, error: "item missing slug and projectId+compositionId" })),
        skipped: [],
        projectId: item.projectId,
        compositionId: item.compositionId
      };
    }
    if (!opts.publish) {
      return {
        ok: false,
        slug: "",
        title: "",
        outputDir: "",
        written: [],
        failed: opts.formats.map((f) => ({ format: f, error: "publish options required for export-mode batch" })),
        skipped: [],
        projectId: item.projectId,
        compositionId: item.compositionId
      };
    }
    try {
      const out = await publishAndWait(client, {
        project_id: item.projectId,
        composition_id: item.compositionId,
        media_type: opts.publish.mediaType,
        resolution: opts.publish.resolution,
        access_level: opts.publish.accessLevel
      });
      if (!out.ok || !out.shareUrl) {
        return {
          ok: false, slug: "", title: "", outputDir: "",
          written: [],
          failed: opts.formats.map((f) => ({ format: f, error: out.error ?? "publish failed without error" })),
          skipped: [],
          projectId: item.projectId,
          compositionId: item.compositionId
        };
      }
      slug = slugFromShareUrl(out.shareUrl);
      if (!slug) {
        // The share URL had no path segments. publishAndWait returned a malformed
        // URL or Descript's contract changed. Surface the root cause clearly
        // rather than letting a downstream "published_projects/" 404 obscure it
        // (per v0.3.0 followup §2.2).
        return {
          ok: false, slug: "", title: "", outputDir: "",
          written: [],
          failed: opts.formats.map((f) => ({ format: f, error: `could not extract slug from share URL: ${out.shareUrl}` })),
          skipped: [],
          projectId: item.projectId,
          compositionId: item.compositionId
        };
      }
    } catch (e) {
      return {
        ok: false, slug: "", title: "", outputDir: "",
        written: [],
        failed: opts.formats.map((f) => ({ format: f, error: e instanceof Error ? e.message : String(e) })),
        skipped: [],
        projectId: item.projectId,
        compositionId: item.compositionId
      };
    }
  }

  try {
    const result = await exportPublished(client, {
      slug: slug,
      outputDir: opts.outputDir,
      formats: opts.formats,
      endMarker: opts.endMarker,
      projectFolder: item.projectFolder,
      ...(item.skipFormats ? { skipFormats: item.skipFormats } : {})
    });
    return {
      ...result,
      projectId: item.projectId,
      compositionId: item.compositionId
    };
  } catch (e) {
    return {
      ok: false,
      slug: slug ?? "",
      title: "",
      outputDir: "",
      written: [],
      failed: opts.formats.map((f) => ({ format: f, error: e instanceof Error ? e.message : String(e) })),
      skipped: [],
      projectId: item.projectId,
      compositionId: item.compositionId
    };
  }
}

async function runPool<T, R>(
  inputs: T[],
  concurrency: number,
  worker: (input: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(inputs.length);
  let next = 0;
  async function workerLoop(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= inputs.length) return;
      results[i] = await worker(inputs[i]!, i);
    }
  }
  const workers = Array.from({ length: Math.max(1, concurrency) }, () => workerLoop());
  await Promise.all(workers);
  return results;
}

export async function exportBatch(
  client: DescriptClient,
  opts: ExportBatchOptions
): Promise<ExportBatchReport> {
  mkdirSync(opts.outputDir, { recursive: true });

  const items = await runPool(opts.items, opts.concurrency, (item) => processOne(client, item, opts));
  const ok = items.every((i) => i.ok);
  const report: ExportBatchReport = { ok, command: opts.command, items };

  if (opts.writeReport !== false) {
    const reportPath = join(
      opts.outputDir,
      opts.command === "export" ? "export-report.json" : "download-report.json"
    );
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  }

  return report;
}
