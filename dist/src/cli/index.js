import { COMMANDS, mapError } from "./commands/registry.js";
import { fail } from "./output.js";
const USAGE = `Usage: descript <command> [options]

Commands:
  status                         Check API auth and service status
  config set|list                Manage API token profiles
  import --url|--file [...]      Import media, create a project
  agent --prompt [...]           Run an Underlord agent edit
  publish --project-id [...]     Publish a composition
  jobs list|get <id>|cancel <id> Inspect or cancel jobs
  projects list|get <id>         List or fetch projects
  published <slug>               Get published project metadata
  edit-in-descript --schema f    Partner-gated import URL exchange
  batch plan|run <manifest>      Bulk import/edit/publish

Global options:
  --json            Machine-readable output
  --no-wait         Submit without polling to completion
  --token <t>       Explicit API token
  --profile <name>  Credential profile to use`;
export function parseArgv(argv) {
    const flags = {};
    const positionals = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith("--")) {
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith("--")) {
                flags[key] = next;
                i++;
            }
            else
                flags[key] = true;
        }
        else
            positionals.push(a);
    }
    return { command: positionals[0] ?? "", args: positionals.slice(1), flags };
}
export async function runCli(argv, opts = {}) {
    const { command, args, flags } = parseArgv(argv);
    const io = {
        stdout: opts.stdout ?? ((s) => process.stdout.write(s)),
        stderr: opts.stderr ?? ((s) => process.stderr.write(s)),
        json: flags.json === true
    };
    if (!command || command === "help" || flags.help === true) {
        io.stdout(USAGE + "\n");
        return command ? 0 : 2;
    }
    const handler = COMMANDS[command];
    if (!handler) {
        fail(io, `Unknown command "${command}".\n\n${USAGE}`);
        return 2;
    }
    const ctx = { args, flags, env: opts.env ?? process.env, io };
    try {
        return await handler(ctx);
    }
    catch (e) {
        return mapError(io, e);
    }
}
