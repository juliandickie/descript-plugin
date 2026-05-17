import type { HttpClient } from "./http.js";
import type { PublishedProjectMetadata } from "./types.js";

export function getPublishedProjectMetadata(
  http: HttpClient,
  slug: string
): Promise<PublishedProjectMetadata> {
  return http.request<PublishedProjectMetadata>(
    "GET",
    `/published_projects/${encodeURIComponent(slug)}`
  );
}
