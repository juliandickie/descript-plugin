import { statSync, createReadStream } from "node:fs";
import { Readable } from "node:stream";
export async function directUpload(client, params) {
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
    const submit = await client.importProjectMedia(request);
    const entry = submit.upload_urls?.[params.mediaRef];
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
    return submit;
}
