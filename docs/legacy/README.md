# Legacy

Superseded artefacts kept for diffability.

- `descript-openapi-2026-05-20.json` - the OpenAPI baseline the v0.2.x-v0.4.x ladder was built against. Superseded 2026-08-27 by a refreshed `docs/descript-openapi.json` (see `docs/field-reports/2026-08-27-api-drift-audit.md` for the delta).
- `descript-openapi-2026-08-27.json` - the baseline v0.5.0 to v0.7.2 were built against (key-sorted extraction from the old Redoc page). Superseded 2026-09-30 by spec version 1.2, stored byte-identical to https://help.descript.com/developers/openapi.json so the next audit can compare with `cmp` (see `docs/field-reports/2026-09-30-api-and-mcp-capability-audit.md` for the delta).
- `descript-openapi-2026-09-30.json` - the spec 1.2 file v0.8.0 was built against. Superseded 2026-10-23 by a newer file that still says version 1.2 (agent `conversation_id`, search `match=visual` and `moment`), stored byte-identical to https://help.descript.com/developers/openapi.json. Descript changes the spec without bumping `info.version`, so compare content, not the version (see `docs/field-reports/2026-10-23-october-release-search-and-mcp-review.md`).
