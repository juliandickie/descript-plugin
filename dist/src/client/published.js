export function getPublishedProjectMetadata(http, slug) {
    return http.request("GET", `/published_projects/${encodeURIComponent(slug)}`);
}
