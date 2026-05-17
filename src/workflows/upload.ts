import { statSync, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { DescriptClient } from "../client/index.js";
import type { ImportRequest, SubmitJobResponse } from "../client/types.js";

export interface DirectUploadParams {
  mediaRef: string;
  filePath: string;
  contentType: string;
  language?: string;
  request: ImportRequest;
}

export async function directUpload(
  client: DescriptClient,
  params: DirectUploadParams
): Promise<SubmitJobResponse> {
  const size = statSync(params.filePath).size;

  const request: ImportRequest = {
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
    throw new Error(
      `Import job created but the API returned no signed upload URL for "${params.mediaRef}".`
    );
  }

  const stream = createReadStream(params.filePath);
  const resp = await fetch(entry.upload_url, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream", "content-length": String(size) },
    body: Readable.toWeb(stream) as ReadableStream,
    duplex: "half"
  } as RequestInit & { duplex: "half" });

  if (!resp.ok) {
    throw new Error(`Signed upload PUT failed with HTTP ${resp.status} for "${params.mediaRef}".`);
  }
  return submit;
}
