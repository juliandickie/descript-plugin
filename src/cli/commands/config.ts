import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { defaultConfigPath, redactToken } from "../../config/credentials.js";
import type { IO } from "../output.js";
import { emit, fail } from "../output.js";

export interface ConfigCtx {
  flags: Record<string, string | boolean>;
  io: IO;
}
interface CfgFile { default_profile?: string; profiles?: Record<string, { api_token: string }>; }

export function configSet(ctx: ConfigCtx): number {
  const profile = typeof ctx.flags.profile === "string" ? ctx.flags.profile : "default";
  const token = typeof ctx.flags.token === "string" ? ctx.flags.token : undefined;
  if (!token) { fail(ctx.io, "Provide --token (and optionally --profile)"); return 2; }
  const path = defaultConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  const cfg: CfgFile = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  cfg.profiles = { ...(cfg.profiles ?? {}), [profile]: { api_token: token } };
  cfg.default_profile = cfg.default_profile ?? profile;
  writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  emit(ctx.io, `Saved profile "${profile}" (${redactToken(token)}) to ${path}`, { profile, path });
  return 0;
}

export function configList(ctx: ConfigCtx): number {
  const path = defaultConfigPath();
  if (!existsSync(path)) { emit(ctx.io, "No profiles configured.", { profiles: [] }); return 0; }
  const cfg: CfgFile = JSON.parse(readFileSync(path, "utf8"));
  const names = Object.keys(cfg.profiles ?? {});
  emit(ctx.io, `Profiles: ${names.join(", ") || "none"} (default: ${cfg.default_profile ?? "none"})`, {
    default_profile: cfg.default_profile, profiles: names
  });
  return 0;
}

export interface ConfigEditCtx {
  flags: Record<string, string | boolean>;
  io: IO;
  env: Record<string, string | undefined>;
  configPath?: string;
  spawnEditor?: (cmd: string, args: string[]) => void;
  platform?: NodeJS.Platform;
}

function resolveEditor(
  flags: Record<string, string | boolean>,
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
  path: string
): { cmd: string; args: string[]; display: string } {
  const flag = typeof flags.editor === "string" ? flags.editor : undefined;
  const chosen = flag ?? env.VISUAL ?? env.EDITOR;
  if (chosen) return { cmd: chosen, args: [path], display: chosen };
  if (platform === "darwin") return { cmd: "open", args: ["-t", path], display: "open -t" };
  return { cmd: "nano", args: [path], display: "nano" };
}

export function configEdit(ctx: ConfigEditCtx): number {
  const profile = typeof ctx.flags.profile === "string" ? ctx.flags.profile : "default";
  const path = ctx.configPath ?? defaultConfigPath();
  const platform = ctx.platform ?? process.platform;
  const launchEditor = ctx.spawnEditor ?? ((cmd: string, args: string[]) => {
    spawnSync(cmd, args, { stdio: "inherit" });
  });

  mkdirSync(dirname(path), { recursive: true });
  const existed = existsSync(path);
  let cfg: CfgFile = {};
  if (existed) {
    try {
      cfg = JSON.parse(readFileSync(path, "utf8")) as CfgFile;
    } catch {
      fail(ctx.io, `credentials.json exists but is not valid JSON. Fix or delete ${path}, then re-run.`);
      return 2;
    }
  }
  const profiles = cfg.profiles ?? {};
  // changed starts true for a new file; set true on any structural modification. Controls the write; chmod is unconditional.
  let changed = !existed;
  if (!(profile in profiles)) { profiles[profile] = { api_token: "" }; changed = true; }
  cfg.profiles = profiles;
  if (cfg.default_profile === undefined) { cfg.default_profile = profile; changed = true; }
  if (changed) writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);

  const ed = resolveEditor(ctx.flags, ctx.env, platform, path);
  let launchFailed = false;
  try { launchEditor(ed.cmd, ed.args); } catch { launchFailed = true; }

  const verify = `descript status --profile ${profile}`;
  const human = launchFailed
    ? `Prepared ${path} (profile "${profile}", owner-only). Could not open an editor automatically - open that file in your text editor, set the "api_token" value, save, then run: ${verify}`
    : `Opening ${path} in ${ed.display}. Set the "api_token" value for profile "${profile}", save and close, then run: ${verify}`;
  emit(ctx.io, human, { path, profile, editor: ed.display, launched: !launchFailed });
  return 0;
}
