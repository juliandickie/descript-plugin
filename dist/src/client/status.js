export function getStatus(http) {
    return http.request("GET", "/status");
}
