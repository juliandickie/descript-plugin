export type JobState = "queued" | "running" | "stopped" | "cancelled";
export type JobType = "import/project_media" | "agent" | "publish";

export interface ApiErrorBody {
  error: string;
  message: string;
}

export interface UrlImportItem {
  url: string;
  language?: string;
}
export interface DirectUploadItem {
  content_type: string;
  file_size: number;
  language?: string;
}
export interface MultitrackItem {
  tracks: Array<{ media: string; offset?: number }>;
}
export type ImportMediaItem = UrlImportItem | DirectUploadItem | MultitrackItem;

export interface ImportComposition {
  name?: string;
  width?: number;
  height?: number;
  fps?: number;
  clips?: Array<{ media: string }>;
}

export interface ImportRequest {
  project_id?: string;
  project_name?: string;
  team_access?: "edit" | "comment" | "view" | "none";
  folder_name?: string;
  add_media: Record<string, ImportMediaItem>;
  add_compositions?: ImportComposition[];
  callback_url?: string;
}

export interface AgentRequest {
  project_id?: string;
  project_name?: string;
  composition_id?: string;
  model?: string;
  prompt: string;
  team_access?: "edit" | "comment" | "view" | "none";
  callback_url?: string;
}

export interface PublishRequest {
  project_id: string;
  composition_id?: string;
  media_type?: "Video" | "Audio";
  resolution?: "480p" | "720p" | "1080p" | "1440p" | "4K";
  access_level?: "public" | "unlisted" | "drive" | "private";
  callback_url?: string;
}

export interface UploadUrlEntry {
  upload_url: string;
  asset_id: string;
  artifact_id: string;
}

export interface SubmitJobResponse {
  job_id: string;
  drive_id: string;
  project_id: string;
  project_url: string;
  upload_urls?: Record<string, UploadUrlEntry>;
}

export interface ImportSuccessResult {
  status: "success" | "partial";
  media_status: Record<string, { status: "success" | "failed"; duration_seconds?: number; error_message?: string }>;
  media_seconds_used: number;
  created_compositions?: Array<{ id: string; name: string }>;
}
export interface ImportErrorResult {
  status: "error";
  error_message: string;
  error_code?: string;
}
export interface AgentSuccessResult {
  status: "success";
  agent_response: string;
  project_changed: boolean;
  media_seconds_used?: number;
  ai_credits_used?: number;
}
export interface AgentErrorResult {
  status: "error";
  error_message: string;
  error_code?: string;
}
export interface PublishSuccessResult {
  status: "success";
  composition_id: string;
  share_url: string;
  download_url?: string;
  download_url_expires_at?: string;
}
export interface PublishErrorResult {
  status: "error";
  error_message: string;
}

export interface JobProgress {
  label: string;
  percent?: number;
  last_update_at?: string;
  composition_id?: string;
  share_url?: string;
}

interface JobStatusBase {
  job_id: string;
  job_state: JobState;
  created_at: string;
  stopped_at?: string;
  drive_id: string;
  project_id: string;
  project_url: string;
  progress?: JobProgress;
}
export interface ImportJobStatus extends JobStatusBase {
  job_type: "import/project_media";
  result?: ImportSuccessResult | ImportErrorResult;
}
export interface AgentJobStatus extends JobStatusBase {
  job_type: "agent";
  result?: AgentSuccessResult | AgentErrorResult;
}
export interface PublishJobStatus extends JobStatusBase {
  job_type: "publish";
  result?: PublishSuccessResult | PublishErrorResult;
}
export type JobStatus = ImportJobStatus | AgentJobStatus | PublishJobStatus;

export interface Pagination {
  next_cursor?: string;
}
export interface ListJobsResponse {
  data: JobStatus[];
  pagination: Pagination;
}
export interface ListJobsQuery {
  project_id?: string;
  /** API-defined filter: the GET /jobs endpoint does not accept "publish" (unlike JobType). See docs/descript-openapi.json. */
  type?: "import/project_media" | "agent";
  cursor?: string;
  limit?: number;
  created_after?: string;
  created_before?: string;
}
export interface ProjectSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  folder_path?: string;
}
export interface ListProjectsResponse {
  data: ProjectSummary[];
  pagination: Pagination;
}
export interface ProjectDetail {
  id: string;
  name: string;
  drive_id: string;
  created_at: string;
  updated_at: string;
  folder_path?: string;
  media_files: Record<string, { type: "audio" | "video" | "image" | "sequence" | "other"; duration?: number }>;
  compositions: Array<{ id: string; name: string; duration?: number; media_type?: string }>;
}
// The live /status endpoint is vendor-flagged "work in progress": its actual
// payload is { drive_id, api_version } while its OpenAPI schema documents
// { status: "ok" }, and a 204/empty 2xx is also possible. All fields are
// therefore optional to reflect the unstable contract.
export interface StatusResponse {
  status?: "ok";
  drive_id?: string;
  api_version?: string;
}
export interface PublishedProjectMetadata {
  download_url?: string;
  download_url_expires_at?: string;
  project_id: string;
  publish_type: "audio" | "video" | "audiogram";
  privacy: "public" | "unlisted" | "private" | "drive" | "password";
  metadata: {
    title?: string;
    duration_seconds?: number;
    duration_formatted?: string;
    published_at?: string;
    published_by?: { first_name?: string; last_name?: string };
  };
  subtitles: string;
}
export interface EditInDescriptBody {
  partner_drive_id: string;
  project_schema: {
    schema_version: string;
    source_id?: string;
    files: Array<{ name?: string; uri: string; start_offset?: { seconds: number } }>;
  };
}
export interface EditInDescriptResponse {
  url?: string;
}
