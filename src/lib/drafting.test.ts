import { describe, it, expect } from 'vitest';
import { computeDraftState, applyDraftToPower } from '@/lib/drafting';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROUTE_TOTAL = 10_000; // 10 km — arbitrary, not used in core logic yet

/** Shorthand: build a call to computeDraftState. */
function draft(
  riderDist: number,
  riderHeading: number,
  others: { id: string; distance: number; heading: number }[],
) {
  return computeDraftState({
    riderDistance: riderDist,
    riderHeading: riderHeading,
    others,
    routeTotalDistance: ROUTE_TOTAL,
  });
}

// ---------------------------------------------------------------------------
// 1. No one ahead — no draft
// ---------------------------------------------------------------------------

describe('computeDraftState — not behind anyone', () => {
  it('returns inactive state when others array is empty', () => {
    const result = draft(500, 0, []);
    expect(result.active).toBe(false);
    expect(result.savingPct).toBe(0);
    expect(result.leaderId).toBeNull();
    expect(result.gapMeters).toBe(0);
  });

  it('returns inactive when the only other rider is behind the rider (negative gap)', () => {
    // other.distance < riderDistance → gap is negative → skip
    const result = draft(500, 0, [{ id: 'bot1', distance: 495, heading: 0 }]);
    expect(result.active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Rider ahead but gap is > 5 m — outside the draft bubble
// ---------------------------------------------------------------------------

describe('computeDraftState — behind but too far', () => {
  it('returns active when gap is exactly at the outer limit (5 m — edge of bubble)', () => {
    // The spec says 1.5 m ≤ gap ≤ 5 m inclusive. 5 m is the weakest valid draft.
    const result = draft(500, 0, [{ id: 'bot1', distance: 505, heading: 0 }]);
    // gap = 505 - 500 = 5 m → equals DRAFT_GAP_MAX → still qualifies (weakest saving 0.20)
    expect(result.active).toBe(true);
    expect(result.savingPct).toBeCloseTo(0.20, 5);
  });

  it('returns inactive when gap exceeds 5 m', () => {
    const result = draft(500, 0, [{ id: 'bot1', distance: 510, heading: 0 }]);
    expect(result.active).toBe(false);
  });

  it('returns inactive when gap is less than 1.5 m (too close — not behind wheel)', () => {
    const result = draft(500, 0, [{ id: 'bot1', distance: 501, heading: 0 }]);
    // gap = 1 m < DRAFT_GAP_MIN → skip
    expect(result.active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Behind one bot, heading agreement — draft is active
// ---------------------------------------------------------------------------

describe('computeDraftState — behind one bot in heading agreement', () => {
  it('activates draft at 2 m gap with correct saving', () => {
    // gap = 2 m, t = (2 - 1.5) / (5 - 1.5) = 0.5/3.5 ≈ 0.1429
    // saving = 0.35 - 0.1429 * 0.15 ≈ 0.3286
    const result = draft(500, 0, [{ id: 'niki', distance: 502, heading: 0 }]);
    expect(result.active).toBe(true);
    expect(result.leaderId).toBe('niki');
    expect(result.gapMeters).toBeCloseTo(2, 5);
    expect(result.savingPct).toBeCloseTo(0.35 - (0.5 / 3.5) * 0.15, 5);
  });

  it('saving is 0.35 at 1.5 m gap (strongest draft)', () => {
    const result = draft(500, Math.PI / 4, [{ id: 'bot-a', distance: 501.5, heading: Math.PI / 4 }]);
    expect(result.active).toBe(true);
    expect(result.savingPct).toBeCloseTo(0.35, 5);
  });

  it('heading within tolerance (< 0.35 rad) still activates draft', () => {
    // heading differs by 0.20 rad — within the 0.35 rad tolerance
    const result = draft(500, 0, [{ id: 'bot-b', distance: 503, heading: 0.20 }]);
    expect(result.active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Multiple riders — pick the closest (highest saving)
// ---------------------------------------------------------------------------

describe('computeDraftState — multiple riders, pick closest', () => {
  it('picks the rider with the smallest valid gap (highest saving)', () => {
    const result = draft(500, 0, [
      { id: 'far',   distance: 504, heading: 0 }, // gap 4 m
      { id: 'close', distance: 502, heading: 0 }, // gap 2 m ← better saving
    ]);
    expect(result.active).toBe(true);
    expect(result.leaderId).toBe('close');
    expect(result.gapMeters).toBeCloseTo(2, 5);
  });

  it('ignores out-of-range riders and still picks valid one', () => {
    const result = draft(500, 0, [
      { id: 'too-far',  distance: 510, heading: 0 }, // gap 10 m — out
      { id: 'behind',   distance: 498, heading: 0 }, // gap -2 m — behind
      { id: 'valid',    distance: 503, heading: 0 }, // gap 3 m — ok
    ]);
    expect(result.active).toBe(true);
    expect(result.leaderId).toBe('valid');
  });

  it('three valid riders returns the closest', () => {
    const result = draft(1000, 0, [
      { id: 'a', distance: 1004.5, heading: 0.1 }, // gap 4.5 m
      { id: 'b', distance: 1001.5, heading: 0.0 }, // gap 1.5 m ← closest
      { id: 'c', distance: 1003.0, heading: 0.2 }, // gap 3.0 m
    ]);
    expect(result.leaderId).toBe('b');
    expect(result.savingPct).toBeCloseTo(0.35, 5);
  });
});

// ---------------------------------------------------------------------------
// 5. Heading mismatch (cornering / switchback) — no draft
// ---------------------------------------------------------------------------

describe('computeDraftState — heading mismatch', () => {
  it('returns inactive when heading differs by more than 0.35 rad', () => {
    // 0.5 rad ≈ 28.6° — past the 20° threshold
    const result = draft(500, 0, [{ id: 'cornering', distance: 503, heading: 0.5 }]);
    expect(result.active).toBe(false);
  });

  it('returns inactive on a near-180° reversal (riders going opposite ways)', () => {
    const result = draft(500, 0, [{ id: 'opposite', distance: 503, heading: Math.PI }]);
    expect(result.active).toBe(false);
  });

  it('heading wrap: 350° and 5° are within tolerance (~15° ≈ 0.26 rad)', () => {
    const deg = (d: number) => (d * Math.PI) / 180;
    const result = draft(500, deg(350), [{ id: 'wrapped', distance: 503, heading: deg(5) }]);
    // |wrapAngle(5° - 350°)| = |wrapAngle(-345°)| = 15° = 0.26 rad < 0.35 → draft
    expect(result.active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. applyDraftToPower
// ---------------------------------------------------------------------------

describe('applyDraftToPower', () => {
  it('returns full power when savingPct is 0', () => {
    expect(applyDraftToPower(200, 0)).toBeCloseTo(200, 5);
  });

  it('applies 70 % of the saving to power', () => {
    // savingPct=0.35 → factor = 1 - 0.7*0.35 = 1 - 0.245 = 0.755
    expect(applyDraftToPower(200, 0.35)).toBeCloseTo(200 * 0.755, 4);
  });

  it('returns original power when savingPct is negative (guard)', () => {
    expect(applyDraftToPower(150, -0.1)).toBeCloseTo(150, 5);
  });
});
