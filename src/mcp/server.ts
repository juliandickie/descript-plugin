import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runCli } from "../cli/index.js";
import { COMMAND_FLAGS, GLOBAL_FLAGS } from "../cli/commands/registry.js";

// The plugin's own version, read from package.json at the plugin root
// (dist/src/mcp/server.js -> ../../../package.json) so it cannot go stale.
function readPluginVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "package.json"), "utf8")) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
export const PLUGIN_VERSION = readPluginVersion();

export interface Tool {
  name: string;
  description: string;
  argv: (args: Record<string, unknown>) => string[];
}

// One builder for every tool, so no tool can quietly drop an argument.
// - `positionals` are taken by name, in order, and become CLI positionals.
// - every other argument becomes a CLI flag (snake_case or kebab-case accepted),
//   and must be a flag the command really reads (COMMAND_FLAGS, shared with the
//   CLI). Anything else throws; handleRpc turns the throw into an isError result
//   before the CLI runs.
// - `special` handles arguments that are not a 1:1 flag (the timecodes object).
interface Positional { name: string; required?: boolean; fallback?: string; }
interface ToolSpec {
  tool: string;
  base: string[];
  positionals?: Positional[];
  defaults?: Record<string, string>;
  special?: Record<string, (v: unknown) => string[]>;
}

const MCP_GLOBAL_FLAGS = GLOBAL_FLAGS.filter((f) => f !== "json" && f !== "help");

function build(spec: ToolSpec): (args: Record<string, unknown>) => string[] {
  const command = spec.base[0]!;
  const positionals = spec.positionals ?? [];
  const special = spec.special ?? {};
  const flagNames = [...(COMMAND_FLAGS[command] ?? []), ...MCP_GLOBAL_FLAGS];
  const allowed = [...positionals.map((p) => p.name), ...Object.keys(special), ...flagNames.map((f) => f.replace(/-/g, "_"))];
  return (args) => {
    const out = [...spec.base];
    const seen = new Set<string>();
    const norm: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      const key = k.replace(/-/g, "_");
      if (seen.has(key)) throw new Error(`${spec.tool}: argument "${key}" was given twice (as snake_case and kebab-case)`);
      seen.add(key);
      if (!allowed.includes(key)) throw new Error(`${spec.tool}: Unknown argument "${k}". Nothing was run. Allowed: ${allowed.join(", ")}`);
      norm[key] = v;
    }
    const absent = (v: unknown) => v === undefined || v === null || v === "";
    let gap: string | undefined;
    for (const p of positionals) {
      const v = absent(norm[p.name]) ? p.fallback : norm[p.name];
      if (absent(v)) {
        if (p.required) throw new Error(`${spec.tool}: missing required argument "${p.name}"`);
        gap = gap ?? p.name;
        continue;
      }
      if (gap) throw new Error(`${spec.tool}: "${p.name}" needs "${gap}" as well`);
      if (typeof v === "object") throw new Error(`${spec.tool}: "${p.name}" must be a string`);
      const text = String(v);
      if (text.startsWith("--")) throw new Error(`${spec.tool}: "${p.name}" cannot start with "--"`);
      out.push(text);
    }
    const flags: Record<string, unknown> = { ...(spec.defaults ?? {}) };
    for (const [key, v] of Object.entries(norm)) {
      if (positionals.some((p) => p.name === key) || key in special) continue;
      flags[key.replace(/_/g, "-")] = v;
    }
    for (const [flag, v] of Object.entries(flags)) {
      if (v === true) out.push(`--${flag}`);
      else if (v === false || v === undefined || v === null) continue;
      // --flag=value keeps values that start with "-" (negative offsets) intact.
      else out.push(`--${flag}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    }
    for (const [key, fn] of Object.entries(special)) out.push(...fn(norm[key]));
    out.push("--json");
    return out;
  };
}

const TIMECODE_BOOLEANS: Record<string, string> = {
  on_paragraphs: "--timecodes-on-paragraphs",
  on_speakers: "--timecodes-on-speakers",
  on_markers: "--timecodes-on-markers"
};
const TIMECODE_NUMBERS: Record<string, string> = {
  frequency_seconds: "--timecodes-every",
  offset_seconds: "--timecodes-offset"
};

// Maps the API-shaped timecodes object onto the CLI's --timecodes-* flags so
// the MCP tool and the CLI share one code path (buildTimecodes in registry.ts).
function timecodeFlags(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("descript_transcript: timecodes must be an object, for example {\"on_paragraphs\": true}");
  }
  const out: string[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k in TIMECODE_BOOLEANS) {
      if (typeof v !== "boolean") throw new Error(`descript_transcript: timecodes.${k} must be true or false`);
      if (v) out.push(TIMECODE_BOOLEANS[k]!);
    } else if (k in TIMECODE_NUMBERS) {
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`descript_transcript: timecodes.${k} must be a number of seconds`);
      out.push(`${TIMECODE_NUMBERS[k]!}=${v}`);
    } else {
      throw new Error(`descript_transcript: Unknown timecodes key "${k}". Allowed: ${[...Object.keys(TIMECODE_BOOLEANS), ...Object.keys(TIMECODE_NUMBERS)].join(", ")}`);
    }
  }
  return out;
}

const STRICT = "Argument names may be snake_case or kebab-case. Unknown arguments are rejected, never ignored.";

export const TOOLS: Tool[] = [
  { name: "descript_status", description: `Check Descript API auth and status. args: profile?. ${STRICT}`,
    argv: build({ tool: "descript_status", base: ["status"] }) },
  { name: "descript_import", description: `Import media and create a project (spends media seconds). args: url | file | media (JSON), name?, folder?, team_access?=edit|comment|view|none (required with folder), language?, workspace?, project_id? (add into an existing project), compositions? (JSON array), content_type?, callback_url?, no_wait?. ${STRICT}`,
    argv: build({ tool: "descript_import", base: ["import"] }) },
  { name: "descript_agent", description: `Run an Underlord agent edit. BILLABLE - spends AI credits; confirm with the user before calling. args: prompt, project_id | project_name, composition_id?, model?, team_access?, callback_url?, no_wait?. ${STRICT}`,
    argv: build({ tool: "descript_agent", base: ["agent"] }) },
  { name: "descript_publish", description: `Publish a composition. args: project_id, composition_id?, media_type?=Video|Audio, resolution?=480p|720p|1080p|1440p|4K, access_level?=private|unlisted|public (default private; elevate only when the user asked for an externally reachable URL), drive_default_access? (use the drive's configured default instead), callback_url?, no_wait?. ${STRICT}`,
    argv: build({ tool: "descript_publish", base: ["publish"] }) },
  { name: "descript_jobs", description: `Inspect or cancel jobs. args: sub=list|get|cancel (default list), id (for get and cancel); list filters project_id?, type?=import/project_media|agent, created_after?, created_before?, limit? (1-100), cursor?. ${STRICT}`,
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
];

export interface ExecResult { code: number; stdout: string; stderr: string; }
export type Executor = (argv: string[]) => Promise<ExecResult>;

export const realExecutor: Executor = async (argv) => {
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, {
    stdout: (s) => { stdout += s; },
    stderr: (s) => { stderr += s; }
  });
  return { code, stdout, stderr };
};

export interface RpcRequest { jsonrpc: "2.0"; id?: number | string; method: string; params?: Record<string, unknown>; }
export interface RpcResponse { jsonrpc: "2.0"; id: number | string | null; result?: any; error?: { code: number; message: string }; }

export async function handleRpc(req: RpcRequest, exec: Executor): Promise<RpcResponse | null> {
  if (req.id === undefined) return null; // notification
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
    const args = rawArgs as Record<string, unknown>;
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return { jsonrpc: "2.0", id: req.id, result: { isError: true, content: [{ type: "text", text: `Unknown tool ${name}` }] } };
    }
    let argv: string[];
    try {
      argv = tool.argv(args);
    } catch (e) {
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

export async function handleLine(line: string, exec: Executor): Promise<string | null> {
  let req: RpcRequest;
  try {
    req = JSON.parse(line) as RpcRequest;
  } catch {
    return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  const resp = await handleRpc(req, exec);
  return resp ? JSON.stringify(resp) : null;
}

async function main(): Promise<void> {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const out = await handleLine(line, realExecutor);
      if (out) process.stdout.write(out + "\n");
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
