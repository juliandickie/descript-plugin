import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { defaultConfigPath, redactToken } from "../../config/credentials.js";
import { emit, fail } from "../output.js";
export function configSet(ctx) {
    const profile = typeof ctx.flags.profile === "string" ? ctx.flags.profile : "default";
    const token = typeof ctx.flags.token === "string" ? ctx.flags.token : undefined;
    if (!token) {
        fail(ctx.io, "Provide --token (and optionally --profile)");
        return 2;
    }
    const path = defaultConfigPath();
    mkdirSync(dirname(path), { recursive: true });
    const cfg = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
    cfg.profiles = { ...(cfg.profiles ?? {}), [profile]: { api_token: token } };
    cfg.default_profile = cfg.default_profile ?? profile;
    writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 });
    emit(ctx.io, `Saved profile "${profile}" (${redactToken(token)}) to ${path}`, { profile, path });
    return 0;
}
export function configList(ctx) {
    const path = defaultConfigPath();
    if (!existsSync(path)) {
        emit(ctx.io, "No profiles configured.", { profiles: [] });
        return 0;
    }
    const cfg = JSON.parse(readFileSync(path, "utf8"));
    const names = Object.keys(cfg.profiles ?? {});
    emit(ctx.io, `Profiles: ${names.join(", ") || "none"} (default: ${cfg.default_profile ?? "none"})`, {
        default_profile: cfg.default_profile, profiles: names
    });
    return 0;
}
