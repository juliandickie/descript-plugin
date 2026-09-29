import type { HttpClient } from "./http.js";
import type {
  ImportRequest, DriveMediaImportRequest, AgentRequest, PublishRequest,
  SubmitJobResponse, DriveImportSubmitResponse, JobStatus, ListJobsResponse, ListJobsQuery
} from "./types.js";

export function importProjectMedia(http: HttpClient, req: ImportRequest): Promise<SubmitJobResponse> {
  return http.request<SubmitJobResponse>("POST", "/jobs/import/project_media", { body: req });
}

// Imports into the Drive's shared media library instead of a project. Live but not in
// the public spec (validated 2026-09-30).
export function importDriveMedia(http: HttpClient, req: DriveMediaImportRequest): Promise<DriveImportSubmitResponse> {
  return http.request<DriveImportSubmitResponse>("POST", "/jobs/import/drive_media", { body: req });
}

export function agentEditJob(http: HttpClient, req: AgentRequest): Promise<SubmitJobResponse> {
  return http.request<SubmitJobResponse>("POST", "/jobs/agent", { body: req });
}

export function publishJob(http: HttpClient, req: PublishRequest): Promise<SubmitJobResponse> {
  return http.request<SubmitJobResponse>("POST", "/jobs/publish", { body: req });
}

export function listJobs(http: HttpClient, query: ListJobsQuery = {}): Promise<ListJobsResponse> {
  return http.request<ListJobsResponse>("GET", "/jobs", {
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

export function getJob(http: HttpClient, jobId: string): Promise<JobStatus> {
  return http.request<JobStatus>("GET", `/jobs/${encodeURIComponent(jobId)}`);
}

export function cancelJob(http: HttpClient, jobId: string): Promise<void> {
  return http.request<void>("DELETE", `/jobs/${encodeURIComponent(jobId)}`);
}
