/**
 * PC#8 — canonical JSON serialization (D-3).
 *
 * Object keys sorted, `undefined` members dropped, no whitespace. Used for
 * the intent record's content address (crossing-completion.ts, since Item
 * 1.3) and, from Item 3.1, to normalize the assembled content object before
 * it is digested (assembly.ts). Moved here from crossing-completion.ts at
 * Item 3.1 so assembly.ts can import it without a module cycle; the
 * original module re-exports it unchanged.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
