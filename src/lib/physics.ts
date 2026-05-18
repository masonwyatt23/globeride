/**
 * Toy cycling-power model used by Demo Mode (no smart trainer present).
 *
 * Solve   P = m·g·(sinθ + Crr·cosθ)·v + ½·ρ·CdA·v³   for v, given target P.
 *
 * Defaults approximate an 80 kg rider+bike on tarmac, dropped bars, no wind.
 */
export interface DemoRiderParams {
  /** Combined mass of rider + bike, kg. */
  mass: number;
  /** Rolling-resistance coefficient. */
  crr: number;
  /** Air density, kg/m³. */
  rho: number;
  /** Drag-area product, m². */
  cdA: number;
}

export const DEFAULT_RIDER: DemoRiderParams = {
  mass: 80,
  crr: 0.005,
  rho: 1.225,
  cdA: 0.32,
};

/**
 * Solve the cycling power equation for forward velocity.
 * @param power Target rider power output, W.
 * @param gradePct Slope in percent (+ = uphill).
 * @param p Rider parameters.
 * @returns Velocity in m/s, clamped to a sane [1.0, 25] m/s range.
 */
export function solveVelocity(
  power: number,
  gradePct: number,
  p: DemoRiderParams = DEFAULT_RIDER,
): number {
  const g = 9.81;
  const theta = Math.atan(gradePct / 100);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  const a = 0.5 * p.rho * p.cdA;
  const b = p.mass * g * (sinT + p.crr * cosT);

  // Newton's method from a sensible seed.
  let v = Math.max(0.5, power / Math.max(b + 5, 5));
  for (let i = 0; i < 25; i++) {
    const f = a * v * v * v + b * v - power;
    const fp = 3 * a * v * v + b;
    const dv = f / Math.max(Math.abs(fp), 1e-6) * Math.sign(fp);
    v -= dv;
    if (v < 0.2) v = 0.2;
    if (Math.abs(dv) < 1e-3) break;
  }
  // On steep descents the cubic can blow up — clamp to ~90 km/h.
  return Math.max(1.0, Math.min(25, v));
}
