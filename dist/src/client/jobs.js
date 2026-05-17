export function importProjectMedia(http, req) {
    return http.request("POST", "/jobs/import/project_media", { body: req });
}
export function agentEditJob(http, req) {
    return http.request("POST", "/jobs/agent", { body: req });
}
export function publishJob(http, req) {
    return http.request("POST", "/jobs/publish", { body: req });
}
export function listJobs(http, query = {}) {
    return http.request("GET", "/jobs", {
        query: {
            project_id: query.project_id,
            type: query.type,
            cursor: query.cursor,
            limit: query.limit,
            created_after: query.created_after,
            created_before: query.created_before
        }
    });
}
export function getJob(http, jobId) {
    return http.request("GET", `/jobs/${encodeURIComponent(jobId)}`);
}
export function cancelJob(http, jobId) {
    return http.request("DELETE", `/jobs/${encodeURIComponent(jobId)}`);
}
