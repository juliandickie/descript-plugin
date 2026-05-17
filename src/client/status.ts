import type { HttpClient } from "./http.js";
import type { StatusResponse } from "./types.js";

export function getStatus(http: HttpClient): Promise<StatusResponse> {
  return http.request<StatusResponse>("GET", "/status");
}
