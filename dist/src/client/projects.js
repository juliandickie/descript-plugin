export function listProjects(http, query = {}) {
    const q = {
        name: query.name,
        folder_path: query.folder_path,
        created_by: query.created_by,
        created_after: query.created_after,
        created_before: query.created_before,
        updated_after: query.updated_after,
        updated_before: query.updated_before,
        sort: query.sort,
        direction: query.direction,
        limit: query.limit,
        cursor: query.cursor,
    };
    return http.request("GET", "/projects", { query: q });
}
export function getProject(http, projectId) {
    return http.request("GET", `/projects/${encodeURIComponent(projectId)}`);
}
