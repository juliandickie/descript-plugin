import { DescriptClient } from "../../client/index.js";
import { DescriptApiError } from "../../client/errors.js";
import { resolveCredentials } from "../../config/credentials.js";
import { importAndWait, normalizeImportJob } from "../../workflows/importAndWait.js";
import { editAndWait } from "../../workflows/editAndWait.js";
import { pollJob } from "../../workflows/poll.js";
import { publishAndWait } from "../../workflows/publishAndWait.js";
import { directUpload } from "../../workflows/upload.js";
import { parseManifest, planBatch, runBatch } from "../../workflows/batch.js";
import { exportBatch } from "../../workflows/exportBatch.js";
import { readFileSync } from "node:fs";
import { emit, fail } from "../output.js";
import { configSet, configList, configEdit } from "./config.js";
import { formatStatus } from "./status.js";
function client(ctx) {
    const creds = resolveCredentials({
        flagToken: typeof ctx.flags.token === "string" ? ctx.flags.token : undefined,
        profile: typeof ctx.flags.profile === "string" ? ctx.flags.profile : undefined,
        env: ctx.env
    });
    return new DescriptClient({ token: creds.token });
}
const noWait = (ctx) => ctx.flags["no-wait"] === true;
const TEAM_ACCESS = ["edit", "comment", "view", "none"];
const MEDIA_TYPE = ["Video", "Audio"];
const RESOLUTION = ["480p", "720p", "1080p", "1440p", "4K"];
const ACCESS_LEVEL = ["public", "unlisted", "private"];
// Returns true (and emits a usage error) if the flag is present but not an allowed value.
function badEnum(ctx, flag, allowed) {
    const v = ctx.flags[flag];
    if (v === undefined)
        return false;
    if (typeof v === "string" && allowed.includes(v))
        return false;
    fail(ctx.io, `--${flag} must be one of: ${allowed.join(", ")}`);
    return true;
}
// Reads + JSON-parses a file, emitting a clear usage error on any failure.
// Returns undefined on failure (JSON.parse never returns undefined on success).
function readJsonFile(ctx, path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch (e) {
        fail(ctx.io, `Could not read JSON from "${path}": ${e instanceof Error ? e.message : String(e)}`);
        return undefined;
    }
}
const FORMAT_VALUES = ["mp4", "srt", "md"];
function parseFormats(ctx, raw, fallback) {
    if (raw === undefined)
        return fallback;
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    for (const p of parts) {
        if (!FORMAT_VALUES.includes(p)) {
            fail(ctx.io, `--formats must be a comma-separated subset of: ${FORMAT_VALUES.join(", ")} (got "${p}")`);
            return null;
        }
    }
    // Dedup while preserving order
    const seen = new Set();
    const out = [];
    for (const p of parts) {
        if (!seen.has(p)) {
            seen.add(p);
            out.push(p);
        }
    }
    return out;
}
function parseConcurrency(ctx, raw, fallback) {
    if (raw === undefined)
        return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
        fail(ctx.io, `--concurrency must be a positive integer (got "${raw}")`);
        return null;
    }
    return n;
}
export const COMMANDS = {
    async status(ctx) {
        const r = await client(ctx).getStatus();
        emit(ctx.io, formatStatus(r), r);
        return 0;
    },
    async config(ctx) {
        const sub = ctx.args[0];
        const configPath = ctx.env.DESCRIPT_CONFIG_PATH;
        if (sub === "set")
            return configSet({ flags: ctx.flags, io: ctx.io, configPath });
        if (sub === "list")
            return configList({ flags: ctx.flags, io: ctx.io, configPath });
        if (sub === "edit")
            return configEdit({ flags: ctx.flags, io: ctx.io, env: ctx.env, configPath });
        fail(ctx.io, "Usage: descript config set|list|edit [--profile name] [--token value] [--editor cmd]");
        return 2;
    },
    async import(ctx) {
        const c = client(ctx);
        const name = typeof ctx.flags.name === "string" ? ctx.flags.name : "API Import";
        const callbackUrl = typeof ctx.flags["callback-url"] === "string" ? ctx.flags["callback-url"] : undefined;
        if (badEnum(ctx, "team-access", TEAM_ACCESS))
            return 2;
        const teamAccess = typeof ctx.flags["team-access"] === "string" ? ctx.flags["team-access"] : undefined;
        const extra = { ...(callbackUrl ? { callback_url: callbackUrl } : {}), ...(teamAccess ? { team_access: teamAccess } : {}) };
        const mediaJson = typeof ctx.flags.media === "string" ? ctx.flags.media : undefined;
        const file = typeof ctx.flags.file === "string" ? ctx.flags.file : undefined;
        const url = typeof ctx.flags.url === "string" ? ctx.flags.url : undefined;
        if (mediaJson) {
            let addMedia;
            try {
                addMedia = JSON.parse(mediaJson);
            }
            catch {
                fail(ctx.io, "--media must be valid JSON (an add_media map)");
                return 2;
            }
            let addCompositions;
            if (typeof ctx.flags.compositions === "string") {
                try {
                    addCompositions = JSON.parse(ctx.flags.compositions);
                }
                catch {
                    fail(ctx.io, "--compositions must be valid JSON (an array)");
                    return 2;
                }
            }
            const req = { project_name: name, add_media: addMedia, ...(addCompositions ? { add_compositions: addCompositions } : {}), ...extra };
            if (noWait(ctx)) {
                const s = await c.importProjectMedia(req);
                emit(ctx.io, `Submitted ${s.job_id}`, s);
                return 0;
            }
            const out = await importAndWait(c, req);
            emit(ctx.io, out.ok ? `Imported into ${out.projectUrl}` : `Import failed: ${out.error}`, out);
            return out.ok ? 0 : 4;
        }
        if (!file && !url) {
            fail(ctx.io, "Provide --url, --file, or --media <json>");
            return 2;
        }
        if (file) {
            const submit = await directUpload(c, {
                mediaRef: "upload.media",
                filePath: file,
                contentType: typeof ctx.flags["content-type"] === "string" ? ctx.flags["content-type"] : "video/mp4",
                request: { project_name: name, add_media: {}, add_compositions: [{ name, clips: [{ media: "upload.media" }] }], ...extra }
            });
            if (noWait(ctx)) {
                emit(ctx.io, `Submitted import job ${submit.job_id}`, submit);
                return 0;
            }
            const final = await pollJob((id) => c.getJob(id), submit.job_id);
            const out = normalizeImportJob(submit, final);
            emit(ctx.io, out.ok ? `Imported into ${out.projectUrl}` : `Import failed: ${out.error}`, out);
            return out.ok ? 0 : 4;
        }
        const req = { project_name: name, add_media: { "media.0": { url: url } }, add_compositions: [{ name, clips: [{ media: "media.0" }] }], ...extra };
        if (noWait(ctx)) {
            const s = await c.importProjectMedia(req);
            emit(ctx.io, `Submitted ${s.job_id}`, s);
            return 0;
        }
        const out = await importAndWait(c, req);
        emit(ctx.io, out.ok ? `Imported into ${out.projectUrl}` : `Import failed: ${out.error}`, out);
        return out.ok ? 0 : 4;
    },
    async agent(ctx) {
        const c = client(ctx);
        const prompt = typeof ctx.flags.prompt === "string" ? ctx.flags.prompt : "";
        if (!prompt) {
            fail(ctx.io, "Provide --prompt <text> (a non-empty value is required)");
            return 2;
        }
        if (badEnum(ctx, "team-access", TEAM_ACCESS))
            return 2;
        const req = {
            project_id: typeof ctx.flags["project-id"] === "string" ? ctx.flags["project-id"] : undefined,
            project_name: typeof ctx.flags["project-name"] === "string" ? ctx.flags["project-name"] : undefined,
            composition_id: typeof ctx.flags["composition-id"] === "string" ? ctx.flags["composition-id"] : undefined,
            model: typeof ctx.flags.model === "string" ? ctx.flags.model : undefined,
            prompt,
            ...(typeof ctx.flags["callback-url"] === "string" ? { callback_url: ctx.flags["callback-url"] } : {}),
            ...(typeof ctx.flags["team-access"] === "string" ? { team_access: ctx.flags["team-access"] } : {})
        };
        if (noWait(ctx)) {
            const s = await c.agentEditJob(req);
            emit(ctx.io, `Submitted ${s.job_id}`, s);
            return 0;
        }
        const out = await editAndWait(c, req);
        emit(ctx.io, out.ok ? `Agent: ${out.agentResponse} (credits: ${out.aiCreditsUsed ?? 0}, seconds: ${out.mediaSecondsUsed ?? 0})`
            : `Agent failed: ${out.error}`, out);
        return out.ok ? 0 : 4;
    },
    async publish(ctx) {
        const c = client(ctx);
        const projectId = typeof ctx.flags["project-id"] === "string" ? ctx.flags["project-id"] : "";
        if (!projectId) {
            fail(ctx.io, "Provide --project-id");
            return 2;
        }
        if (badEnum(ctx, "media-type", MEDIA_TYPE))
            return 2;
        if (badEnum(ctx, "resolution", RESOLUTION))
            return 2;
        if (badEnum(ctx, "access-level", ACCESS_LEVEL))
            return 2;
        const req = {
            project_id: projectId,
            composition_id: typeof ctx.flags["composition-id"] === "string" ? ctx.flags["composition-id"] : undefined,
            media_type: ctx.flags["media-type"] || undefined,
            resolution: ctx.flags.resolution || undefined,
            access_level: ctx.flags["access-level"] || undefined,
            ...(typeof ctx.flags["callback-url"] === "string" ? { callback_url: ctx.flags["callback-url"] } : {})
        };
        if (noWait(ctx)) {
            const s = await c.publishJob(req);
            emit(ctx.io, `Submitted ${s.job_id}`, s);
            return 0;
        }
        const out = await publishAndWait(c, req);
        emit(ctx.io, out.ok ? `Published: ${out.shareUrl}` : `Publish failed: ${out.error}`, out);
        return out.ok ? 0 : 4;
    },
    async jobs(ctx) {
        const c = client(ctx);
        const sub = ctx.args[0];
        if (sub === "list") {
            const r = await c.listJobs();
            emit(ctx.io, `${r.data.length} job(s)`, r);
            return 0;
        }
        if (sub === "get") {
            const r = await c.getJob(String(ctx.args[1]));
            emit(ctx.io, `Job ${r.job_id}: ${r.job_state}`, r);
            return 0;
        }
        if (sub === "cancel") {
            await c.cancelJob(String(ctx.args[1]));
            emit(ctx.io, `Cancelled ${ctx.args[1]}`, { cancelled: ctx.args[1] });
            return 0;
        }
        fail(ctx.io, "Usage: descript jobs list|get <id>|cancel <id>");
        return 2;
    },
    async projects(ctx) {
        const c = client(ctx);
        const sub = ctx.args[0];
        if (sub === "list") {
            const r = await c.listProjects();
            emit(ctx.io, `${r.data.length} project(s)`, r);
            return 0;
        }
        if (sub === "get") {
            const r = await c.getProject(String(ctx.args[1]));
            emit(ctx.io, `Project ${r.name}`, r);
            return 0;
        }
        fail(ctx.io, "Usage: descript projects list|get <id>");
        return 2;
    },
    async published(ctx) {
        const c = client(ctx);
        const slug = ctx.args[1] ?? ctx.args[0];
        if (!slug) {
            fail(ctx.io, "Usage: descript published <slug>");
            return 2;
        }
        const r = await c.getPublishedProjectMetadata(slug);
        emit(ctx.io, `Published ${r.publish_type} (${r.privacy})`, r);
        return 0;
    },
    async "download-published"(ctx) {
        const c = client(ctx);
        const formats = parseFormats(ctx, typeof ctx.flags.formats === "string" ? ctx.flags.formats : undefined, ["mp4", "srt", "md"]);
        if (formats === null)
            return 2;
        const concurrency = parseConcurrency(ctx, typeof ctx.flags.concurrency === "string" ? ctx.flags.concurrency : undefined, 2);
        if (concurrency === null)
            return 2;
        const outputDir = typeof ctx.flags["output-dir"] === "string" ? ctx.flags["output-dir"] : ".";
        const endMarker = ctx.flags["no-end-marker"] !== true;
        // Resolve slugs.
        let slugs = [];
        const positional = ctx.args[0];
        const slugsFlag = typeof ctx.flags.slugs === "string" ? ctx.flags.slugs : undefined;
        const reportFlag = typeof ctx.flags.report === "string" ? ctx.flags.report : undefined;
        const sourcesUsed = [positional, slugsFlag, reportFlag].filter((v) => v !== undefined).length;
        if (sourcesUsed === 0) {
            fail(ctx.io, "Usage: descript download-published <slug> | --slugs s1,s2 | --report <path>");
            return 2;
        }
        if (sourcesUsed > 1) {
            fail(ctx.io, "Provide exactly one of <slug>, --slugs, or --report");
            return 2;
        }
        if (positional) {
            slugs = [positional];
        }
        else if (slugsFlag) {
            slugs = slugsFlag.split(",").map((s) => s.trim()).filter(Boolean);
            if (slugs.length === 0) {
                fail(ctx.io, "--slugs must be a non-empty comma-separated list");
                return 2;
            }
        }
        else if (reportFlag) {
            const raw = readJsonFile(ctx, reportFlag);
            if (raw === undefined)
                return 2;
            const r = raw;
            if (!Array.isArray(r.items)) {
                fail(ctx.io, `--report file does not look like an export-report.json (missing items array)`);
                return 2;
            }
            slugs = r.items.map((i) => i.slug).filter((s) => typeof s === "string" && s.length > 0);
            if (slugs.length === 0) {
                fail(ctx.io, `--report file contained no slugs`);
                return 2;
            }
        }
        const report = await exportBatch(c, {
            items: slugs.map((slug) => ({ slug })),
            outputDir, formats, endMarker, concurrency,
            command: "download-published"
        });
        emit(ctx.io, `Downloaded ${report.items.filter((i) => i.ok).length}/${report.items.length} item(s)`, report);
        return report.ok ? 0 : 4;
    },
    async "edit-in-descript"(ctx) {
        const c = client(ctx);
        const schemaPath = typeof ctx.flags.schema === "string" ? ctx.flags.schema : "";
        if (!schemaPath) {
            fail(ctx.io, "Provide --schema <path to JSON body>");
            return 2;
        }
        const body = readJsonFile(ctx, schemaPath);
        if (body === undefined)
            return 2;
        const r = await c.postEditInDescriptSchema(body);
        emit(ctx.io, `Import URL: ${r.url}`, r);
        return 0;
    },
    async batch(ctx) {
        const c = client(ctx);
        const sub = ctx.args[0];
        const file = ctx.args[1];
        if (!file) {
            fail(ctx.io, "Usage: descript batch plan|run <manifest.json> [--confirm]");
            return 2;
        }
        const raw = readJsonFile(ctx, file);
        if (raw === undefined)
            return 2;
        let manifest;
        try {
            manifest = parseManifest(raw);
        }
        catch (e) {
            fail(ctx.io, e instanceof Error ? e.message : String(e));
            return 2;
        }
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
export function mapError(io, e) {
    if (e instanceof DescriptApiError) {
        fail(io, `${e.message}\nHint: ${e.hint}`, e.body);
        return 3;
    }
    fail(io, e instanceof Error ? e.message : String(e));
    return 1;
}
