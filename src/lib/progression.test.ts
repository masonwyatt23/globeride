import { describe, it, expect } from 'vitest';
import { xpForLevel, xpForRide, levelForXp, xpProgressInLevel } from '@/lib/progression';

// ---------------------------------------------------------------------------
// xpForLevel
// ---------------------------------------------------------------------------

describe('xpForLevel', () => {
  it('level 1 requires 1,000 XP', () => {
    expect(xpForLevel(1)).toBe(1_000);
  });

  it('level 5 requires 15,000 XP', () => {
    expect(xpForLevel(5)).toBe(15_000);
  });

  it('level 10 requires 55,000 XP', () => {
    expect(xpForLevel(10)).toBe(55_000);
  });

  it('level 20 requires 210,000 XP', () => {
    expect(xpForLevel(20)).toBe(210_000);
  });

  it('is strictly increasing', () => {
    for (let l = 1; l < 20; l++) {
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
    }
  });

  it('clamps fractional input to floor', () => {
    expect(xpForLevel(1.9)).toBe(xpForLevel(1));
  });
});

// ---------------------------------------------------------------------------
// xpForRide
// ---------------------------------------------------------------------------

describe('xpForRide', () => {
  it('awards distance XP at 1 per 100 m', () => {
    const xp = xpForRide({ distanceM: 10_000, ascentM: 0, workoutCompleted: false });
    expect(xp).toBe(100);
  });

  it('awards ascent XP at 0.5 per meter', () => {
    const xp = xpForRide({ distanceM: 0, ascentM: 200, workoutCompleted: false });
    expect(xp).toBe(100);
  });

  it('awards 250 XP for a completed workout', () => {
    const withWorkout = xpForRide({ distanceM: 0, ascentM: 0, workoutCompleted: true });
    const without     = xpForRide({ distanceM: 0, ascentM: 0, workoutCompleted: false });
    expect(withWorkout - without).toBe(250);
  });

  it('combines all components', () => {
    // 10 km distance = 100 XP, 100 m ascent = 50 XP, workout = 250 XP → 400
    const xp = xpForRide({ distanceM: 10_000, ascentM: 100, workoutCompleted: true });
    expect(xp).toBe(400);
  });

  it('returns 0 for a zero-effort ride', () => {
    expect(xpForRide({ distanceM: 0, ascentM: 0, workoutCompleted: false })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// levelForXp
// ---------------------------------------------------------------------------

describe('levelForXp', () => {
  it('returns level 1 at 0 XP', () => {
    expect(levelForXp(0)).toBe(1);
  });

  it('returns level 1 just below threshold', () => {
    expect(levelForXp(xpForLevel(1) - 1)).toBe(1);
  });

  it('returns level 2 at exactly the threshold', () => {
    expect(levelForXp(xpForLevel(2))).toBe(2);
  });

  it('correctly detects level 10', () => {
    expect(levelForXp(xpForLevel(10))).toBe(10);
  });

  it('caps at level 50', () => {
    expect(levelForXp(999_999_999)).toBe(50);
  });

  it('is monotonically non-decreasing', () => {
    let prev = levelForXp(0);
    for (let xp = 100; xp <= 300_000; xp += 100) {
      const cur = levelForXp(xp);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});

// ---------------------------------------------------------------------------
// xpProgressInLevel
// ---------------------------------------------------------------------------

describe('xpProgressInLevel', () => {
  it('starts at level 1, 0% progress at 0 XP', () => {
    const p = xpProgressInLevel(0);
    expect(p.level).toBe(1);
    expect(p.into).toBe(0);
    expect(p.pct).toBe(0);
  });

  it('reports correct progress midway through level 1', () => {
    // Level 1 floor = 0, ceil = xpForLevel(2) = 3000.
    // At 500 XP: into = 500, needed = 3000, pct ≈ 0.167
    const p = xpProgressInLevel(500);
    expect(p.level).toBe(1);
    expect(p.into).toBe(500);
    expect(p.needed).toBe(3000);
    expect(p.pct).toBeCloseTo(500 / 3000, 5);
  });

  it('stays at level 1 at 1000 XP (level 2 threshold is 3000)', () => {
    // xpForLevel(2) = 500*2*3 = 3000, so 1000 XP is still level 1
    const p = xpProgressInLevel(1_000);
    expect(p.level).toBe(1);
    expect(p.into).toBe(1000);
  });

  it('transitions to level 2 at exactly 3000 XP', () => {
    const p = xpProgressInLevel(3_000);
    expect(p.level).toBe(2);
    expect(p.into).toBe(0);
  });

  it('pct is always in [0, 1]', () => {
    for (const xp of [0, 999, 1000, 1500, 15_000, 55_000, 210_000]) {
      const { pct } = xpProgressInLevel(xp);
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(1);
    }
  });
});
