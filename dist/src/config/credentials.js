import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
export function defaultConfigPath() {
    return join(homedir(), ".config", "descript", "credentials.json");
}
function readConfig(path) {
    if (!existsSync(path))
        return undefined;
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    }
    catch {
        return undefined;
    }
}
export function resolveCredentials(opts = {}) {
    const env = opts.env ?? process.env;
    const profile = opts.profile ?? env.DESCRIPT_PROFILE;
    if (opts.flagToken) {
        return { token: opts.flagToken, profile: profile ?? "default", source: "flag" };
    }
    if (env.DESCRIPT_API_TOKEN) {
        return { token: env.DESCRIPT_API_TOKEN, profile: profile ?? "default", source: "env" };
    }
    const path = opts.configPath ?? defaultConfigPath();
    const cfg = readConfig(path);
    if (cfg?.profiles) {
        const name = profile ?? cfg.default_profile ?? "default";
        const entry = cfg.profiles[name];
        if (entry?.api_token)
            return { token: entry.api_token, profile: name, source: "file" };
    }
    if (env.CLAUDE_PLUGIN_OPTION_API_TOKEN) {
        return { token: env.CLAUDE_PLUGIN_OPTION_API_TOKEN, profile: profile ?? "default", source: "plugin" };
    }
    throw new Error("No Descript API token found. Provide --token, set DESCRIPT_API_TOKEN, " +
        "run `descript config set`, or configure the plugin api_token.");
}
export function redactToken(token) {
    if (token.length <= 4)
        return "***";
    return `***${token.slice(-4)}`;
}
