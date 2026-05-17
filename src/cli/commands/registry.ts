import { DescriptClient } from "../../client/index.js";
import { DescriptApiError } from "../../client/errors.js";
import { resolveCredentials } from "../../config/credentials.js";
import { importAndWait } from "../../workflows/importAndWait.js";
import { editAndWait } from "../../workflows/editAndWait.js";
import { publishAndWait } from "../../workflows/publishAndWait.js";
import { directUpload } from "../../workflows/upload.js";
import { parseManifest, planBatch, runBatch } from "../../workflows/batch.js";
import { readFileSync } from "node:fs";
import type { IO } from "../output.js";
import { emit, fail } from "../output.js";
import { configSet, configList } from "./config.js";

export interface Ctx {
  args: string[];
  flags: Record<string, string | boolean>;
  env: Record<string, string | undefined>;
  io: IO;
}

function client(ctx: Ctx): DescriptClient {
  const creds = resolveCredentials({
    flagToken: typeof ctx.flags.token === "string" ? ctx.flags.token : undefined,
    profile: typeof ctx.flags.profile === "string" ? ctx.flags.profile : undefined,
    env: ctx.env
  });
  return new DescriptClient({ token: creds.token });
}

const noWait = (ctx: Ctx) => ctx.flags["no-wait"] === true;

export const COMMANDS: Record<string, (ctx: Ctx) => Promise<number>> = {
  async status(ctx) {
    const r = await client(ctx).getStatus();
    emit(ctx.io, `Descript API status: ${r.status}`, r);
    return 0;
  },

  async config(ctx) {
    const sub = ctx.args[0];
    if (sub === "set") return configSet({ flags: ctx.flags, io: ctx.io });
    if (sub === "list") return configList({ flags: ctx.flags, io: ctx.io });
    fail(ctx.io, "Usage: descript config set|list [--profile name] [--token value]");
    return 2;
  },

  async import(ctx) {
    const c = client(ctx);
    const name = String(ctx.flags.name ?? "API Import");
    const file = typeof ctx.flags.file === "string" ? ctx.flags.file : undefined;
    const url = typeof ctx.flags.url === "string" ? ctx.flags.url : undefined;
    if (!file && !url) { fail(ctx.io, "Provide --url or --file"); return 2; }

    if (file) {
      const submit = await directUpload(c, {
        mediaRef: "upload.media",
        filePath: file,
        contentType: String(ctx.flags["content-type"] ?? "video/mp4"),
        request: { project_name: name, add_media: {}, add_compositions: [{ name, clips: [{ media: "upload.media" }] }] }
      });
      if (noWait(ctx)) { emit(ctx.io, `Submitted import job ${submit.job_id}`, submit); return 0; }
      const out = await importAndWait(c, { project_id: submit.project_id, add_media: {} });
      emit(ctx.io, out.ok ? `Imported into ${out.projectUrl}` : `Import failed: ${out.error}`, out);
      return out.ok ? 0 : 4;
    }
    const req = { project_name: name, add_media: { "media.0": { url: url! } }, add_compositions: [{ name, clips: [{ media: "media.0" }] }] };
    if (noWait(ctx)) { const s = await c.importProjectMedia(req); emit(ctx.io, `Submitted ${s.job_id}`, s); return 0; }
    const out = await importAndWait(c, req);
    emit(ctx.io, out.ok ? `Imported into ${out.projectUrl}` : `Import failed: ${out.error}`, out);
    return out.ok ? 0 : 4;
  },

  async agent(ctx) {
    const c = client(ctx);
    const prompt = String(ctx.flags.prompt ?? "");
    if (!prompt) { fail(ctx.io, "Provide --prompt"); return 2; }
    const req = {
      project_id: typeof ctx.flags["project-id"] === "string" ? ctx.flags["project-id"] : undefined,
      project_name: typeof ctx.flags["project-name"] === "string" ? ctx.flags["project-name"] : undefined,
      composition_id: typeof ctx.flags["composition-id"] === "string" ? ctx.flags["composition-id"] : undefined,
      model: typeof ctx.flags.model === "string" ? ctx.flags.model : undefined,
      prompt
    };
    if (noWait(ctx)) { const s = await c.agentEditJob(req); emit(ctx.io, `Submitted ${s.job_id}`, s); return 0; }
    const out = await editAndWait(c, req);
    emit(ctx.io,
      out.ok ? `Agent: ${out.agentResponse} (credits: ${out.aiCreditsUsed ?? 0}, seconds: ${out.mediaSecondsUsed ?? 0})`
             : `Agent failed: ${out.error}`,
      out);
    return out.ok ? 0 : 4;
  },

  async publish(ctx) {
    const c = client(ctx);
    const projectId = typeof ctx.flags["project-id"] === "string" ? ctx.flags["project-id"] : "";
    if (!projectId) { fail(ctx.io, "Provide --project-id"); return 2; }
    const req = {
      project_id: projectId,
      composition_id: typeof ctx.flags["composition-id"] === "string" ? ctx.flags["composition-id"] : undefined,
      media_type: (ctx.flags["media-type"] as "Video" | "Audio") || undefined,
      resolution: (ctx.flags.resolution as "480p" | "720p" | "1080p" | "1440p" | "4K") || undefined,
      access_level: (ctx.flags["access-level"] as "public" | "unlisted" | "drive" | "private") || undefined
    };
    if (noWait(ctx)) { const s = await c.publishJob(req); emit(ctx.io, `Submitted ${s.job_id}`, s); return 0; }
    const out = await publishAndWait(c, req);
    emit(ctx.io, out.ok ? `Published: ${out.shareUrl}` : `Publish failed: ${out.error}`, out);
    return out.ok ? 0 : 4;
  },

  async jobs(ctx) {
    const c = client(ctx);
    const sub = ctx.args[0];
    if (sub === "list") { const r = await c.listJobs(); emit(ctx.io, `${r.data.length} job(s)`, r); return 0; }
    if (sub === "get") { const r = await c.getJob(String(ctx.args[1])); emit(ctx.io, `Job ${r.job_id}: ${r.job_state}`, r); return 0; }
    if (sub === "cancel") { await c.cancelJob(String(ctx.args[1])); emit(ctx.io, `Cancelled ${ctx.args[1]}`, { cancelled: ctx.args[1] }); return 0; }
    fail(ctx.io, "Usage: descript jobs list|get <id>|cancel <id>");
    return 2;
  },

  async projects(ctx) {
    const c = client(ctx);
    const sub = ctx.args[0];
    if (sub === "list") { const r = await c.listProjects(); emit(ctx.io, `${r.data.length} project(s)`, r); return 0; }
    if (sub === "get") { const r = await c.getProject(String(ctx.args[1])); emit(ctx.io, `Project ${r.name}`, r); return 0; }
    fail(ctx.io, "Usage: descript projects list|get <id>");
    return 2;
  },

  async published(ctx) {
    const c = client(ctx);
    const r = await c.getPublishedProjectMetadata(String(ctx.args[1] ?? ctx.args[0]));
    emit(ctx.io, `Published ${r.publish_type} (${r.privacy})`, r);
    return 0;
  },

  async "edit-in-descript"(ctx) {
    const c = client(ctx);
    const schemaPath = typeof ctx.flags.schema === "string" ? ctx.flags.schema : "";
    if (!schemaPath) { fail(ctx.io, "Provide --schema <path to JSON body>"); return 2; }
    const body = JSON.parse(readFileSync(schemaPath, "utf8"));
    const r = await c.postEditInDescriptSchema(body);
    emit(ctx.io, `Import URL: ${r.url}`, r);
    return 0;
  },

  async batch(ctx) {
    const c = client(ctx);
    const sub = ctx.args[0];
    const file = ctx.args[1];
    if (!file) { fail(ctx.io, "Usage: descript batch plan|run <manifest.json> [--confirm]"); return 2; }
    const manifest = parseManifest(JSON.parse(readFileSync(file, "utf8")));
    if (sub === "plan") {
      const plan = planBatch(manifest);
      emit(ctx.io, [plan.summary, ...plan.lines].join("\n"), plan);
      return 0;
    }
    if (sub === "run") {
      if (ctx.flags.confirm !== true) {
        fail(ctx.io, "Refusing to run. Review `descript batch plan` first, then re-run with --confirm.");
        return 2;
      }
      const report = await runBatch(c, manifest, { confirm: true });
      emit(ctx.io, `Batch done: ${report.succeeded} ok, ${report.failed} failed`, report);
      return report.failed === 0 ? 0 : 4;
    }
    fail(ctx.io, "Usage: descript batch plan|run <manifest.json> [--confirm]");
    return 2;
  }
};

export function mapError(io: IO, e: unknown): number {
  if (e instanceof DescriptApiError) {
    fail(io, `${e.message}\nHint: ${e.hint}`, e.body);
    return 3;
  }
  fail(io, e instanceof Error ? e.message : String(e));
  return 1;
}
