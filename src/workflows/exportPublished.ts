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
}

export interface ExportPublishedResult {
  ok: boolean;
  slug: string;
  title: string;
  outputDir: string;
  written: ExportFormat[];
  failed: Array<{ format: ExportFormat; error: string }>;
}

function extensionFromUrl(downloadUrl: string, publishType: string): string {
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
  mkdirSync(targetDir, { recursive: true });

  const written: ExportFormat[] = [];
  const failed: Array<{ format: ExportFormat; error: string }> = [];

  for (const fmt of opts.formats) {
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
    failed
  };
}
