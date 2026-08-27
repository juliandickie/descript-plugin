import type { HttpClient } from "./http.js";
import type { AgentModelsResponse } from "./types.js";

export function listAgentModels(http: HttpClient): Promise<AgentModelsResponse> {
  return http.request<AgentModelsResponse>("GET", "/agent/models");
}
