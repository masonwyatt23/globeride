/**
 * Drafting physics — aerodynamic slipstream saving when riding closely
 * behind another rider (pace bot or ghost).
 *
 * Model basis:
 *   - Empirical: ~25–35 % total power reduction at 1–5 m behind a wheel.
 *   - Aero drag accounts for ~70 % of total resistance at typical group-ride
 *     speeds (~35 km/h flat). Rolling + gravity components are unaffected.
 *   - Saving scales linearly: 35 % at 1.5 m → 20 % at 5 m (gap to rear wheel).
 *   - Heading agreement required: riders must be moving in the same direction
 *     within 20° (0.35 rad). Switchbacks and hairpins break the draft.
 *
 * Power reduction formula:
 *   P_effective = P_steady × (1 − 0.7 × savingPct)
 *
 * The 0.7 factor isolates the aero term; gravity and rolling are left intact.
 */

/** Draft state produced each tick. */
export interface DraftState {
  /** True when the rider is actively drafting someone. */
  active: boolean;
  /** Fractional power saving, 0 → 0.35. */
  savingPct: number;
  /** ID of the rider whose wheel we're on (null when not drafting). */
  leaderId: string | null;
  /** Current gap to the leader's rear wheel, metres. */
  gapMeters: number;
}

/** A rider that could act as a drafter leader. */
export interface OtherRider {
  id: string;
  /** Distance along the route, metres. */
  distance: number;
  /** Heading along the route, radians. */
  heading: number;
}

/** Minimum gap to qualify for a draft (metres, front-to-rear-wheel). */
const DRAFT_GAP_MIN = 1.5;
/** Maximum gap beyond which the draft bubble is lost (metres). */
const DRAFT_GAP_MAX = 5.0;
/** Max heading divergence that still counts as "same direction" (radians ~20°). */
const HEADING_TOLERANCE_RAD = 0.35;

/**
 * Wrap a heading difference to the interval [-π, π].
 * Used so that e.g. 350° and 5° are only 10° apart, not 345°.
 */
function wrapAngle(delta: number): number {
  const twoPi = 2 * Math.PI;
  // Bring into [0, 2π) then shift to [-π, π).
  return ((delta % twoPi) + twoPi + Math.PI) % twoPi - Math.PI;
}

/**
 * Linear interpolation of the draft saving across the valid gap range.
 *
 *   gap = 1.5 m → saving = 0.35  (strongest — on the wheel)
 *   gap = 5.0 m → saving = 0.20  (weakest — edge of bubble)
 */
function gapToSaving(gapM: number): number {
  const t = (gapM - DRAFT_GAP_MIN) / (DRAFT_GAP_MAX - DRAFT_GAP_MIN); // 0 at 1.5m, 1 at 5m
  return 0.35 - t * (0.35 - 0.20); // 0.35 → 0.20
}

/** Inactive draft state — returned when no drafting is happening. */
const NO_DRAFT: DraftState = {
  active: false,
  savingPct: 0,
  leaderId: null,
  gapMeters: 0,
};

/**
 * Compute the current draft state given the rider's position and a list of
 * other riders (pace bots, ghosts, live multi-rider peers, opponents) that could act as leaders.
 *
 * @param args.riderDistance  Rider's distance along the route, metres.
 * @param args.riderHeading   Rider's heading, radians.
 * @param args.others         List of other riders with their distance + heading.
 * @param args.routeTotalDistance  Full route length (used for future wrap-around
 *                                 support — currently unused but part of the API
 *                                 contract for forward compatibility).
 */
export function computeDraftState(args: {
  riderDistance: number;
  riderHeading: number;
  others: OtherRider[];
  routeTotalDistance: number;
}): DraftState {
  const { riderDistance, riderHeading, others } = args;

  let bestSaving = 0;
  let bestGap = 0;
  let bestId: string | null = null;

  for (const other of others) {
    // Gap is positive only when the other rider is ahead (further along route).
    const gap = other.distance - riderDistance;
    if (gap < DRAFT_GAP_MIN || gap > DRAFT_GAP_MAX) continue;

    // Heading agreement check — must be within HEADING_TOLERANCE_RAD.
    const headingDiff = Math.abs(wrapAngle(other.heading - riderHeading));
    if (headingDiff > HEADING_TOLERANCE_RAD) continue;

    const saving = gapToSaving(gap);
    // Prefer the closest rider (strongest saving).
    if (saving > bestSaving) {
      bestSaving = saving;
      bestGap = gap;
      bestId = other.id;
    }
  }

  if (bestId === null) return NO_DRAFT;

  return {
    active: true,
    savingPct: bestSaving,
    leaderId: bestId,
    gapMeters: bestGap,
  };
}

/**
 * Apply an aerodynamic draft saving to a steady-state power requirement.
 *
 * Only the aero component (~70 % of total at group-ride speed) is reduced —
 * gravity and rolling resistance are unaffected.
 *
 *   P_effective = P × (1 − 0.7 × savingPct)
 *
 * @param steadyStatePowerW  Uncorrected power requirement, watts.
 * @param savingPct          Draft saving fraction 0–0.35.
 * @returns Effective required power after slipstream reduction, watts.
 */
export function applyDraftToPower(steadyStatePowerW: number, savingPct: number): number {
  if (savingPct <= 0) return steadyStatePowerW;
  return steadyStatePowerW * (1 - 0.7 * savingPct);
}
