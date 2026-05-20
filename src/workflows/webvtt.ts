export interface Cue {
  start: string;
  end: string;
  text: string;
}

const TIMESTAMP_LINE = /^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/;

export function parseVtt(content: string): Cue[] {
  const lines = content.split(/\r?\n/);
  const cues: Cue[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Skip WEBVTT header
    if (line === "WEBVTT" || line.startsWith("WEBVTT ")) {
      i++;
      continue;
    }

    // Skip NOTE blocks (multi-line, terminated by blank line)
    if (line === "NOTE" || line.startsWith("NOTE ")) {
      i++;
      while (i < lines.length && (lines[i] ?? "").trim() !== "") i++;
      i++;
      continue;
    }

    const m = line.match(TIMESTAMP_LINE);
    if (!m) {
      i++;
      continue;
    }

    const start = m[1] ?? "";
    const end = m[2] ?? "";
    i++;

    const textLines: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() !== "") {
      textLines.push(lines[i] as string);
      i++;
    }
    cues.push({ start, end, text: textLines.join("\n") });
    i++;
  }
  return cues;
}
