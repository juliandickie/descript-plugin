import type { StatusResponse } from "../../client/types.js";

// Any 2xx from /status means the token authenticated (an invalid token throws
// 401 before this formatter runs). The endpoint stabilized in the 2026-08-27
// spec refresh - { drive_id, drive_name, api_version } - but every field stays
// optional so a degraded payload never interpolates a bare JS "undefined".
export function formatStatus(r: StatusResponse | undefined): string {
  const parts: string[] = [];
  if (r?.drive_name) parts.push(`drive ${r.drive_name}`);
  if (r?.drive_id) parts.push(`drive_id ${r.drive_id}`);
  if (r?.api_version) parts.push(`API ${r.api_version}`);
  const detail = parts.length ? ` (${parts.join(", ")})` : "";
  return `Authenticated to Descript${detail}.`;
}
