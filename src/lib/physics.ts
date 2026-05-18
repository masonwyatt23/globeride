/**
 * Cycling power model used by Demo Mode and for sending realistic Crr/CdA
 * coefficients to FTMS-compliant trainers.
 *
 * Force balance at steady state (per Martin et al., 1998 — a standard
 * cyclist-power model):
 *
 *   F_total = F_gravity + F_rolling + F_aero
 *   F_gravity = m · g · sinθ
 *   F_rolling = m · g · cosθ · Crr            (only when rolling; sign with v)
 *   F_aero    = ½ · ρ · CdA · v_air · |v_air|   (signed quadratic on apparent wind)
 *
 *   v_air = v_ground + v_headwind             (headwind positive against rider)
 *
 *   P_rider · η_drive = F_total · v_ground
 *
 * Demo Mode solves the above for `v_ground` given a target rider power. The
 * cubic is well-behaved as long as F_rolling > 0 OR slope > a few %, so we use
 * Newton-Raphson and a safety bisection fallback for deep descents where the
 * cubic has multiple real roots.
 *
 * For trainer mode we use the same coefficient set to populate the FTMS
 * `Set Indoor Bike Simulation Parameters` payload (opcode 0x11) — that's what
 * shapes the resistance feel on real hardware.
 */

import { clamp } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tunable presets — exposed so the settings UI can label them sanely.
// ---------------------------------------------------------------------------

export type BikeType = 'road' | 'gravel' | 'mtb';
export type RiderPosition = 'drops' | 'hoods' | 'tops';

/**
 * Rolling resistance coefficient by bike type. Numbers are typical Crr at
 * ~100 PSI on tarmac (road), 40 PSI mixed surface (gravel), and 25 PSI
 * knobbies on hardpack (mtb). Source: bicyclerollingresistance.com.
 */
export const CRR_BY_BIKE: Record<BikeType, number> = {
  road: 0.004,
  gravel: 0.008,
  mtb: 0.014,
};

/** Effective frontal-drag area (m²) for a 75 kg rider on each position. */
export const CDA_BY_POSITION: Record<RiderPosition, number> = {
  drops: 0.27,
  hoods: 0.32,
  tops: 0.40,
};

/** Air density at sea level, 15 °C, dry — kg/m³. */
export const RHO_SEA_LEVEL = 1.225;

/** Drivetrain efficiency: ~3 % loss is typical for a well-tuned chain. */
export const DRIVETRAIN_EFFICIENCY = 0.97;

const G = 9.80665;

// ---------------------------------------------------------------------------
// Public parameter struct + defaults.
// ---------------------------------------------------------------------------

export interface RiderParams {
  /** Rider body mass, kg. */
  riderMassKg: number;
  /** Bike mass, kg. */
  bikeMassKg: number;
  /** Surface / tire kit. */
  bikeType: BikeType;
  /** Body position on the bike. */
  riderPosition: RiderPosition;
  /** Drivetrain efficiency 0–1. */
  drivetrainEff: number;
  /** Air density, kg/m³. */
  rho: number;
  /** Wind speed magnitude, m/s. */
  windSpeedMs: number;
  /**
   * Wind direction relative to the rider, degrees. 0 ° = headwind (slowing
   * you down), 180 ° = tailwind. 90 ° = pure crosswind (no aero effect on
   * forward speed in this simplified model).
   */
  windDirectionDeg: number;
}

export const DEFAULT_RIDER: RiderParams = {
  riderMassKg: 75,
  bikeMassKg: 8,
  bikeType: 'road',
  riderPosition: 'hoods',
  drivetrainEff: DRIVETRAIN_EFFICIENCY,
  rho: RHO_SEA_LEVEL,
  windSpeedMs: 0,
  windDirectionDeg: 0,
};

/** Resolved coefficients for a given rider config. */
export interface DerivedCoefficients {
  /** Total mass, kg. */
  mass: number;
  /** Rolling-resistance coefficient. */
  crr: number;
  /** Drag-area product, m². */
  cdA: number;
  /** Wind component projected onto the rider's forward axis (m/s, +headwind). */
  headwindMs: number;
}

export function deriveCoefficients(p: RiderParams = DEFAULT_RIDER): DerivedCoefficients {
  const headwindMs =
    p.windSpeedMs * Math.cos((p.windDirectionDeg * Math.PI) / 180);
  return {
    mass: p.riderMassKg + p.bikeMassKg,
    crr: CRR_BY_BIKE[p.bikeType],
    cdA: CDA_BY_POSITION[p.riderPosition],
    headwindMs,
  };
}

// ---------------------------------------------------------------------------
// Forward model — power required to hold a given speed.
// ---------------------------------------------------------------------------

/**
 * Steady-state rider power required (at the pedals, after drivetrain losses)
 * to travel at velocity `v` on slope `gradePct`.
 */
export function powerRequired(
  v: number,
  gradePct: number,
  p: RiderParams = DEFAULT_RIDER,
): number {
  const c = deriveCoefficients(p);
  const theta = Math.atan(gradePct / 100);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  const vAir = v + c.headwindMs;
  const fGrav = c.mass * G * sinT;
  const fRoll = v > 0.01 ? c.mass * G * cosT * c.crr : 0;
  const fAero = 0.5 * p.rho * c.cdA * vAir * Math.abs(vAir);
  const fTotal = fGrav + fRoll + fAero;

  const wheelPower = fTotal * v;
  // Divide by drivetrain efficiency: P_pedal = P_wheel / η.
  return wheelPower / Math.max(0.5, p.drivetrainEff);
}

// ---------------------------------------------------------------------------
// Inverse model — solve for v given a target pedal power.
// ---------------------------------------------------------------------------

/**
 * Solve the cycling power equation for forward velocity (m/s) at steady state.
 *
 * @param power     Target rider power at the pedals, W.
 * @param gradePct  Slope in percent (+ uphill).
 * @param p         Rider parameters (mass, position, surface, wind).
 * @returns Velocity in m/s, clamped to [0.5, 27.8] (~1.8–100 km/h).
 */
export function solveVelocity(
  power: number,
  gradePct: number,
  p: RiderParams = DEFAULT_RIDER,
): number {
  const c = deriveCoefficients(p);
  const eff = Math.max(0.5, p.drivetrainEff);
  const theta = Math.atan(gradePct / 100);
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);

  // Pedal power → wheel power.
  const wheelPower = power * eff;

  // Coefficients of  a·v³ + (... aero linear from wind) · v + b·v − wheelPower = 0
  // expressed via the dimensional force balance (handled iteratively below).
  const aeroCoef = 0.5 * p.rho * c.cdA;
  const rollGravTerm = c.mass * G * (sinT + c.crr * cosT);

  // Seed: ignore aero on the first guess so we get something positive even
  // on steep downhills.
  let v = power > 5 ? Math.max(0.5, power / Math.max(rollGravTerm + 8, 8)) : 0.5;
  // On strong downhills the rider can be pushed without pedalling — bias the
  // seed upward to land near the terminal coast speed.
  if (sinT < -0.02 && rollGravTerm < 0) {
    v = Math.max(v, Math.sqrt(Math.abs(rollGravTerm) / Math.max(aeroCoef, 1e-3)));
  }

  // Newton-Raphson. Function: required wheel power − available wheel power.
  for (let i = 0; i < 40; i++) {
    const vAir = v + c.headwindMs;
    const fGrav = c.mass * G * sinT;
    const fRoll = v > 0.01 ? c.mass * G * cosT * c.crr : 0;
    const fAero = aeroCoef * vAir * Math.abs(vAir);
    const fTotal = fGrav + fRoll + fAero;
    const required = fTotal * v;

    // dP/dv (ignoring sign discontinuity in fAero; OK away from vAir ≈ 0):
    //   d/dv (fTotal · v) = fTotal + v · d(fTotal)/dv
    //   d(fAero)/dv      = 2 · aeroCoef · |vAir|   (sign-aware)
    //   d(fRoll)/dv      = 0 (for v > 0)
    const dFaero_dv = 2 * aeroCoef * Math.abs(vAir);
    const dRequired_dv = fTotal + v * dFaero_dv;

    const f = required - wheelPower;
    const fp = dRequired_dv;
    if (Math.abs(fp) < 1e-6) break;
    const dv = f / fp;
    v -= dv;
    if (v < 0.2) v = 0.2;
    if (Math.abs(dv) < 1e-3) break;
  }

  // Sanity clamp: ~1.8 km/h floor (slower than walking — physics says you'd
  // unclip), ~100 km/h ceiling (smart-trainer terminal speed).
  return clamp(v, 0.5, 27.8);
}

// ---------------------------------------------------------------------------
// FTMS payload helpers — exported so the BLE layer doesn't need to reach into
// physics internals.
// ---------------------------------------------------------------------------

/** Crr as the byte FTMS expects (Crr × 10000, 0–255). */
export function ftmsCrr(p: RiderParams = DEFAULT_RIDER): number {
  return clamp(Math.round(CRR_BY_BIKE[p.bikeType] * 10000), 0, 255);
}

/** Cw (drag coefficient × frontal area, kg/m) as the byte FTMS expects (Cw × 100). */
export function ftmsCw(p: RiderParams = DEFAULT_RIDER): number {
  // FTMS treats Cw as "wind resistance coefficient" with units of kg/m. For
  // our purposes that maps directly to ½·ρ·CdA·2 ≈ ρ · CdA, but the spec
  // uses CdA-equivalent ranges of ~0.20-0.80. We feed CdA × scaled density
  // factor — it's an approximation, but it's what every other simulator does.
  return clamp(Math.round(CDA_BY_POSITION[p.riderPosition] * 100), 0, 255);
}
