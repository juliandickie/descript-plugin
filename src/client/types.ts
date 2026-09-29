export type JobState = "queued" | "running" | "stopped" | "cancelled";
/**
 * Every job type GET /jobs accepts as its `type` filter (live-verified 2026-09-30).
 * JobStatus below models the four types this plugin submits and polls (import,
 * agent, publish, export/timeline); a `jobs list --type import/drive_media`
 * response still comes back as JSON, it just is not narrowed by the union.
 */
export type JobType = "import/project_media" | "import/drive_media" | "agent" | "publish" | "export/timeline";

/**
 * Who can open a published composition. `drive` means members of the Drive only.
 * The API accepts all four (live-verified 2026-09-30); the plugin still sends
 * `private` unless the caller names a level.
 */
export type AccessLevel = "public" | "unlisted" | "drive" | "private";

export interface ApiErrorBody {
  error: string;
  message: string;
  /** Validation failures (400) list what was wrong, for example { message: "\"folder_id\" must be a valid GUID", path: ["folder_id"] }. */
  details?: Array<{ message?: string; path?: Array<string | number> }>;
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
  workspace_name?: string;
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
  access_level?: AccessLevel;
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
  drive_name?: string;
  conversation_id?: string;
  resolved_model?: string;
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
  conversation_id?: string;
  resolved_model?: string;
}
export interface AgentErrorResult {
  status: "error";
  error_message: string;
  error_code?: string;
  conversation_id?: string;
  resolved_model?: string;
}
export interface PublishSuccessResult {
  status: "success";
  composition_id: string;
  share_url: string;
  download_url?: string;
  download_url_expires_at?: string;
  media_type?: "Video" | "Audio";
}
export interface PublishErrorResult {
  status: "error";
  error_message: string;
}

/**
 * POST /jobs/export/timeline (live-verified 2026-09-29/30, not yet in the public spec).
 * A stopped, successful job carries a signed storage `download_url` valid for 24 hours.
 */
export interface TimelineExportSuccessResult {
  status: "success";
  composition_id: string;
  file_name: string;
  content_type: string;
  download_url: string;
  download_url_expires_at: string;
}
export interface TimelineExportErrorResult {
  status: "error";
  error_message: string;
  error_code?: string;
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
export interface TimelineExportJobStatus extends JobStatusBase {
  job_type: "export/timeline";
  result?: TimelineExportSuccessResult | TimelineExportErrorResult;
}
export type JobStatus = ImportJobStatus | AgentJobStatus | PublishJobStatus | TimelineExportJobStatus;

export interface Pagination {
  next_cursor?: string;
}
export interface ListJobsResponse {
  data: JobStatus[];
  pagination: Pagination;
}
export interface ListJobsQuery {
  project_id?: string;
  /** GET /jobs accepts exactly the five JobType values (live-verified 2026-09-30); anything else is a 400. */
  type?: JobType;
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
export type ProjectSortField = "name" | "created_at" | "updated_at" | "last_viewed_at";
export type SortDirection = "asc" | "desc";

export interface ListProjectsQuery {
  name?: string;
  folder_path?: string;
  created_by?: string;
  created_after?: string;
  created_before?: string;
  updated_after?: string;
  updated_before?: string;
  sort?: ProjectSortField;
  direction?: SortDirection;
  limit?: number;
  cursor?: string;
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
  publishes?: ProjectPublish[];
}

// Item of ProjectDetail.publishes per the 2026-08-27 spec (all seven fields
// required server-side; share_url is the stable republish-keyed link).
export interface ProjectPublish {
  composition_id: string;
  share_url: string;
  name: string;
  media_type: "video" | "audio" | "audiogram";
  access_level: "public" | "unlisted" | "drive" | "private" | "password";
  published_at: string;
  updated_at: string;
}

export type ModelCostTier = "low" | "medium" | "high";
// NOTE - this endpoint is camelCase on the wire (availableModels, resolvesTo),
// unlike the snake_case used everywhere else. Verified live 2026-08-27.
export interface AgentModel { id: string; cost: ModelCostTier; }
export interface AgentModelAlias { id: string; resolvesTo: string; description?: string; cost: ModelCostTier; }
export interface AgentModelsResponse {
  availableModels: AgentModel[];
  aliases: AgentModelAlias[];
}

// GET /search (spec 1.2, live-verified 2026-09-30). Free and read-only.
export type SearchType = "project" | "video" | "image" | "audio" | "project_folder" | "media_library_folder" | "layout_pack";
export type SearchMatch = "name" | "content";
export type SearchSort = "relevance" | "newest" | "oldest";
export interface SearchQuery {
  /** Search term, must be non-empty. */
  query: string;
  /** Result types to search; each item is sent as its own `type` key. Omit for all types. */
  type?: SearchType[];
  /** `name` matches names, `content` matches transcripts and composition text. Omit for both. */
  match?: SearchMatch[];
  /** User UUIDs; each item is sent as its own `owner` key. Omit for every owner. */
  owner?: string[];
  /** ISO 8601 date (start of that UTC day) or timestamp. */
  updated_after?: string;
  /** ISO 8601 date (end of that UTC day) or timestamp. */
  updated_before?: string;
  /** Defaults to relevance server-side. */
  sort?: SearchSort;
  /** 1-100, defaults to 30 server-side. */
  limit?: number;
}
export interface SearchOwner {
  id: string;
  name: string;
}
interface SearchResultBase {
  name: string;
  /** Link that opens the result in Descript. */
  url: string;
  /** Omitted when the owner is unavailable. */
  owner?: SearchOwner;
  updated_at: string;
}
export interface ProjectSearchResult extends SearchResultBase {
  type: "project";
  project_id: string;
}
export interface LayoutPackSearchResult extends SearchResultBase {
  type: "layout_pack";
  /** The layout pack's own id (the spec names the field project_id). */
  project_id: string;
}
export type SearchMediaLocation = "media_library" | "project" | "brand_studio";
export interface MediaSearchResult extends SearchResultBase {
  type: "video" | "image" | "audio";
  asset_id: string;
  /** Present only when location is `project`. */
  project_id?: string;
  /** Present only when location is `brand_studio`. */
  brand_studio_id?: string;
  location: SearchMediaLocation;
  /** Time-limited signed preview URL for video and image files. */
  thumbnail_url?: string;
  /** Seconds. Omitted for images and files with no duration. */
  duration?: number;
}
export interface ProjectFolderSearchResult extends SearchResultBase {
  type: "project_folder";
  folder_id: string;
}
export interface MediaLibraryFolderSearchResult extends SearchResultBase {
  type: "media_library_folder";
  /** The id a drive media library import takes as `folder_id`. */
  folder_id: string;
  location: "media_library";
}
export type SearchResult =
  | ProjectSearchResult
  | LayoutPackSearchResult
  | MediaSearchResult
  | ProjectFolderSearchResult
  | MediaLibraryFolderSearchResult;
export interface SearchResponse {
  /** Ranked best match first (or by modified time when sort is newest or oldest). */
  results: SearchResult[];
}

export type TranscriptFormat = "txt" | "markdown" | "html" | "rtf" | "docx" | "srt";
export interface TranscriptTimecodeOptions {
  frequency_seconds?: number;
  offset_seconds?: number;
  on_markers?: boolean;
  on_paragraphs?: boolean;
  on_speakers?: boolean;
}
export interface TranscriptExportRequest {
  project_id: string;
  composition_id?: string;
  format: TranscriptFormat;
  include_speaker_labels?: "off" | "changes" | "every_paragraph";
  include_markers?: boolean;
  timecodes?: TranscriptTimecodeOptions;
}
/**
 * Timeline file formats, by the app that opens them: edl (Samplitude EDL, for Reaper and
 * Samplitude), sesx (Adobe Audition), fcp (Final Cut Pro X, FCPXML 1.8), premiere (Premiere Pro
 * XML), davinci_resolve (DaVinci Resolve XML), aaf (Pro Tools and Logic, binary).
 */
export type TimelineFormat = "edl" | "sesx" | "fcp" | "premiere" | "davinci_resolve" | "aaf";
export interface TimelineExportRequest {
  project_id: string;
  format: TimelineFormat;
  /** A UUID, 5-character short id or full project URL. Defaults to the first composition. */
  composition_id?: string;
  /** The API default depends on the format. */
  include_markers?: boolean;
  /** The API rejects this for fcp. */
  create_track_per_file?: boolean;
  /** Default true. The API accepts false only for premiere and davinci_resolve. */
  snap_frame_rates?: boolean;
  /** aaf only. */
  strip_spaces?: boolean;
  callback_url?: string;
}
export interface TimelineExportSubmitResponse {
  job_id: string;
  drive_id: string;
  drive_name: string;
  project_id: string;
  project_url: string;
  format: TimelineFormat;
}

// GET /status stabilized in the 2026-08-27 spec refresh - documented contract is
// { drive_id, drive_name, api_version } (all required server-side). Fields stay
// optional here so an older or degraded payload never throws; any 2xx still
// proves the token authenticated.
export interface StatusResponse {
  drive_id?: string;
  drive_name?: string;
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
