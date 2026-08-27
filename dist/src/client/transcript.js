// Synchronous file-body endpoint - the response IS the transcript in the
// requested format (binary for docx, text otherwise). Free, no job created.
export function exportTranscript(http, req) {
    return http.requestRaw("POST", "/export/transcript", { body: req });
}
