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
export const TOOLS = [
    { name: "descript_status", description: "Check Descript API auth and status", argv: passthrough(["status"]) },
    { name: "descript_import", description: "Import media and create a project (flags: url, file, name, no-wait)", argv: passthrough(["import"]) },
    { name: "descript_agent", description: "Run an Underlord agent edit (flags: project-id, prompt, model, no-wait)", argv: passthrough(["agent"]) },
    { name: "descript_publish", description: "Publish a composition (flags: project-id, composition-id, media-type, resolution)", argv: passthrough(["publish"]) },
    { name: "descript_jobs", description: "Inspect or cancel jobs. args: sub=list|get|cancel, id", argv: (a) => ["jobs", String(a.sub ?? "list"), ...(a.id ? [String(a.id)] : []), "--json"] },
    { name: "descript_projects", description: "List or fetch projects. args: sub=list|get, id", argv: (a) => ["projects", String(a.sub ?? "list"), ...(a.id ? [String(a.id)] : []), "--json"] },
    { name: "descript_published", description: "Get published project metadata. arg: slug", argv: (a) => ["published", String(a.slug ?? ""), "--json"] },
    { name: "descript_edit_in_descript", description: "Partner-gated import URL exchange (flag: schema path)", argv: passthrough(["edit-in-descript"]) },
    { name: "descript_batch", description: "Bulk runner. args: sub=plan|run, file; flag confirm", argv: (a) => ["batch", String(a.sub ?? "plan"), String(a.file ?? ""), ...(a.confirm ? ["--confirm"] : []), "--json"] }
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
                serverInfo: { name: "descript", version: "0.1.0" }
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
        const name = String(req.params?.name);
        const args = (req.params?.arguments ?? {});
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) {
            return { jsonrpc: "2.0", id: req.id, result: { isError: true, content: [{ type: "text", text: `Unknown tool ${name}` }] } };
        }
        const r = await exec(tool.argv(args));
        return { jsonrpc: "2.0", id: req.id, result: {
                isError: r.code !== 0,
                content: [{ type: "text", text: r.stdout || r.stderr }]
            } };
    }
    return { jsonrpc: "2.0", id: req.id, result: {} };
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
            const req = JSON.parse(line);
            const resp = await handleRpc(req, realExecutor);
            if (resp)
                process.stdout.write(JSON.stringify(resp) + "\n");
        }
    }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    void main();
}
