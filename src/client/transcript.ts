import type { HttpClient, RawResponse } from "./http.js";
import type { TranscriptExportRequest } from "./types.js";

// Synchronous file-body endpoint - the response IS the transcript in the
// requested format (binary for docx, text otherwise). Free, no job created.
export function exportTranscript(http: HttpClient, req: TranscriptExportRequest): Promise<RawResponse> {
  return http.requestRaw("POST", "/export/transcript", { body: req });
}
