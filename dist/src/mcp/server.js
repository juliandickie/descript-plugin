import { fileURLToPath } from "node:url";
import { runCli } from "../cli/index.js";
const passthrough = (base) => (args) => {
    const out = [...base];
    for (const [k, v] of Object.entries(args)) {
        if (v === true)
            out.push(`--${k}`);
        else if (v !== false && v !== undefined && v !== null)
            out.push(`--${k}`, String(v));
    }
    out.push("--json");
    return out;
};
const TRANSCRIPT_ARGS = ["project_id", "composition_id", "format", "out", "speaker_labels", "markers", "timecodes"];
const TIMECODE_BOOLEANS = {
    on_paragraphs: "--timecodes-on-paragraphs",
    on_speakers: "--timecodes-on-speakers",
    on_markers: "--timecodes-on-markers"
};
const TIMECODE_NUMBERS = {
    frequency_seconds: "--timecodes-every",
    offset_seconds: "--timecodes-offset"
};
// A hand-built argv mapper only forwards the keys it names, so an argument it
// does not know would be dropped without a trace. Throw instead; handleRpc
// turns the throw into an isError result before the CLI runs.
function rejectUnknownKeys(tool, args, allowed) {
    for (const k of Object.keys(args)) {
        if (!allowed.includes(k))
            throw new Error(`${tool}: Unknown argument "${k}". Allowed: ${allowed.join(", ")}`);
    }
}
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
            out.push(TIMECODE_NUMBERS[k], String(v));
        }
        else {
            throw new Error(`descript_transcript: Unknown timecodes key "${k}". Allowed: ${[...Object.keys(TIMECODE_BOOLEANS), ...Object.keys(TIMECODE_NUMBERS)].join(", ")}`);
        }
    }
    return out;
}
export const TOOLS = [
    { name: "descript_status", description: "Check Descript API auth and status", argv: passthrough(["status"]) },
    { name: "descript_import", description: "Import media and create a project (flags: url, file, name, no-wait)", argv: passthrough(["import"]) },
    { name: "descript_agent", description: "Run an Underlord agent edit (flags: project-id, prompt, model, no-wait)", argv: passthrough(["agent"]) },
    { name: "descript_publish", description: "Publish a composition (flags: project-id, composition-id, media-type, resolution)", argv: passthrough(["publish"]) },
    { name: "descript_jobs", description: "Inspect or cancel jobs. args: sub=list|get|cancel, id", argv: (a) => ["jobs", String(a.sub ?? "list"), ...(a.id ? [String(a.id)] : []), "--json"] },
    { name: "descript_projects", description: "List or fetch projects. args: sub=list|get, id", argv: (a) => ["projects", String(a.sub ?? "list"), ...(a.id ? [String(a.id)] : []), "--json"] },
    { name: "descript_published", description: "Get published project metadata. arg: slug", argv: (a) => ["published", String(a.slug ?? ""), "--json"] },
    { name: "descript_edit_in_descript", description: "Partner-gated import URL exchange (flag: schema path)", argv: passthrough(["edit-in-descript"]) },
    { name: "descript_batch", description: "Bulk runner. args: sub=plan|run, file; flag confirm", argv: (a) => ["batch", String(a.sub ?? "plan"), String(a.file ?? ""), ...(a.confirm ? ["--confirm"] : []), "--json"] },
    { name: "descript_models", description: "List available Underlord agent models and aliases (live catalog)", argv: passthrough(["models"]) },
    { name: "descript_transcript", description: "Export a composition transcript, free and instant, no publish. args: project_id, composition_id?, format=txt|markdown|html|rtf|docx|srt, out? (file path, missing parent folders are created; required for docx), speaker_labels?=off|changes|every_paragraph, markers?, timecodes? (object, any of on_paragraphs, on_speakers, on_markers as booleans, frequency_seconds, offset_seconds as numbers; adds [HH:MM:SS] marks). Unknown arguments are rejected, never ignored.", argv: (a) => {
            rejectUnknownKeys("descript_transcript", a, TRANSCRIPT_ARGS);
            return [
                "transcript",
                String(a.project_id ?? ""),
                ...(a.composition_id ? [String(a.composition_id)] : []),
                "--format", String(a.format ?? "txt"),
                ...(a.speaker_labels ? ["--speaker-labels", String(a.speaker_labels)] : []),
                ...(a.markers === true ? ["--markers"] : []),
                ...timecodeFlags(a.timecodes),
                ...(a.out ? ["--out", String(a.out)] : []),
                "--json"
            ];
        } },
    { name: "descript_translate", description: "Translate a composition's captions via Underlord and report which NEW composition carries the requested language (creation-time mapping). BILLABLE - spends AI credits (translate captions ~10 plus agent message credits); confirm with the user before calling. args: project_id, composition_id?, language (e.g. \"French (Canada)\" - regional variants supported), model?", argv: (a) => [
            "translate",
            String(a.project_id ?? ""),
            ...(a.composition_id ? [String(a.composition_id)] : []),
            "--language", String(a.language ?? ""),
            ...(a.model ? ["--model", String(a.model)] : []),
            "--json"
        ] },
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
                serverInfo: { name: "descript", version: "0.5.0" }
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
