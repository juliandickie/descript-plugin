import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { defaultConfigPath, redactToken } from "../../config/credentials.js";
import { emit, fail } from "../output.js";
function parseCfgFile(io, path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        fail(io, `credentials.json exists but is not valid JSON. Fix or delete ${path}, then re-run.`);
        return null;
    }
}
export function configSet(ctx) {
    const profile = typeof ctx.flags.profile === "string" ? ctx.flags.profile : "default";
    const token = typeof ctx.flags.token === "string" ? ctx.flags.token : undefined;
    if (!token) {
        fail(ctx.io, "Provide --token (and optionally --profile)");
        return 2;
    }
    const path = ctx.configPath ?? defaultConfigPath();
    mkdirSync(dirname(path), { recursive: true });
    let cfg = {};
    if (existsSync(path)) {
        const parsed = parseCfgFile(ctx.io, path);
        if (parsed === null)
            return 2;
        cfg = parsed;
    }
    cfg.profiles = { ...(cfg.profiles ?? {}), [profile]: { api_token: token } };
    cfg.default_profile = cfg.default_profile ?? profile;
    writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
    emit(ctx.io, `Saved profile "${profile}" (${redactToken(token)}) to ${path}`, { profile, path });
    return 0;
}
export function configList(ctx) {
    const path = ctx.configPath ?? defaultConfigPath();
    if (!existsSync(path)) {
        emit(ctx.io, "No profiles configured.", { profiles: [] });
        return 0;
    }
    const parsed = parseCfgFile(ctx.io, path);
    if (parsed === null)
        return 2;
    const cfg = parsed;
    const names = Object.keys(cfg.profiles ?? {});
    emit(ctx.io, `Profiles: ${names.join(", ") || "none"} (default: ${cfg.default_profile ?? "none"})`, {
        default_profile: cfg.default_profile, profiles: names
    });
    return 0;
}
function resolveEditor(flags, env, platform, path) {
    const flag = typeof flags.editor === "string" ? flags.editor : undefined;
    const chosen = flag ?? env.VISUAL ?? env.EDITOR;
    if (chosen)
        return { cmd: chosen, args: [path], display: chosen };
    if (platform === "darwin")
        return { cmd: "open", args: ["-t", path], display: "open -t" };
    return { cmd: "nano", args: [path], display: "nano" };
}
export function configEdit(ctx) {
    const profile = typeof ctx.flags.profile === "string" ? ctx.flags.profile : "default";
    const path = ctx.configPath ?? defaultConfigPath();
    const platform = ctx.platform ?? process.platform;
    const launchEditor = ctx.spawnEditor ?? ((cmd, args) => {
        spawnSync(cmd, args, { stdio: "inherit" });
    });
    mkdirSync(dirname(path), { recursive: true });
    const existed = existsSync(path);
    let cfg = {};
    if (existed) {
        const parsed = parseCfgFile(ctx.io, path);
        if (parsed === null)
            return 2;
        cfg = parsed;
    }
    const profiles = cfg.profiles ?? {};
    // changed starts true for a new file; set true on any structural modification. Controls the write; chmod is unconditional.
    let changed = !existed;
    if (!(profile in profiles)) {
        profiles[profile] = { api_token: "" };
        changed = true;
    }
    cfg.profiles = profiles;
    if (cfg.default_profile === undefined) {
        cfg.default_profile = profile;
        changed = true;
    }
    if (changed)
        writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
    chmodSync(path, 0o600);
    const ed = resolveEditor(ctx.flags, ctx.env, platform, path);
    let launchFailed = false;
    try {
        launchEditor(ed.cmd, ed.args);
    }
    catch {
        launchFailed = true;
    }
    const verify = `descript status --profile ${profile}`;
    const human = launchFailed
        ? `Prepared ${path} (profile "${profile}", owner-only). Could not open an editor automatically - open that file in your text editor, set the "api_token" value, save, then run: ${verify}`
        : `Opening ${path} in ${ed.display}. Set the "api_token" value for profile "${profile}", save and close, then run: ${verify}`;
    emit(ctx.io, human, { path, profile, editor: ed.display, launched: !launchFailed });
    return 0;
}
