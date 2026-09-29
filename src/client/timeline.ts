import type { HttpClient } from "./http.js";
import type { TimelineExportRequest, TimelineExportSubmitResponse } from "./types.js";

// POST /jobs/export/timeline - submits a timeline export job (free, no share page).
// Live-verified 2026-09-29/30 but not yet in the public spec. Unknown fields are
// rejected by the API, so callers send only the fields the user set.
export function exportTimeline(http: HttpClient, req: TimelineExportRequest): Promise<TimelineExportSubmitResponse> {
  return http.request<TimelineExportSubmitResponse>("POST", "/jobs/export/timeline", { body: req });
}

/** A signed-URL download that did not deliver the file. `status` is unset for a network failure. */
export class TimelineDownloadError extends Error {
  readonly url: string;
  readonly status?: number;
  constructor(url: string, message: string, status?: number) {
    super(message);
    this.name = "TimelineDownloadError";
    this.url = url;
    this.status = status;
  }
}

/**
 * Fetches a finished export from its signed storage URL. The URL carries its own
 * authorization, so this is a bare fetch with no headers: the Descript bearer token
 * must never reach the storage host. Returns the bytes untouched (aaf is binary).
 */
export async function downloadTimelineFile(url: string): Promise<Uint8Array> {
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw new TimelineDownloadError(url, `Download failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!resp.ok) throw new TimelineDownloadError(url, `Download failed with HTTP ${resp.status}`, resp.status);
  try {
    return new Uint8Array(await resp.arrayBuffer());
  } catch (e) {
    throw new TimelineDownloadError(url, `Download failed while reading the file: ${e instanceof Error ? e.message : String(e)}`, resp.status);
  }
}
