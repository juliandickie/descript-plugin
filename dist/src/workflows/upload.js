import { statSync, createReadStream } from "node:fs";
import { basename } from "node:path";
import { Readable } from "node:stream";
// Descript infers the media type from the reference, so it must keep the file's
// extension. Characters outside [A-Za-z0-9._-] become "-".
export function mediaRefForFile(filePath) {
    return basename(filePath).replace(/[^A-Za-z0-9._-]+/g, "-");
}
// The same rule for a URL import: the reference is the last path segment of the URL
// (percent-decoded, query string and fragment ignored), because Descript reads the
// media type from its extension. A segment with no extension of 1 to 5 letters or
// digits, a trailing slash, or a URL that does not parse gives the generic "media.0".
export function mediaRefForUrl(url) {
    let segment;
    try {
        segment = new URL(url).pathname.split("/").pop() ?? "";
    }
    catch {
        return "media.0";
    }
    try {
        segment = decodeURIComponent(segment);
    }
    catch {
        // A malformed escape (a lone "%") is sanitised as it stands.
    }
    const ref = segment.replace(/[^A-Za-z0-9._-]+/g, "-");
    return /\.[A-Za-z0-9]{1,5}$/.test(ref) ? ref : "media.0";
}
export async function directUpload(client, params, submit = (request) => client.importProjectMedia(request)) {
    const size = statSync(params.filePath).size;
    const request = {
        ...params.request,
        add_media: {
            ...params.request.add_media,
            [params.mediaRef]: {
                content_type: params.contentType,
                file_size: size,
                ...(params.language ? { language: params.language } : {})
            }
        }
    };
    const sent = await submit(request);
    const entry = sent.upload_urls?.[params.mediaRef];
    if (!entry) {
        throw new Error(`Import job created but the API returned no signed upload URL for "${params.mediaRef}".`);
    }
    const stream = createReadStream(params.filePath);
    let resp;
    try {
        resp = await fetch(entry.upload_url, {
            method: "PUT",
            headers: { "content-type": "application/octet-stream", "content-length": String(size) },
            body: Readable.toWeb(stream),
            duplex: "half"
        });
    }
    catch (e) {
        stream.destroy();
        throw e;
    }
    if (!resp.ok) {
        stream.destroy();
        throw new Error(`Signed upload PUT failed with HTTP ${resp.status} for "${params.mediaRef}".`);
    }
    return sent;
}
