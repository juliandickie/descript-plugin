// Name-template rendering for `descript export --names / --name-template`.
//
// Implements the iDD course production filename standard (locked 2026-08-28):
//   [Course Acronym] - [CC] - [LL] - [CODE Simplified Language Name] - [Lesson Name].ext
// The template engine itself is generic; the standard lives in the default
// template plus the languageNames vocabulary.
//
// Pure logic - no I/O. The CLI layer loads the manifest file, runs the
// pre-flight across all items BEFORE any publish is submitted (publishes are
// risk-bearing), and threads the rendered base names into exportBatch.

import { sanitize } from "./filenameSanitize.js";
import { segmentForCode, unknownCodeHint } from "./languageNames.js";

/** The iDD standard's language-file template. */
export const DEFAULT_NAME_TEMPLATE = "{acronym} - {cc} - {ll} - {lang} - {lesson}";

/** Vimeo's filename cap. Names over this WARN (never auto-trim - trimming the lesson name is an operator decision per the standard). */
export const VIMEO_NAME_CAP = 128;

/** Reserved manifest keys that are not template fields. */
const RESERVED_KEYS = new Set(["template", "languages"]);

export interface NamingManifest {
  /** Template string; `--name-template` overrides it; defaults to DEFAULT_NAME_TEMPLATE. */
  template: string;
  /** Static template fields ({acronym}, {cc}, {ll}, {lesson}, ...). */
  fields: Record<string, string>;
  /** composition id -> canonical language code (fr-CA, es-419, en, ...). */
  languages: Record<string, string>;
}

/**
 * Validate and normalize the parsed --names JSON. Throws Error with a
 * user-facing message on shape problems.
 */
export function parseNamingManifest(raw: unknown, templateOverride?: string): NamingManifest {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("--names file must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (RESERVED_KEYS.has(key)) continue;
    if (typeof value !== "string") {
      throw new Error(`--names field "${key}" must be a string (template fields are strings; use "languages" for the composition map)`);
    }
    fields[key] = value;
  }
  let languages: Record<string, string> = {};
  if (obj.languages !== undefined) {
    if (obj.languages === null || typeof obj.languages !== "object" || Array.isArray(obj.languages)) {
      throw new Error(`--names "languages" must be an object mapping composition id -> language code`);
    }
    for (const [cid, code] of Object.entries(obj.languages as Record<string, unknown>)) {
      if (typeof code !== "string" || code.trim() === "") {
        throw new Error(`--names languages["${cid}"] must be a non-empty language code string`);
      }
      languages[cid] = code;
    }
  }
  if (obj.template !== undefined && typeof obj.template !== "string") {
    throw new Error(`--names "template" must be a string`);
  }
  const template = templateOverride ?? (obj.template as string | undefined) ?? DEFAULT_NAME_TEMPLATE;
  return { template, fields, languages };
}

/** Placeholders appearing in a template, without braces. */
export function templatePlaceholders(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/\{([^{}]+)\}/g)) out.push(m[1]!);
  return out;
}

export interface RenderItemInput {
  compositionId: string;
  /** Raw composition title from the API (may be undefined in direct pid+cid mode until fetched). */
  title?: string;
}

export interface RenderedName {
  compositionId: string;
  /** Sanitized final base name (no extension). */
  name: string;
  /** True when the rendered name exceeds VIMEO_NAME_CAP characters. */
  over128: boolean;
}

export interface RenderBatchOutcome {
  ok: boolean;
  /** One entry per item when ok; empty on failure. */
  names: RenderedName[];
  /** Every problem found (so the operator fixes the manifest once); empty when ok. */
  errors: string[];
}

/**
 * Render and validate names for a whole batch. Fails loud with EVERY problem
 * (missing languages, unknown codes, missing fields, unsupported
 * placeholders, duplicate rendered names) rather than the first one, and
 * must be called before any publish is submitted.
 */
export function renderBatchNames(
  manifest: NamingManifest,
  items: RenderItemInput[]
): RenderBatchOutcome {
  const errors: string[] = [];
  const placeholders = templatePlaceholders(manifest.template);

  if (placeholders.length === 0) {
    errors.push(`template "${manifest.template}" contains no {placeholders}, every file would get the same name`);
  }
  if (placeholders.includes("slug")) {
    errors.push(`{slug} is not available in export mode (the slug does not exist until after publish; naming is validated before any publish is submitted)`);
  }

  const usesLang = placeholders.includes("lang");
  const knownBuiltins = new Set(["lang", "title", "id"]);
  for (const p of placeholders) {
    if (p === "slug") continue; // already reported above
    if (!knownBuiltins.has(p) && manifest.fields[p] === undefined) {
      errors.push(`template references {${p}} but the --names file has no "${p}" field`);
    }
  }

  // Resolve per-item language segments up front.
  const segments = new Map<string, string>();
  if (usesLang) {
    for (const item of items) {
      const code = manifest.languages[item.compositionId];
      if (code === undefined) {
        errors.push(`no language mapped for composition ${item.compositionId} in the --names "languages" map`);
        continue;
      }
      const segment = segmentForCode(code);
      if (segment === undefined) {
        errors.push(`unknown language code "${code}" for composition ${item.compositionId} - ${unknownCodeHint(code)}`);
        continue;
      }
      segments.set(item.compositionId, segment);
    }
  }

  if (errors.length > 0) return { ok: false, names: [], errors };

  const names: RenderedName[] = [];
  const seen = new Map<string, string>(); // rendered name -> first compositionId
  for (const item of items) {
    const rendered = manifest.template.replace(/\{([^{}]+)\}/g, (_m, p: string) => {
      if (p === "lang") return segments.get(item.compositionId) ?? "";
      if (p === "title") return item.title ?? "";
      if (p === "id") return item.compositionId;
      return manifest.fields[p] ?? "";
    });
    const name = sanitize(rendered);
    const holder = seen.get(name);
    if (holder !== undefined) {
      errors.push(`compositions ${holder} and ${item.compositionId} both render to "${name}" - names must be unique (check the languages map)`);
      continue;
    }
    seen.set(name, item.compositionId);
    names.push({ compositionId: item.compositionId, name, over128: name.length > VIMEO_NAME_CAP });
  }

  if (errors.length > 0) return { ok: false, names: [], errors };
  return { ok: true, names, errors: [] };
}
