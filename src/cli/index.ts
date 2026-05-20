import { COMMANDS, mapError, type Ctx } from "./commands/registry.js";
import type { IO } from "./output.js";
import { fail } from "./output.js";

const USAGE = `Usage: descript <command> [options]

Commands:
  status                         Check API auth and service status
  config set|list|edit           Manage API token profiles (edit opens the file in your editor)
  import --url|--file|--media    Import media (--folder, --language, --project-id to add into existing project, --media <json>, --compositions <json>)
  agent --prompt [...]           Run an Underlord agent edit (--model <name>; see model list below)
  publish --project-id [...]     Publish a composition (default --access-level private; elevate explicitly)
  jobs list|get <id>|cancel <id> Inspect or cancel jobs (list --project-id, --type, --created-after, --created-before, --limit 1-100, --cursor)
  projects list|get <id>         List or fetch projects (list --name, --folder-path, --created-by, --created-after, --created-before, --updated-after, --updated-before, --sort, --direction, --limit 1-100, --cursor)
  published <slug>               Get published project metadata
  download-published <slug>      Download mp4/srt/md from a published slug
  export <pid> [cid] [...]       Publish + download mp4/srt/md (single, project-wide, or --projects; --resume <path> replays a prior export-report.json)
  edit-in-descript --schema f    Partner-gated import URL exchange
  batch plan|run <manifest>      Bulk import/edit/publish (operator-only)

Underlord models (descript agent --model <name>):
  Documented as of 2026-05-20 - Auto, Claude Haiku 4.5, Claude Sonnet 4.6,
  Claude Opus 4.6, Claude Opus 4.7, GPT 5.2, Gemini 3 Pro, Gemini 3.1 Pro.
  Pass any string. The CLI does not validate the model name; Descript's API
  is the source of truth and accepts new models as they ship. For credit
  conservation use Claude Haiku 4.5. See docs/help-docs/Underlord ... in
  Descript.md for the full table.

Global options:
  --json            Machine-readable output
  --no-wait         Submit without polling to completion
  --callback-url <u> Webhook for async completion (import/agent/publish)
  --token <t>       Explicit API token
  --profile <name>  Credential profile to use
  --team-access <l>  Drive access for new projects (edit|comment|view|none)`;

export function parseArgv(argv: string[]): { command: string; args: string[]; flags: Record<string, string | boolean> } {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const body = a.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) { flags[body] = next; i++; }
        else flags[body] = true;
      }
    } else positionals.push(a);
  }
  return { command: positionals[0] ?? "", args: positionals.slice(1), flags };
}

export interface RunOptions {
  env?: Record<string, string | undefined>;
  stdout?: (s: string) => void;
  stderr?: (s: string) => void;
}

export async function runCli(argv: string[], opts: RunOptions = {}): Promise<number> {
  const { command, args, flags } = parseArgv(argv);
  const io: IO = {
    stdout: opts.stdout ?? ((s) => process.stdout.write(s)),
    stderr: opts.stderr ?? ((s) => process.stderr.write(s)),
    json: flags.json === true
  };
  if (!command || command === "help" || flags.help === true) {
    io.stdout(USAGE + "\n");
    return (command || flags.help === true) ? 0 : 2;
  }
  const handler = COMMANDS[command];
  if (!handler) { fail(io, `Unknown command "${command}".\n\n${USAGE}`); return 2; }
  const ctx: Ctx = { args, flags, env: opts.env ?? process.env, io };
  try {
    return await handler(ctx);
  } catch (e) {
    return mapError(io, e);
  }
}
