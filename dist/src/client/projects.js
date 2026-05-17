export function listProjects(http, query = {}) {
    return http.request("GET", "/projects", {
        query: { cursor: query.cursor, limit: query.limit }
    });
}
export function getProject(http, projectId) {
    return http.request("GET", `/projects/${encodeURIComponent(projectId)}`);
}
