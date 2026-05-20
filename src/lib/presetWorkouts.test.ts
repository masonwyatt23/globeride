import { describe, it, expect } from 'vitest';
import { PRESET_WORKOUTS, DAILY_WORKOUT_ID, getPreset } from '@/lib/presetWorkouts';
import { totalDurationSec, estimateTSS } from '@/lib/workout';

describe('PRESET_WORKOUTS catalog', () => {
  it('exposes a non-empty catalog', () => {
    expect(PRESET_WORKOUTS.length).toBeGreaterThan(0);
  });

  it('every preset has the source tag set to "preset"', () => {
    for (const w of PRESET_WORKOUTS) {
      expect(w.source).toBe('preset');
    }
  });

  it('every preset id starts with "preset-" and is unique', () => {
    const ids = PRESET_WORKOUTS.map((w) => w.id);
    for (const id of ids) {
      expect(id.startsWith('preset-')).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset has at least one segment and every segment a positive duration', () => {
    for (const w of PRESET_WORKOUTS) {
      expect(w.segments.length).toBeGreaterThan(0);
      for (const s of w.segments) {
        expect(s.durationSec).toBeGreaterThan(0);
      }
    }
  });

  it('every preset has a unique segment-id within its own segments array', () => {
    for (const w of PRESET_WORKOUTS) {
      const segIds = w.segments.map((s) => s.id);
      expect(new Set(segIds).size).toBe(segIds.length);
    }
  });

  it('every preset fits the 15–45 minute window', () => {
    for (const w of PRESET_WORKOUTS) {
      const min = totalDurationSec(w) / 60;
      expect(min, `${w.name} duration`).toBeGreaterThanOrEqual(15);
      expect(min, `${w.name} duration`).toBeLessThanOrEqual(45);
    }
  });

  it('every preset has a positive TSS at a reasonable FTP', () => {
    for (const w of PRESET_WORKOUTS) {
      expect(estimateTSS(w, 220), `${w.name} TSS`).toBeGreaterThan(0);
    }
  });

  it('starts with the flagship Daily 30 Easy', () => {
    expect(PRESET_WORKOUTS[0].id).toBe(DAILY_WORKOUT_ID);
  });
});

describe('Daily 30 Easy', () => {
  it('is exactly 30 minutes long', () => {
    const daily = getPreset(DAILY_WORKOUT_ID);
    expect(daily).toBeDefined();
    expect(totalDurationSec(daily!) / 60).toBe(30);
  });

  it('has warmup, steady-Z2 main, and cooldown segments', () => {
    const daily = getPreset(DAILY_WORKOUT_ID)!;
    const kinds = daily.segments.map((s) => s.kind);
    expect(kinds).toContain('warmup');
    expect(kinds).toContain('steady');
    expect(kinds).toContain('cooldown');
  });

  it("the main set's intensity sits in Z2 (60–75% FTP)", () => {
    const daily = getPreset(DAILY_WORKOUT_ID)!;
    const main = daily.segments.find((s) => s.kind === 'steady')!;
    expect(main.target.type).toBe('ftpPct');
    if (main.target.type === 'ftpPct') {
      expect(main.target.value).toBeGreaterThanOrEqual(0.6);
      expect(main.target.value).toBeLessThanOrEqual(0.75);
    }
  });
});

describe('getPreset', () => {
  it('returns the preset by id', () => {
    expect(getPreset(DAILY_WORKOUT_ID)?.id).toBe(DAILY_WORKOUT_ID);
  });

  it('returns undefined for an unknown id', () => {
    expect(getPreset('preset-does-not-exist')).toBeUndefined();
  });
});
