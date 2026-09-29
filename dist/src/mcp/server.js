import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runCli } from "../cli/index.js";
import { COMMAND_FLAGS, GLOBAL_FLAGS } from "../cli/commands/registry.js";
// The plugin's own version, read from package.json at the plugin root
// (dist/src/mcp/server.js -> ../../../package.json) so it cannot go stale.
function readPluginVersion() {
    try {
        const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "package.json"), "utf8"));
        return typeof pkg.version === "string" ? pkg.version : "unknown";
    }
    catch {
        return "unknown";
    }
}
export const PLUGIN_VERSION = readPluginVersion();
const MCP_GLOBAL_FLAGS = GLOBAL_FLAGS.filter((f) => f !== "json" && f !== "help");
function build(spec) {
    const command = spec.base[0];
    const positionals = spec.positionals ?? [];
    const special = spec.special ?? {};
    const flagNames = [...(COMMAND_FLAGS[command] ?? []), ...MCP_GLOBAL_FLAGS];
    const allowed = [...positionals.map((p) => p.name), ...Object.keys(special), ...flagNames.map((f) => f.replace(/-/g, "_"))];
    return (args) => {
        const out = [...spec.base];
        const seen = new Set();
        const norm = {};
        for (const [k, v] of Object.entries(args)) {
            const key = k.replace(/-/g, "_");
            if (seen.has(key))
                throw new Error(`${spec.tool}: argument "${key}" was given twice (as snake_case and kebab-case)`);
            seen.add(key);
            if (!allowed.includes(key))
                throw new Error(`${spec.tool}: Unknown argument "${k}". Nothing was run. Allowed: ${allowed.join(", ")}`);
            norm[key] = v;
        }
        const absent = (v) => v === undefined || v === null || v === "";
        let gap;
        for (const p of positionals) {
            const v = absent(norm[p.name]) ? p.fallback : norm[p.name];
            if (absent(v)) {
                if (p.required)
                    throw new Error(`${spec.tool}: missing required argument "${p.name}"`);
                gap = gap ?? p.name;
                continue;
            }
            if (gap)
                throw new Error(`${spec.tool}: "${p.name}" needs "${gap}" as well`);
            if (typeof v === "object")
                throw new Error(`${spec.tool}: "${p.name}" must be a string`);
            const text = String(v);
            if (text.startsWith("--"))
                throw new Error(`${spec.tool}: "${p.name}" cannot start with "--"`);
            out.push(text);
        }
        for (const name of spec.required ?? []) {
            if (absent(norm[name]))
                throw new Error(`${spec.tool}: missing required argument "${name}"`);
        }
        const flags = { ...(spec.defaults ?? {}) };
        for (const [key, v] of Object.entries(norm)) {
            if (positionals.some((p) => p.name === key) || key in special)
                continue;
            flags[key.replace(/_/g, "-")] = v;
        }
        for (const [flag, v] of Object.entries(flags)) {
            if (v === true)
                out.push(`--${flag}`);
            else if (v === false || v === undefined || v === null)
                continue;
            // --flag=value keeps values that start with "-" (negative offsets) intact.
            else
                out.push(`--${flag}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
        }
        for (const [key, fn] of Object.entries(special))
            out.push(...fn(norm[key]));
        out.push("--json");
        return out;
    };
}
const TIMECODE_BOOLEANS = {
    on_paragraphs: "--timecodes-on-paragraphs",
    on_speakers: "--timecodes-on-speakers",
    on_markers: "--timecodes-on-markers"
};
const TIMECODE_NUMBERS = {
    frequency_seconds: "--timecodes-every",
    offset_seconds: "--timecodes-offset"
};
// Maps the API-shaped timecodes object onto the CLI's --timecodes-* flags so
// the MCP tool and the CLI share one code path (buildTimecodes in registry.ts).
function timecodeFlags(raw) {
    if (raw === undefined || raw === null)
        return [];
    if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("descript_transcript: timecodes must be an object, for example {\"on_paragraphs\": true}");
    }
    const out = [];
    for (const [k, v] of Object.entries(raw)) {
        if (k in TIMECODE_BOOLEANS) {
            if (typeof v !== "boolean")
                throw new Error(`descript_transcript: timecodes.${k} must be true or false`);
            if (v)
                out.push(TIMECODE_BOOLEANS[k]);
        }
        else if (k in TIMECODE_NUMBERS) {
            if (typeof v !== "number" || !Number.isFinite(v))
                throw new Error(`descript_transcript: timecodes.${k} must be a number of seconds`);
            out.push(`${TIMECODE_NUMBERS[k]}=${v}`);
        }
        else {
            throw new Error(`descript_transcript: Unknown timecodes key "${k}". Allowed: ${[...Object.keys(TIMECODE_BOOLEANS), ...Object.keys(TIMECODE_NUMBERS)].join(", ")}`);
        }
    }
    return out;
}
// descript_search takes type, match and owner as a JSON array of strings or a
// comma-separated string, and hands the CLI its comma-separated flag. The CLI
// validates every element, so this only settles the shape. An empty array or
// empty string means "not set" and adds no flag; anything else non-empty goes
// through, so a stray "," is rejected by the CLI rather than ignored.
function listFlag(tool, arg) {
    return (raw) => {
        if (raw === undefined || raw === null)
            return [];
        const items = Array.isArray(raw) ? raw : [raw];
        if (!items.every((v) => typeof v === "string")) {
            throw new Error(`${tool}: ${arg} must be an array of strings or a comma-separated string`);
        }
        const joined = items.join(",");
        return joined === "" ? [] : [`--${arg}=${joined}`];
    };
}
// descript_timeline's markers is tri-state: true asks for markers (--markers), false
// asks for none (--no-markers), and leaving it out keeps the format's own default.
function markersFlag(raw) {
    if (raw === undefined || raw === null)
        return [];
    if (typeof raw !== "boolean")
        throw new Error("descript_timeline: markers must be true or false (leave it out to use the format's default)");
    return [raw ? "--markers" : "--no-markers"];
}
const STRICT = "Argument names may be snake_case or kebab-case. Unknown arguments are rejected, never ignored.";
export const TOOLS = [
    { name: "descript_status", description: `Check Descript API auth and status. args: profile?. ${STRICT}`,
        argv: build({ tool: "descript_status", base: ["status"] }) },
    { name: "descript_import", description: `Import media (spends media seconds). By default it creates a new project. With project_id it adds to an existing project, and composition_id (with url or file) appends the imported item to the end of that existing composition (a UUID, 5-character short id or project URL); update_compositions (with media) is the raw form, a JSON array of { composition_id, append_clips: [{ media, mute? }] } whose media names keys of media. With library=true it instead imports into the Drive's shared media library, visible to every Drive member and not tied to a project; confirm that destination with the user before calling, and use folder_id (a media library folder UUID from descript_search type=media_library_folder) to pick a folder. args: url | file | media (JSON), name?, folder?, team_access?=edit|comment|view|none (required with folder), language?, workspace?, project_id? (add into an existing project), composition_id? (needs project_id), update_compositions? (JSON array, needs project_id and media), library? (true, new files go to the shared Drive media library; not with name, project_id, workspace, team_access, folder, compositions, composition_id or update_compositions), folder_id? (library only), compositions? (JSON array), content_type?, callback_url?, no_wait?. ${STRICT}`,
        argv: build({ tool: "descript_import", base: ["import"] }) },
    { name: "descript_agent", description: `Run an Underlord agent edit. BILLABLE - spends AI credits; confirm with the user before calling. args: prompt, project_id | project_name, composition_id?, model?, team_access?, callback_url?, no_wait?. ${STRICT}`,
        argv: build({ tool: "descript_agent", base: ["agent"] }) },
    { name: "descript_publish", description: `Publish a composition. args: project_id, composition_id?, media_type?=Video|Audio, resolution?=480p|720p|1080p|1440p|4K, access_level?=private|drive|unlisted|public (default private; drive is visible only to members of the Drive; elevate to drive, unlisted or public only when the user asked for it), drive_default_access? (use the drive's configured default instead), callback_url?, no_wait?. ${STRICT}`,
        argv: build({ tool: "descript_publish", base: ["publish"] }) },
    { name: "descript_jobs", description: `Inspect or cancel jobs. args: sub=list|get|cancel (default list), id (for get and cancel); list filters project_id?, type?=import/project_media|import/drive_media|agent|publish|export/timeline, created_after?, created_before?, limit? (1-100), cursor?. ${STRICT}`,
        argv: build({ tool: "descript_jobs", base: ["jobs"], positionals: [{ name: "sub", fallback: "list" }, { name: "id" }] }) },
    { name: "descript_projects", description: `List or fetch projects. args: sub=list|get (default list), id (for get); list filters name?, folder_path?, created_by?, created_after?, created_before?, updated_after?, updated_before?, sort?=name|created_at|updated_at|last_viewed_at, direction?=asc|desc, limit? (1-100), cursor?. ${STRICT}`,
        argv: build({ tool: "descript_projects", base: ["projects"], positionals: [{ name: "sub", fallback: "list" }, { name: "id" }] }) },
    { name: "descript_published", description: `Get published project metadata. arg: slug. ${STRICT}`,
        argv: build({ tool: "descript_published", base: ["published"], positionals: [{ name: "slug", required: true }] }) },
    { name: "descript_edit_in_descript", description: `Partner-gated import URL exchange. arg: schema (path to a JSON file). ${STRICT}`,
        argv: build({ tool: "descript_edit_in_descript", base: ["edit-in-descript"] }) },
    { name: "descript_batch", description: `Bulk runner. args: sub=plan|run (default plan), file (manifest path), confirm? (required for run). ${STRICT}`,
        argv: build({ tool: "descript_batch", base: ["batch"], positionals: [{ name: "sub", fallback: "plan" }, { name: "file", required: true }] }) },
    { name: "descript_models", description: `List available Underlord agent models and aliases (live catalog). ${STRICT}`,
        argv: build({ tool: "descript_models", base: ["models"] }) },
    { name: "descript_transcript", description: `Export a composition transcript, free and instant, no publish. args: project_id, composition_id?, format=txt|markdown|html|rtf|docx|srt (default txt), out? (file path, missing parent folders are created; required for docx), speaker_labels?=off|changes|every_paragraph, markers?, timecodes? (object, any of on_paragraphs, on_speakers, on_markers as booleans, frequency_seconds, offset_seconds as numbers; adds [HH:MM:SS] marks). ${STRICT}`,
        argv: build({ tool: "descript_transcript", base: ["transcript"],
            positionals: [{ name: "project_id", required: true }, { name: "composition_id" }],
            defaults: { format: "txt" },
            special: { timecodes: timecodeFlags } }) },
    { name: "descript_translate", description: `Translate a composition's captions via Underlord and report which NEW composition carries the requested language (creation-time mapping). BILLABLE - spends AI credits (translate captions ~10 plus agent message credits); confirm with the user before calling. args: project_id, composition_id?, language (e.g. "French (Canada)" - regional variants supported), model?, no_wait?. ${STRICT}`,
        argv: build({ tool: "descript_translate", base: ["translate"],
            positionals: [{ name: "project_id", required: true }, { name: "composition_id" }] }) },
    { name: "descript_search", description: `Search the Drive for projects, media, folders and layout packs. Free and read-only, no confirmation needed. Matches names, and with match=content also transcripts and composition text, across projects, the drive media library and Brand Studio; results are ranked best first. args: query (required, non-empty), type? (array of strings or a comma-separated string of project|video|image|audio|project_folder|media_library_folder|layout_pack; default all), match? (array or comma-separated string of name|content; default both), owner? (array or comma-separated string of user UUIDs), updated_after?, updated_before? (ISO 8601 date or timestamp, UTC), sort?=relevance|newest|oldest (default relevance), limit? (1-100, default 30). Each result carries type, name, url, updated_at and one id (project_id for project and layout_pack, asset_id for video, image and audio, folder_id for project_folder and media_library_folder). ${STRICT}`,
        argv: build({ tool: "descript_search", base: ["search"],
            positionals: [{ name: "query", required: true }],
            special: { type: listFlag("descript_search", "type"), match: listFlag("descript_search", "match"), owner: listFlag("descript_search", "owner") } }) },
    { name: "descript_timeline", description: `Export a composition as a timeline file for another editor and save it locally. Creates no share page and spends no AI credits, so no confirmation is needed. Media is not bundled, the editor relinks to the user's own files. Waits for the export job, downloads the file and returns JSON with the saved path, size, file name and a download link that stays valid 24 hours. args: project_id, composition_id? (UUID, 5-character short id or project URL; default the first composition), format=edl|sesx|fcp|premiere|davinci_resolve|aaf (required; edl is a Samplitude EDL for Reaper and Samplitude, sesx is Adobe Audition, fcp is Final Cut Pro X (FCPXML 1.8), premiere is Premiere Pro XML, davinci_resolve is DaVinci Resolve XML, aaf is Pro Tools and Logic), out? (file path, or an existing folder to save into; missing parent folders are created; default ./<project_id>-<file name> in the working directory), markers? (true includes markers, false leaves them out, omit for the format's default), track_per_file? (not with fcp), source_frame_rate? (keeps the source frame rate, premiere and davinci_resolve only), strip_spaces? (aaf only, for Logic), callback_url?, no_wait? (submit only, no download; check the job with descript_jobs). ${STRICT}`,
        argv: build({ tool: "descript_timeline", base: ["timeline"],
            positionals: [{ name: "project_id", required: true }, { name: "composition_id" }],
            required: ["format"],
            special: { markers: markersFlag } }) },
];
export const realExecutor = async (argv) => {
    let stdout = "";
    let stderr = "";
    const code = await runCli(argv, {
        stdout: (s) => { stdout += s; },
        stderr: (s) => { stderr += s; }
    });
    return { code, stdout, stderr };
};
export async function handleRpc(req, exec) {
    if (req.id === undefined)
        return null; // notification
    if (req.method === "initialize") {
        return { jsonrpc: "2.0", id: req.id, result: {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                serverInfo: { name: "descript", version: PLUGIN_VERSION }
            } };
    }
    if (req.method === "tools/list") {
        return { jsonrpc: "2.0", id: req.id, result: {
                tools: TOOLS.map((t) => ({
                    name: t.name, description: t.description,
                    inputSchema: { type: "object", additionalProperties: true }
                }))
            } };
    }
    if (req.method === "tools/call") {
        const name = req.params?.name;
        if (typeof name !== "string" || name.length === 0) {
            return { jsonrpc: "2.0", id: req.id, error: { code: -32602, message: "Invalid params: missing tool name" } };
        }
        const rawArgs = req.params?.arguments ?? {};
        if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
            return { jsonrpc: "2.0", id: req.id, error: { code: -32602, message: "Invalid params: arguments must be an object" } };
        }
        const args = rawArgs;
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) {
            return { jsonrpc: "2.0", id: req.id, result: { isError: true, content: [{ type: "text", text: `Unknown tool ${name}` }] } };
        }
        let argv;
        try {
            argv = tool.argv(args);
        }
        catch (e) {
            return { jsonrpc: "2.0", id: req.id, result: { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] } };
        }
        const r = await exec(argv);
        return { jsonrpc: "2.0", id: req.id, result: {
                isError: r.code !== 0,
                content: [{ type: "text", text: r.stdout || r.stderr }]
            } };
    }
    return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
}
export async function handleLine(line, exec) {
    let req;
    try {
        req = JSON.parse(line);
    }
    catch {
        return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    const resp = await handleRpc(req, exec);
    return resp ? JSON.stringify(resp) : null;
}
async function main() {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
        buffer += chunk;
        let nl;
        while ((nl = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line)
                continue;
            const out = await handleLine(line, realExecutor);
            if (out)
                process.stdout.write(out + "\n");
        }
    }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    void main();
}
