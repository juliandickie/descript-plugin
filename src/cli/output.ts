export interface IO {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  json: boolean;
}

export function emit(io: IO, human: string, data: unknown): void {
  if (io.json) io.stdout(JSON.stringify(data, null, 2) + "\n");
  else io.stdout(human + "\n");
}

export function fail(io: IO, message: string, data?: unknown): void {
  if (io.json) io.stderr(JSON.stringify({ error: message, ...(data ? { detail: data } : {}) }, null, 2) + "\n");
  else io.stderr(message + "\n");
}
