import { mkdirSync, writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { DescriptClient } from "../client/index.js";
import { sanitize } from "./filenameSanitize.js";
import { parseVtt, toSrt, toMd } from "./webvtt.js";

export type ExportFormat = "mp4" | "srt" | "md";

export interface ExportPublishedOptions {
  slug: string;
  outputDir: string;
  formats: ExportFormat[];
  endMarker: boolean;
  projectFolder?: string;
  /**
   * Formats to deliberately skip for this item. Used by `descript export --resume`
   * to avoid re-downloading files that already exist on disk or were never
   * attempted in the original run. Listed formats are excluded from the per-format
   * loop and recorded in `skipped` on the result. See
   * `docs/specs/2026-05-21-export-resume-design.md` for the semantics table.
   */
  skipFormats?: ExportFormat[];
}

export interface ExportPublishedResult {
  ok: boolean;
  slug: string;
  title: string;
  outputDir: string;
  written: ExportFormat[];
  failed: Array<{ format: ExportFormat; error: string }>;
  /** Formats deliberately not attempted (set when caller passes `skipFormats`). */
  skipped: ExportFormat[];
}

function extensionFromUrl(downloadUrl: string, publishType: "audio" | "video" | "audiogram"): string {
  try {
    const u = new URL(downloadUrl);
    const path = decodeURIComponent(u.pathname);
    const dot = path.lastIndexOf(".");
    if (dot !== -1 && dot < path.length - 1) {
      const ext = path.slice(dot).toLowerCase();
      if (/^\.[a-z0-9]{2,5}$/.test(ext)) return ext;
    }
  } catch { /* fall through */ }
  if (publishType === "audio") return ".mp3";
  return ".mp4";
}

async function writeAtomic(path: string, body: Uint8Array | string): Promise<void> {
  const partial = `${path}.partial`;
  if (existsSync(partial)) unlinkSync(partial);
  writeFileSync(partial, body);
  renameSync(partial, path);
}

export async function exportPublished(
  client: DescriptClient,
  opts: ExportPublishedOptions
): Promise<ExportPublishedResult> {
  const meta = await client.getPublishedProjectMetadata(opts.slug);
  const title = meta.metadata?.title ?? "untitled";
  const safeTitle = sanitize(title);
  const targetDir = opts.projectFolder
    ? join(opts.outputDir, opts.projectFolder, safeTitle)
    : join(opts.outputDir, safeTitle);
  const skipSet = new Set<ExportFormat>(opts.skipFormats ?? []);
  // Per-format granularity: only build skipped[] for formats actually present in
  // the requested formats list. A skipFormats entry that isn't in opts.formats is
  // a no-op (no double-counting).
  const skipped: ExportFormat[] = opts.formats.filter((f) => skipSet.has(f));
  const effectiveFormats: ExportFormat[] = opts.formats.filter((f) => !skipSet.has(f));

  try {
    mkdirSync(targetDir, { recursive: true });
  } catch (e) {
    return {
      ok: false,
      slug: opts.slug,
      title,
      outputDir: targetDir,
      written: [],
      failed: effectiveFormats.map((format) => ({
        format,
        error: `mkdir failed: ${e instanceof Error ? e.message : String(e)}`
      })),
      skipped
    };
  }

  const written: ExportFormat[] = [];
  const failed: Array<{ format: ExportFormat; error: string }> = [];

  for (const fmt of effectiveFormats) {
    try {
      if (fmt === "mp4") {
        if (!meta.download_url) throw new Error("metadata response has no download_url");
        const ext = extensionFromUrl(meta.download_url, meta.publish_type);
        const out = join(targetDir, `${safeTitle}${ext}`);
        const res = await fetch(meta.download_url);
        if (!res.ok) throw new Error(`download returned ${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        await writeAtomic(out, buf);
        written.push("mp4");
      } else if (fmt === "srt") {
        const cues = parseVtt(meta.subtitles ?? "");
        const srt = toSrt(cues);
        await writeAtomic(join(targetDir, `${safeTitle}.srt`), srt);
        written.push("srt");
      } else if (fmt === "md") {
        const cues = parseVtt(meta.subtitles ?? "");
        const md = toMd(cues, title, { endMarker: opts.endMarker });
        await writeAtomic(join(targetDir, `${safeTitle}.md`), md);
        written.push("md");
      }
    } catch (e) {
      failed.push({ format: fmt, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    ok: failed.length === 0,
    slug: opts.slug,
    title,
    outputDir: targetDir,
    written,
    failed,
    skipped
  };
}
