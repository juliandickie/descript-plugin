import { statSync, createReadStream } from "node:fs";
import { basename } from "node:path";
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

// Descript infers the media type from the reference, so it must keep the file's
// extension. Characters outside [A-Za-z0-9._-] become "-".
export function mediaRefForFile(filePath: string): string {
  return basename(filePath).replace(/[^A-Za-z0-9._-]+/g, "-");
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
  let resp: Response;
  try {
    resp = await fetch(entry.upload_url, {
      method: "PUT",
      headers: { "content-type": "application/octet-stream", "content-length": String(size) },
      body: Readable.toWeb(stream) as ReadableStream,
      duplex: "half"
    } as RequestInit & { duplex: "half" });
  } catch (e) {
    stream.destroy();
    throw e;
  }

  if (!resp.ok) {
    stream.destroy();
    throw new Error(`Signed upload PUT failed with HTTP ${resp.status} for "${params.mediaRef}".`);
  }
  return submit;
}
