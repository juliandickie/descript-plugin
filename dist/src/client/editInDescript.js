// Partner-gated. Requires separate Descript partner onboarding.
// Without partner access this returns a 403 forbidden error.
export function postEditInDescriptSchema(http, body) {
    return http.request("POST", "/edit_in_descript/schema", { body });
}
