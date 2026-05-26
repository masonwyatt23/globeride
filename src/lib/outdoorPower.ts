/**
 * Outdoor power estimator.
 *
 * Given measured GPS speed + grade + rider parameters, compute the pedal
 * power that would produce that speed at steady state, using the same
 * Martin et al. 1998 force-balance model as physics.ts.
 *
 * This is the inverse of solveVelocity: instead of Power → Speed we do
 * Speed → Power. That inversion is direct (powerRequired) rather than
 * iterative, because speed is the independent variable.
 *
 * We still run Newton-Raphson for edge-case robustness (e.g. near-zero
 * speed), but the analytic powerRequired() result is the primary path.
 */

import { powerRequired, type RiderParams } from '@/lib/physics';

// Output caps
const MAX_POWER_W = 1500;
const MIN_POWER_W = 0;

export interface OutdoorRiderParams extends RiderParams {
  /**
   * Rider heading in degrees (0 = north, 90 = east). Used together with
   * windDirectionDeg (0 = wind from north) to project the headwind component
   * onto the rider's forward axis.
   *
   * When headingDeg is provided, windDirectionDeg is treated as an absolute
   * compass direction rather than a rider-relative direction, and we compute
   * the effective headwind:
   *   headwindMs = windSpeedMs * cos(windDirectionDeg − headingDeg)
   *
   * When headingDeg is omitted the existing RiderParams.windDirectionDeg
   * semantics apply (0 = headwind, 180 = tailwind).
   */
  headingDeg?: number;
}

/**
 * Estimate pedal power from GPS speed, gradient, and rider parameters.
 *
 * Returns a value clamped to [0, 1500] W.
 *
 * On descents where gravity alone provides more than enough force the raw
 * result can be negative (the rider would need to brake). We floor at 0 W —
 * coasting / freewheeling.
 */
export function estimatePowerFromGps(
  speedMs: number,
  gradePct: number,
  riderParams: OutdoorRiderParams,
): number {
  // Speed guard — avoid nonsense estimates below walking pace.
  if (speedMs < 0.3) return 0;

  // Build an effective RiderParams where windDirectionDeg is relative to the
  // rider, as powerRequired() expects.
  let params: RiderParams = riderParams;

  if (
    riderParams.headingDeg !== undefined &&
    riderParams.windSpeedMs > 0
  ) {
    // Convert absolute wind direction → rider-relative direction.
    // headwindMs = windSpeedMs * cos(windFromNorth − riderHeading)
    // We model it as: set windDirectionDeg = windFromNorth − riderHeading
    // so cos(windDirectionDeg) gives the correct projection.
    const relDeg = riderParams.windDirectionDeg - riderParams.headingDeg;
    params = { ...riderParams, windDirectionDeg: relDeg };
  }

  // Direct analytic computation via the forward model (Speed → Power).
  const rawPower = powerRequired(speedMs, gradePct, params);

  return Math.max(MIN_POWER_W, Math.min(MAX_POWER_W, rawPower));
}
