// ManyChat's External Request interpolates custom fields like {Last Text
// Input} into the JSON body verbatim. A WhatsApp campaign message such as
// "¡Hola! Quiero más información de EB-XB2547\nCasa frente al Lago" carries
// a raw line break, which makes the body invalid JSON. Pure/no "server-only"
// so it's unit-testable, same split as lib/campaign-code.ts.

const CONTROL_CHAR_ESCAPES: Record<string, string> = {
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\b": "\\b",
  "\f": "\\f",
};

/**
 * Escapes raw control characters that appear inside JSON string literals,
 * leaving everything outside strings (including structural whitespace)
 * untouched.
 */
export function escapeControlCharsInJsonStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      } else if (ch < " ") {
        out += CONTROL_CHAR_ESCAPES[ch] ?? `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
        continue;
      }
    } else if (ch === '"') {
      inString = true;
    }
    out += ch;
  }
  return out;
}

/** JSON.parse, retrying once with raw control chars in strings escaped. */
export function parseLenientJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    const repaired = escapeControlCharsInJsonStrings(text);
    if (repaired === text) throw error;
    return JSON.parse(repaired);
  }
}
