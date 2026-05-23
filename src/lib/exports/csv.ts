/**
 * csv.ts — RFC-4180 CSV encoder with CSV-injection guard.
 *
 * Rules:
 *   - Fields containing commas, double-quotes, or newlines are quoted.
 *   - Double-quotes inside a field are escaped as "".
 *   - null / undefined produce an empty cell.
 *   - Fields starting with =, +, -, @ (CSV injection vectors) are prefixed
 *     with a single apostrophe so spreadsheets treat them as plain text.
 */

/** Characters that require CSV injection protection (leading chars only). */
const INJECTION_PREFIXES = new Set(['=', '+', '-', '@']);

/**
 * Encode a single field value per RFC-4180, with CSV-injection guard.
 */
function encodeField(raw: unknown): string {
  if (raw === null || raw === undefined) return '';

  let value = String(raw);

  // CSV-injection guard: prefix dangerous leading characters with apostrophe.
  if (value.length > 0 && INJECTION_PREFIXES.has(value[0])) {
    value = `'${value}`;
  }

  // RFC-4180 quoting: quote if value contains comma, double-quote, CR, or LF.
  if (value.includes('"') || value.includes(',') || value.includes('\r') || value.includes('\n')) {
    value = `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

/**
 * Encode an array of row objects to a RFC-4180 CSV string.
 *
 * Column order is determined by the keys of the first row.
 * Subsequent rows are matched by the same key order; missing keys produce
 * empty cells.
 *
 * Returns an empty string for an empty input array.
 */
export function encodeCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const lines: string[] = [];

  // Header row
  lines.push(headers.map(encodeField).join(','));

  // Data rows
  for (const row of rows) {
    lines.push(headers.map((h) => encodeField(row[h])).join(','));
  }

  return lines.join('\r\n');
}
