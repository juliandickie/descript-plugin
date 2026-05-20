const LIGATURES: Record<string, string> = {
  "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl",
  "ﬃ": "ffi", "ﬄ": "ffl",
  "ﬅ": "ft", "ﬆ": "st"
};

const TRADEMARK_GLYPHS = /[™®Ⓡ℠©℗]/g;
const FORBIDDEN_DROP = /[<>?#%*:|\x00-\x1f\x7f]/g;
const WHITESPACE_RUN = /\s+/g;

export function sanitize(title: string): string {
  let s = title;

  // 1. Ligatures
  s = s.replace(/[ﬀ-ﬆ]/g, (ch) => LIGATURES[ch] ?? ch);

  // 2. Curly quotes to straight (U+2018/2019 single, U+201C/201D double)
  s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

  // 3. Strip trademark / copyright glyphs
  s = s.replace(TRADEMARK_GLYPHS, "");

  // 4. & to "and"
  s = s.replace(/&/g, "and");

  // 5. Slashes to hyphens
  s = s.replace(/[\/\\]/g, "-");

  // 6. Collapse whitespace (including tabs, newlines) and trim first
  s = s.replace(WHITESPACE_RUN, " ").trim();

  // 7. Drop forbidden chars and remaining ASCII controls (not whitespace)
  s = s.replace(FORBIDDEN_DROP, "");

  // 7b. Re-collapse whitespace (handles double-spaces left by interior forbidden-char removal)
  s = s.replace(WHITESPACE_RUN, " ").trim();

  // 8. Truncate to 200 chars
  if (s.length > 200) s = s.slice(0, 200);

  // 9. Empty / dot fallback
  if (s === "" || s === "." || s === "..") return "untitled";

  return s;
}
