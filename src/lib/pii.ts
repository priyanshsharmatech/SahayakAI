/**
 * Lightweight PII redaction for transcript exports / retention. Masks emails,
 * phone numbers, and card-like digit runs. Heuristic, not exhaustive.
 */
export function redactPII(text: string): string {
  if (!text) return text;
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[redacted-email]")
    .replace(/\b(?:\d[ -]?){13,16}\b/g, "[redacted-card]")
    .replace(/(?<!\d)(?:\+?\d[\d\s-]{7,}\d)(?!\d)/g, "[redacted-phone]");
}
