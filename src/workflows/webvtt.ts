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

export function toSrt(cues: Cue[]): string {
  if (cues.length === 0) return "\n";
  return cues
    .map((c, idx) => {
      const start = c.start.replace(".", ",");
      const end = c.end.replace(".", ",");
      return `${idx + 1}\n${start} --> ${end}\n${c.text}`;
    })
    .join("\n\n") + "\n";
}

const SPEAKER_RE = /^([A-Z][\p{L}\s.'\-_0-9]+?):\s+/u;

function truncTimecode(vttTs: string): string {
  const dot = vttTs.indexOf(".");
  return dot === -1 ? vttTs : vttTs.slice(0, dot);
}

export function toMd(cues: Cue[], title: string, opts: { endMarker: boolean }): string {
  const out: string[] = [];
  out.push(`# ${title}`);
  out.push("");

  let currentSpeaker: string | null = null;
  for (const cue of cues) {
    let body = cue.text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

    let speakerForThisPara: string | null = null;
    const m = body.match(SPEAKER_RE);
    if (m) {
      const detected = (m[1] ?? "").trim();
      body = body.slice(m[0].length);
      if (detected !== currentSpeaker) {
        speakerForThisPara = detected;
        currentSpeaker = detected;
      }
    }

    const ts = truncTimecode(cue.start);
    const prefix = speakerForThisPara
      ? `[${ts}] **${speakerForThisPara}:** `
      : `[${ts}] `;

    out.push(`${prefix}${body} `);
    out.push("");
  }

  if (opts.endMarker && cues.length > 0) {
    const lastCue = cues[cues.length - 1]!;
    const lastEnd = truncTimecode(lastCue.end);
    out.push(`[${lastEnd}] END`);
  }

  // Remove trailing empty strings to avoid a double-newline at end,
  // but preserve a trailing blank line when endMarker is used.
  while (out.length > 0 && out[out.length - 1] === "") {
    out.pop();
  }

  return out.join("\n") + "\n";
}
