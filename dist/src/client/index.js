import { HttpClient } from "./http.js";
import * as jobs from "./jobs.js";
import * as projects from "./projects.js";
import { getStatus } from "./status.js";
import { getPublishedProjectMetadata } from "./published.js";
import { postEditInDescriptSchema } from "./editInDescript.js";
export class DescriptClient {
    http;
    constructor(opts) {
        this.http = new HttpClient(opts);
    }
    importProjectMedia(req) { return jobs.importProjectMedia(this.http, req); }
    agentEditJob(req) { return jobs.agentEditJob(this.http, req); }
    publishJob(req) { return jobs.publishJob(this.http, req); }
    listJobs(query) { return jobs.listJobs(this.http, query); }
    getJob(jobId) { return jobs.getJob(this.http, jobId); }
    cancelJob(jobId) { return jobs.cancelJob(this.http, jobId); }
    listProjects(query) { return projects.listProjects(this.http, query); }
    getProject(projectId) { return projects.getProject(this.http, projectId); }
    getStatus() { return getStatus(this.http); }
    getPublishedProjectMetadata(slug) { return getPublishedProjectMetadata(this.http, slug); }
    postEditInDescriptSchema(body) { return postEditInDescriptSchema(this.http, body); }
}
export { HttpClient } from "./http.js";
export { DescriptApiError } from "./errors.js";
export * from "./types.js";
