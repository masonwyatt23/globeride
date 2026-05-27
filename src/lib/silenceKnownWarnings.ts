/**
 * Silence known-harmless console warnings that flood the production console
 * and obscure real errors. Each entry must have a specific reason — we never
 * blanket-silence warnings.
 *
 * Currently filtered:
 *   - Recharts "The width(0) and height(0) of chart should be greater than 0"
 *     fires every render when a chart is mounted inside a parent that
 *     measures 0×0 (hidden tabs, lazy-loaded panels before layout, etc.).
 *     Every ResponsiveContainer in this codebase already has minWidth/
 *     minHeight, but Recharts logs the warning anyway before the minimum
 *     applies. The chart still renders correctly once the parent has
 *     dimensions; only the warning is noise.
 */

const RECHARTS_DIM_WARNING = /The width\(-?\d+\) and height\(-?\d+\) of chart should be greater than 0/;

let installed = false;

export function silenceKnownWarnings(): void {
  if (installed) return;
  installed = true;

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    // First arg is usually the message string
    const first = args[0];
    if (typeof first === 'string' && RECHARTS_DIM_WARNING.test(first)) {
      return; // drop the noise
    }
    originalWarn(...args);
  };
}
