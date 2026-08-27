export function listAgentModels(http) {
    return http.request("GET", "/agent/models");
}
