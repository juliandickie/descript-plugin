import type { HttpClient } from "./http.js";
import type { ListProjectsResponse, ProjectDetail } from "./types.js";

export function listProjects(
  http: HttpClient,
  query: { cursor?: string; limit?: number } = {}
): Promise<ListProjectsResponse> {
  return http.request<ListProjectsResponse>("GET", "/projects", {
    query: { cursor: query.cursor, limit: query.limit }
  });
}

export function getProject(http: HttpClient, projectId: string): Promise<ProjectDetail> {
  return http.request<ProjectDetail>("GET", `/projects/${encodeURIComponent(projectId)}`);
}
