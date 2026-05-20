import type { HttpClient } from "./http.js";
import type { ListProjectsQuery, ListProjectsResponse, ProjectDetail } from "./types.js";

export function listProjects(
  http: HttpClient,
  query: ListProjectsQuery = {}
): Promise<ListProjectsResponse> {
  const q: Record<string, string | number | undefined> = {
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
  return http.request<ListProjectsResponse>("GET", "/projects", { query: q });
}

export function getProject(http: HttpClient, projectId: string): Promise<ProjectDetail> {
  return http.request<ProjectDetail>("GET", `/projects/${encodeURIComponent(projectId)}`);
}
