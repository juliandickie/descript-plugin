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
  /**
   * Optional folder-name arbiter for batch runs. Called with the sanitized
   * title-derived folder name and this item's slug; returns the folder name
   * to use. exportBatch supplies one that suffixes " [<slug>]" when another
   * slug already claimed the name, so identical titles (regional translation
   * variants) cannot silently overwrite each other. Absent = today's behavior.
   */
  claimFolder?: (folder: string, slug: string) => string;
  /**
   * Pre-rendered file base name from `descript export --names` (the iDD
   * naming standard). When set, files write FLAT into outputDir (plus
   * projectFolder) as `<fileBaseName>.<ext>` - no per-title folder and no
   * claimFolder arbitration, because the CLI pre-flight already guarantees
   * batch-wide uniqueness. Already sanitized by the renderer.
   */
  fileBaseName?: string;
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
  /** The base name files were written under when --names was active. Resume prefers this over the sanitized title. */
  renderedName?: string;
  /** True when renderedName exceeds Vimeo's 128-character cap (warn-only, never auto-trimmed). */
  nameOver128?: boolean;
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
  const rawFolderName = sanitize(title);
  // Batch runs may see two slugs publish under the identical sanitized title
  // (regional translation variants guarantee this - field report
  // 2026-08-27-translated-srt-findings.md). claimFolder lets the caller
  // disambiguate before the folder is created; single calls without it keep
  // today's behavior unchanged.
  const folderName = opts.claimFolder ? opts.claimFolder(rawFolderName, opts.slug) : rawFolderName;
  // --names mode: files land flat under a pre-rendered unique base name; the
  // per-title folder (and its collision arbitration) does not apply.
  const baseName = opts.fileBaseName ?? folderName;
  const targetDir = opts.fileBaseName
    ? (opts.projectFolder ? join(opts.outputDir, opts.projectFolder) : opts.outputDir)
    : (opts.projectFolder
      ? join(opts.outputDir, opts.projectFolder, folderName)
      : join(opts.outputDir, folderName));
  const namedExtras = opts.fileBaseName !== undefined
    ? { renderedName: opts.fileBaseName, ...(opts.fileBaseName.length > 128 ? { nameOver128: true as const } : {}) }
    : {};
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
      skipped,
      ...namedExtras
    };
  }

  const written: ExportFormat[] = [];
  const failed: Array<{ format: ExportFormat; error: string }> = [];

  for (const fmt of effectiveFormats) {
    try {
      if (fmt === "mp4") {
        if (!meta.download_url) throw new Error("metadata response has no download_url");
        const ext = extensionFromUrl(meta.download_url, meta.publish_type);
        const out = join(targetDir, `${baseName}${ext}`);
        const res = await fetch(meta.download_url);
        if (!res.ok) throw new Error(`download returned ${res.status}`);
        const buf = new Uint8Array(await res.arrayBuffer());
        await writeAtomic(out, buf);
        written.push("mp4");
      } else if (fmt === "srt") {
        const cues = parseVtt(meta.subtitles ?? "");
        const srt = toSrt(cues);
        await writeAtomic(join(targetDir, `${baseName}.srt`), srt);
        written.push("srt");
      } else if (fmt === "md") {
        const cues = parseVtt(meta.subtitles ?? "");
        const md = toMd(cues, title, { endMarker: opts.endMarker });
        await writeAtomic(join(targetDir, `${baseName}.md`), md);
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
    skipped,
    ...namedExtras
  };
}
