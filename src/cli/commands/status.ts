import type { StatusResponse } from "../../client/types.js";

// The /status endpoint is vendor-flagged "work in progress" and its live
// payload (drive_id, api_version) does not match its own OpenAPI schema
// ({ status: "ok" }). Reaching any 2xx here means the token authenticated,
// because an invalid token throws a 401 before this formatter runs. So the
// line is always an authenticated confirmation, enriched with whatever
// fields the unstable endpoint happens to return, and never leaks the bare
// JS "undefined" that an absent field would interpolate.
export function formatStatus(r: StatusResponse | undefined): string {
  const parts: string[] = [];
  if (r?.status) parts.push(`status ${r.status}`);
  if (r?.drive_id) parts.push(`drive ${r.drive_id}`);
  if (r?.api_version) parts.push(`API ${r.api_version}`);
  const detail = parts.length ? ` (${parts.join(", ")})` : "";
  return `Authenticated to Descript${detail}.`;
}
