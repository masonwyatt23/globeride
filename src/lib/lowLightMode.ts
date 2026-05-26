/**
 * lowLightMode.ts — Auto-detection and resolution for the Low-Light HUD.
 *
 * Rules:
 *   - 'auto': enable between 18:00–06:00 local time
 *   - 'on':   always enable
 *   - 'off':  always disable
 */

export type LowLightSetting = 'auto' | 'on' | 'off';

/**
 * Returns true when the given wall-clock time falls in low-light hours
 * (18:00 ≤ hour < 24, or 0 ≤ hour < 6 — i.e. evening + night + early morning).
 *
 * @param now  Date to check; defaults to `new Date()`.
 */
export function isLowLightHour(now: Date = new Date()): boolean {
  const h = now.getHours();
  return h >= 18 || h < 6;
}

/**
 * Resolve the user's three-state setting to a boolean.
 *
 * @param setting  'auto' | 'on' | 'off'
 * @param now      Optional Date for testability; defaults to `new Date()`.
 */
export function resolveLowLightMode(setting: LowLightSetting, now?: Date): boolean {
  if (setting === 'on')  return true;
  if (setting === 'off') return false;
  // 'auto'
  return isLowLightHour(now);
}
