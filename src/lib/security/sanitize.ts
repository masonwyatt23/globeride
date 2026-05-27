/**
 * Lightweight sanitization helpers for non-React rendering paths.
 *
 * React's JSX auto-escapes all interpolated strings, so these helpers are
 * only needed for:
 *   - Cesium LabelGraphics text (rendered as SVG, not HTML — but long strings
 *     can break layout and control chars are unexpected)
 *   - Export filenames passed to the FileSaver / anchor download attribute
 *   - URL validation before navigation / iframe src
 *
 * No external dependencies. Pure functions, no side-effects.
 */

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/** Regex matching Unicode control characters (C0, DEL, C1). */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f-\x9f]/g;
// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize a user-supplied string for display in a Cesium label (or any
 * non-React renderer that treats the string as plain text).
 *
 * - Strips C0/C1 control characters (including null bytes, newlines, tabs)
 * - Collapses consecutive whitespace to a single space
 * - Trims leading/trailing whitespace
 * - Truncates to `maxLen` characters, appending "…" if truncated
 *
 * @param s      Raw user string (route name, search result, peer label, …)
 * @param maxLen Maximum character length of the returned string (default 80)
 */
export function sanitizeForLabel(s: string, maxLen = 80): string {
  if (!s) return '';
  const cleaned = s
    .replace(CONTROL_CHAR_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 1) + '…'; // …
}

/**
 * Sanitize a user-supplied string for use as a file download name.
 *
 * - Strips control characters
 * - Replaces characters illegal in most filesystems ( / \ : * ? " < > | )
 *   with an underscore
 * - Collapses runs of underscores/spaces
 * - Trims and truncates to `maxLen` characters
 *
 * @param s      Raw string (route name, workout name, …)
 * @param maxLen Maximum character length (default 64)
 */
export function sanitizeForFilename(s: string, maxLen = 64): string {
  if (!s) return 'export';
  const cleaned = s
    .replace(CONTROL_CHAR_RE, '')
    .replace(/[/\\:*?"<>|]/g, '_')
    // Collapse runs of underscores/spaces, then strip leading/trailing underscores
    .replace(/[_\s]{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .trim();
  const result = cleaned.slice(0, maxLen).trim();
  return result || 'export';
}

/**
 * Returns true if `s` is a safe HTTP/HTTPS URL:
 *   - Must start with http:// or https:// (case-insensitive)
 *   - Must contain no control characters
 *   - Must be parseable by the URL constructor
 *
 * Use before navigating to or embedding a user-supplied URL.
 */
export function isSafeUrl(s: string): boolean {
  if (!s) return false;
  if (CONTROL_CHAR_RE.test(s)) return false;
  const lower = s.toLowerCase().trimStart();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
  try {
    const url = new URL(s);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
