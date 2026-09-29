import type { SearchResult } from "../../client/types.js";

// The id a result is addressed by: project_id for projects and layout packs,
// asset_id for media, folder_id for both folder kinds. Read defensively - this
// is live API data, and a result type added later should still print a line.
function idOf(r: SearchResult): string {
  const rec = r as unknown as Record<string, unknown>;
  const pick = (k: string) => (typeof rec[k] === "string" ? (rec[k] as string) : undefined);
  switch (r.type) {
    case "video":
    case "image":
    case "audio":
      return pick("asset_id") ?? "";
    case "project_folder":
    case "media_library_folder":
      return pick("folder_id") ?? "";
    default:
      return pick("project_id") ?? pick("asset_id") ?? pick("folder_id") ?? "";
  }
}

// Media results also say where the file lives and how long it is,
// for example "(media_library, 185s)". Images carry no duration.
function mediaNote(r: SearchResult): string {
  if (r.type !== "video" && r.type !== "image" && r.type !== "audio") return "";
  const parts: string[] = [];
  if (typeof r.location === "string") parts.push(r.location);
  if (typeof r.duration === "number" && Number.isFinite(r.duration)) parts.push(`${Math.round(r.duration)}s`);
  return parts.length > 0 ? `(${parts.join(", ")})` : "";
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

/**
 * Human output for `descript search`: one line per result, in the order the API
 * ranked them, `<type padded>  <name>  <id>  <url>` plus a media note, then a
 * count line. The type column is padded to the widest type present. Names are
 * collapsed onto one line so a result never spans two. No results is "No results".
 */
export function formatSearch(results: readonly SearchResult[] | undefined): string {
  const list = results ?? [];
  if (list.length === 0) return "No results";
  const width = Math.max(...list.map((r) => String(r.type).length));
  const lines = list.map((r) => {
    const cols = [String(r.type).padEnd(width), oneLine(String(r.name ?? "")), idOf(r), String(r.url ?? ""), mediaNote(r)];
    return cols.filter((c, i) => i === 0 || c !== "").join("  ");
  });
  lines.push(`${list.length} result${list.length === 1 ? "" : "s"}`);
  return lines.join("\n");
}
