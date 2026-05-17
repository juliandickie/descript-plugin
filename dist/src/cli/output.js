export function emit(io, human, data) {
    if (io.json)
        io.stdout(JSON.stringify(data, null, 2) + "\n");
    else
        io.stdout(human + "\n");
}
export function fail(io, message, data) {
    if (io.json)
        io.stderr(JSON.stringify({ error: message, ...(data ? { detail: data } : {}) }, null, 2) + "\n");
    else
        io.stderr(message + "\n");
}
