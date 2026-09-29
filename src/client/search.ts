import type { HttpClient } from "./http.js";
import type { SearchQuery, SearchResponse } from "./types.js";

// GET /search - free, read-only. type, match and owner are arrays and go out as
// repeated keys (type=project&type=audio); every unset param is omitted.
export function search(http: HttpClient, query: SearchQuery): Promise<SearchResponse> {
  return http.request<SearchResponse>("GET", "/search", {
    query: {
      query: query.query,
      type: query.type,
      match: query.match,
      owner: query.owner,
      updated_after: query.updated_after,
      updated_before: query.updated_before,
      sort: query.sort,
      limit: query.limit
    }
  });
}
