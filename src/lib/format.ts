/**
 * format.ts — canonical formatting helpers for the GlobeRide UI.
 *
 * All pure functions, no React/store imports — safe to use anywhere.
 *
 * Note: formatDuration and formatDistance live in utils.ts and are
 * re-exported from here for convenience so callers can import from a
 * single canonical location.
 */

export { formatDuration, formatDistance } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Speed
// ---------------------------------------------------------------------------

/** m/s → "x.x km/h" */
export function formatSpeed(ms: number): string {
  return `${(ms * 3.6).toFixed(1)} km/h`;
}

// ---------------------------------------------------------------------------
// Power
// ---------------------------------------------------------------------------

/** Watts, or em-dash when zero/falsy. */
export function formatPower(w: number): string {
  return w > 0 ? `${w} W` : '—';
}

// ---------------------------------------------------------------------------
// Duration variants (seconds → human string)
// ---------------------------------------------------------------------------

/**
 * Compact duration for workout segment labels: "4m 30s", "2m", "45s".
 * Used in WorkoutBuilder, AIWorkoutDesigner.
 */
export function formatDurShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

/**
 * Compact duration without seconds for workout totals: "1h 30m", "45 min".
 * Used in WorkoutLibrary, WorkoutPicker, TrainingCalendar, TrainingPlans.
 */
export function formatDurMin(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

/**
 * Compact duration, shows seconds when < 1 hour: "1h 30m", "45m 10s", "30m".
 * Used in WorkoutBuilder.
 */
export function formatDurSec(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (s > 0) return `${m}m ${s}s`;
  return `${m}m`;
}

/**
 * Clock format for workout HUD countdown: "m:ss".
 * Used in WorkoutHUD.
 */
export function formatSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/**
 * Axis/tooltip time for charts: "h:mm" or "m:ss".
 * Used in WorkoutPowerProfile.
 */
export function formatTimeShort(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** Unix timestamp (ms) → "Jan 1, 2025". Returns "—" when null/zero. */
export function formatDate(unixMs: number | null | undefined): string {
  if (!unixMs) return '—';
  return new Date(unixMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Unix timestamp (ms) → "Jan 1" (no year). */
export function formatDateShort(unixMs: number): string {
  return new Date(unixMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
