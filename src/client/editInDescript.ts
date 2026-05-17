import type { HttpClient } from "./http.js";
import type { EditInDescriptBody, EditInDescriptResponse } from "./types.js";

// Partner-gated. Requires separate Descript partner onboarding.
// Without partner access this returns a 403 forbidden error.
export function postEditInDescriptSchema(
  http: HttpClient,
  body: EditInDescriptBody
): Promise<EditInDescriptResponse> {
  return http.request<EditInDescriptResponse>("POST", "/edit_in_descript/schema", { body });
}
