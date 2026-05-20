import { HttpClient, type HttpClientOptions } from "./http.js";
import * as jobs from "./jobs.js";
import * as projects from "./projects.js";
import { getStatus } from "./status.js";
import { getPublishedProjectMetadata } from "./published.js";
import { postEditInDescriptSchema } from "./editInDescript.js";
import type {
  ImportRequest, AgentRequest, PublishRequest, ListJobsQuery, ListProjectsQuery, EditInDescriptBody
} from "./types.js";

export class DescriptClient {
  readonly http: HttpClient;
  constructor(opts: HttpClientOptions) {
    this.http = new HttpClient(opts);
  }
  importProjectMedia(req: ImportRequest) { return jobs.importProjectMedia(this.http, req); }
  agentEditJob(req: AgentRequest) { return jobs.agentEditJob(this.http, req); }
  publishJob(req: PublishRequest) { return jobs.publishJob(this.http, req); }
  listJobs(query?: ListJobsQuery) { return jobs.listJobs(this.http, query); }
  getJob(jobId: string) { return jobs.getJob(this.http, jobId); }
  cancelJob(jobId: string) { return jobs.cancelJob(this.http, jobId); }
  listProjects(query?: ListProjectsQuery) { return projects.listProjects(this.http, query); }
  getProject(projectId: string) { return projects.getProject(this.http, projectId); }
  getStatus() { return getStatus(this.http); }
  getPublishedProjectMetadata(slug: string) { return getPublishedProjectMetadata(this.http, slug); }
  postEditInDescriptSchema(body: EditInDescriptBody) { return postEditInDescriptSchema(this.http, body); }
}

export { HttpClient } from "./http.js";
export { DescriptApiError } from "./errors.js";
export * from "./types.js";
