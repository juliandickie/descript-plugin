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
import { sanitize } from "../../workflows/filenameSanitize.js";
import { validateRequestedFormatsAgainstReport, reconstructResumeItems, buildResumeReport } from "../../workflows/exportResume.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
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
// NOTE: "publish" is intentionally absent - the GET /jobs endpoint does not accept it.
const JOB_TYPE = ["import/project_media", "agent"];
const PROJECT_SORT = ["name", "created_at", "updated_at", "last_viewed_at"];
const PROJECT_DIRECTION = ["asc", "desc"];
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
    // Reject empty result. An empty --formats or whitespace-only value would
    // otherwise run the batch with zero formats and write nothing silently
    // (per v0.3.0 followup §2.4).
    if (out.length === 0) {
        fail(ctx.io, `--formats must include at least one of: ${FORMAT_VALUES.join(", ")}`);
        return null;
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
        const folderName = typeof ctx.flags.folder === "string" ? ctx.flags.folder : undefined;
        const language = typeof ctx.flags.language === "string" ? ctx.flags.language : undefined;
        const projectId = typeof ctx.flags["project-id"] === "string" ? ctx.flags["project-id"] : undefined;
        const extra = { ...(callbackUrl ? { callback_url: callbackUrl } : {}), ...(teamAccess ? { team_access: teamAccess } : {}), ...(folderName ? { folder_name: folderName } : {}) };
        const mediaJson = typeof ctx.flags.media === "string" ? ctx.flags.media : undefined;
        const file = typeof ctx.flags.file === "string" ? ctx.flags.file : undefined;
        const url = typeof ctx.flags.url === "string" ? ctx.flags.url : undefined;
        if (projectId) {
            // Importing into an existing project: no project_name, no add_compositions.
            if (!mediaJson && !url) {
                fail(ctx.io, "Provide --url or --media <json> when using --project-id");
                return 2;
            }
            let addMedia;
            if (mediaJson) {
                try {
                    addMedia = JSON.parse(mediaJson);
                }
                catch {
                    fail(ctx.io, "--media must be valid JSON (an add_media map)");
                    return 2;
                }
            }
            else {
                const mediaItem = language ? { url: url, language } : { url: url };
                addMedia = { "media.0": mediaItem };
            }
            const req = { project_id: projectId, add_media: addMedia, ...extra };
            if (noWait(ctx)) {
                const s = await c.importProjectMedia(req);
                emit(ctx.io, `Submitted ${s.job_id}`, s);
                return 0;
            }
            const out = await importAndWait(c, req);
            emit(ctx.io, out.ok ? `Imported into ${out.projectUrl}` : `Import failed: ${out.error}`, out);
            return out.ok ? 0 : 4;
        }
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
        const urlMediaItem = language ? { url: url, language } : { url: url };
        const req = { project_name: name, add_media: { "media.0": urlMediaItem }, add_compositions: [{ name, clips: [{ media: "media.0" }] }], ...extra };
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
            if (badEnum(ctx, "type", JOB_TYPE))
                return 2;
            const limitRaw = ctx.flags.limit;
            let limit;
            if (limitRaw !== undefined) {
                const n = Number(limitRaw);
                if (!Number.isInteger(n) || n < 1 || n > 100) {
                    fail(ctx.io, "--limit must be an integer between 1 and 100");
                    return 2;
                }
                limit = n;
            }
            const query = {
                project_id: typeof ctx.flags["project-id"] === "string" ? ctx.flags["project-id"] : undefined,
                type: typeof ctx.flags.type === "string" ? ctx.flags.type : undefined,
                created_after: typeof ctx.flags["created-after"] === "string" ? ctx.flags["created-after"] : undefined,
                created_before: typeof ctx.flags["created-before"] === "string" ? ctx.flags["created-before"] : undefined,
                limit,
                cursor: typeof ctx.flags.cursor === "string" ? ctx.flags.cursor : undefined,
            };
            const r = await c.listJobs(query);
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
            if (badEnum(ctx, "sort", PROJECT_SORT))
                return 2;
            if (badEnum(ctx, "direction", PROJECT_DIRECTION))
                return 2;
            const rawLimit = ctx.flags["limit"];
            let limit;
            if (rawLimit !== undefined) {
                const n = Number(rawLimit);
                if (!Number.isInteger(n) || n < 1 || n > 100) {
                    fail(ctx.io, "--limit must be an integer between 1 and 100");
                    return 2;
                }
                limit = n;
            }
            const query = {
                name: typeof ctx.flags["name"] === "string" ? ctx.flags["name"] : undefined,
                folder_path: typeof ctx.flags["folder-path"] === "string" ? ctx.flags["folder-path"] : undefined,
                created_by: typeof ctx.flags["created-by"] === "string" ? ctx.flags["created-by"] : undefined,
                created_after: typeof ctx.flags["created-after"] === "string" ? ctx.flags["created-after"] : undefined,
                created_before: typeof ctx.flags["created-before"] === "string" ? ctx.flags["created-before"] : undefined,
                updated_after: typeof ctx.flags["updated-after"] === "string" ? ctx.flags["updated-after"] : undefined,
                updated_before: typeof ctx.flags["updated-before"] === "string" ? ctx.flags["updated-before"] : undefined,
                sort: typeof ctx.flags["sort"] === "string" ? ctx.flags["sort"] : undefined,
                direction: typeof ctx.flags["direction"] === "string" ? ctx.flags["direction"] : undefined,
                limit,
                cursor: typeof ctx.flags["cursor"] === "string" ? ctx.flags["cursor"] : undefined,
            };
            const r = await c.listProjects(query);
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
        const concurrency = parseConcurrency(ctx, typeof ctx.flags.concurrency === "string" ? ctx.flags.concurrency : undefined, 5);
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
    async export(ctx) {
        const c = client(ctx);
        const formats = parseFormats(ctx, typeof ctx.flags.formats === "string" ? ctx.flags.formats : undefined, ["mp4", "srt", "md"]);
        if (formats === null)
            return 2;
        const concurrency = parseConcurrency(ctx, typeof ctx.flags.concurrency === "string" ? ctx.flags.concurrency : undefined, 5);
        if (concurrency === null)
            return 2;
        if (badEnum(ctx, "media-type", MEDIA_TYPE))
            return 2;
        if (badEnum(ctx, "resolution", RESOLUTION))
            return 2;
        if (badEnum(ctx, "access-level", ACCESS_LEVEL))
            return 2;
        const outputDir = typeof ctx.flags["output-dir"] === "string" ? ctx.flags["output-dir"] : ".";
        const endMarker = ctx.flags["no-end-marker"] !== true;
        const mediaType = ctx.flags["media-type"] ?? "Video";
        const resolution = ctx.flags.resolution ?? "1080p";
        const accessLevel = ctx.flags["access-level"] ?? "private";
        // Three scope modes - positional <project-id> (single or whole-project),
        // --projects (multi-project), or --resume (replay a prior export).
        const positionalPid = ctx.args[0];
        const positionalCid = ctx.args[1];
        const projectsFlag = typeof ctx.flags.projects === "string" ? ctx.flags.projects : undefined;
        const compositionIdsFlag = typeof ctx.flags["composition-ids"] === "string" ? ctx.flags["composition-ids"] : undefined;
        const resumeFlag = typeof ctx.flags.resume === "string" ? ctx.flags.resume : undefined;
        const userPassedFormats = typeof ctx.flags.formats === "string";
        // Scope mutex - exactly one of {positional PID, --projects, --resume}
        const scopeCount = (positionalPid ? 1 : 0) + (projectsFlag ? 1 : 0) + (resumeFlag ? 1 : 0);
        if (scopeCount === 0) {
            fail(ctx.io, "Usage: descript export <project-id> [composition-id] | --projects pid1,pid2 | --resume <path>");
            return 2;
        }
        if (scopeCount > 1) {
            fail(ctx.io, "Only one of <project-id>, --projects, --resume may be specified");
            return 2;
        }
        // --resume path runs a distinct flow per docs/specs/2026-05-21-export-resume-design.md.
        if (resumeFlag) {
            if (compositionIdsFlag) {
                fail(ctx.io, "--resume cannot be combined with --composition-ids");
                return 2;
            }
            const raw = readJsonFile(ctx, resumeFlag);
            if (raw === undefined)
                return 2;
            const prior = raw;
            if (!Array.isArray(prior.items)) {
                fail(ctx.io, `--resume file does not look like an export-report.json (missing items array)`);
                return 2;
            }
            mkdirSync(outputDir, { recursive: true });
            if (prior.items.length === 0) {
                const emptyReport = {
                    schema_version: 1, command: "export", ok: true,
                    resumed_from: resumeFlag, all_skipped: true, items: []
                };
                writeFileSync(join(outputDir, "resume-report.json"), JSON.stringify(emptyReport, null, 2) + "\n");
                emit(ctx.io, `--resume file has no items to resume`, emptyReport);
                return 0;
            }
            // Parse-time format-disjoint check per spec semantics table.
            const validation = validateRequestedFormatsAgainstReport(prior, userPassedFormats ? formats : undefined);
            if (!validation.ok) {
                fail(ctx.io, validation.reason);
                return 2;
            }
            const reconstructed = reconstructResumeItems(prior, userPassedFormats ? formats : undefined);
            let batchItems = [];
            if (!reconstructed.allSkipped) {
                const batchReport = await exportBatch(c, {
                    items: reconstructed.itemsToRun,
                    outputDir,
                    formats: reconstructed.effectiveFormats,
                    endMarker,
                    concurrency,
                    command: "export",
                    publish: { mediaType, resolution, accessLevel },
                    writeReport: false
                });
                batchItems = batchReport.items;
            }
            const resumeReport = buildResumeReport(resumeFlag, batchItems, reconstructed.alreadyHandled, reconstructed.allSkipped);
            writeFileSync(join(outputDir, "resume-report.json"), JSON.stringify(resumeReport, null, 2) + "\n");
            emit(ctx.io, reconstructed.allSkipped
                ? `Resume complete - all ${prior.items.length} item(s) already done`
                : `Resumed ${batchItems.filter((i) => i.ok).length}/${batchItems.length} item(s), ${reconstructed.alreadyHandled.length} already-complete`, resumeReport);
            return resumeReport.ok ? 0 : 4;
        }
        if (projectsFlag && compositionIdsFlag) {
            fail(ctx.io, "--composition-ids is only valid with the <project-id> form, not --projects");
            return 2;
        }
        let items = [];
        if (positionalPid && positionalCid) {
            items = [{ projectId: positionalPid, compositionId: positionalCid }];
        }
        else if (positionalPid) {
            // PID-only: list project compositions, optionally narrow via --composition-ids.
            const project = await c.getProject(positionalPid);
            const allComps = project.compositions ?? [];
            let chosen = allComps;
            if (compositionIdsFlag) {
                const requested = new Set(compositionIdsFlag.split(",").map((s) => s.trim()).filter(Boolean));
                chosen = allComps.filter((cc) => requested.has(cc.id));
                if (chosen.length === 0) {
                    fail(ctx.io, `--composition-ids matched nothing in project ${positionalPid}`);
                    return 2;
                }
            }
            items = chosen.map((cc) => ({ projectId: positionalPid, compositionId: cc.id }));
        }
        else if (projectsFlag) {
            // Multi-project: list each project's comps, label with project folder.
            const pids = projectsFlag.split(",").map((s) => s.trim()).filter(Boolean);
            if (pids.length === 0) {
                fail(ctx.io, "--projects must be a non-empty comma-separated list");
                return 2;
            }
            for (const pid of pids) {
                const project = await c.getProject(pid);
                const folder = sanitize(project.name ?? pid);
                for (const cc of project.compositions ?? []) {
                    items.push({ projectId: pid, compositionId: cc.id, projectFolder: folder });
                }
            }
        }
        if (items.length === 0) {
            fail(ctx.io, "no compositions to export");
            return 2;
        }
        const report = await exportBatch(c, {
            items, outputDir, formats, endMarker, concurrency,
            command: "export",
            publish: { mediaType, resolution, accessLevel }
        });
        emit(ctx.io, `Exported ${report.items.filter((i) => i.ok).length}/${report.items.length} item(s)`, report);
        return report.ok ? 0 : 4;
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
