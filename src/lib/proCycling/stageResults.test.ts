/**
 * Unit tests for stageResults.ts — Wave 34.C
 * Pure — no network, no React, no stores.
 */

import { describe, it, expect } from 'vitest';
import {
  STAGE_RESULTS,
  findStageResults,
  type StageResults,
} from '@/lib/proCycling/stageResults';

// ---------------------------------------------------------------------------
// STAGE_RESULTS shape
// ---------------------------------------------------------------------------

describe('STAGE_RESULTS', () => {
  it('is a non-empty record with at least 13 stage entries', () => {
    const keys = Object.keys(STAGE_RESULTS);
    expect(keys.length).toBeGreaterThanOrEqual(13);
  });

  it('contains the Giro 2024 Stage 16 (Mortirolo) entry', () => {
    expect('wt-giro-2024-s16' in STAGE_RESULTS).toBe(true);
  });

  it('contains the TdF 2024 Stage 19 (Isola 2000) entry', () => {
    expect('wt-tdf-2024-s19' in STAGE_RESULTS).toBe(true);
  });

  it('contains the Vuelta 2023 Stage 13 (Tourmalet) entry', () => {
    expect('wt-vuelta-2023-s13' in STAGE_RESULTS).toBe(true);
  });

  it('each entry has stageId, year, and at least 1 result', () => {
    for (const [key, sr] of Object.entries(STAGE_RESULTS)) {
      expect(typeof sr.stageId).toBe('string');
      expect(sr.stageId).toBe(key); // key must match the embedded stageId
      expect(typeof sr.year).toBe('number');
      expect(sr.year).toBeGreaterThan(2000);
      expect(Array.isArray(sr.results)).toBe(true);
      expect(sr.results.length).toBeGreaterThan(0);
    }
  });

  it('each result has a valid rider with name, team, nationality, colorways', () => {
    for (const sr of Object.values(STAGE_RESULTS)) {
      for (const finisher of sr.results) {
        expect(typeof finisher.rider.name).toBe('string');
        expect(finisher.rider.name.length).toBeGreaterThan(0);
        expect(typeof finisher.rider.team).toBe('string');
        expect(finisher.rider.nationality).toHaveLength(3);
        // colorways must have all 6 fields
        const c = finisher.rider.colorways;
        expect(typeof c.frame).toBe('string');
        expect(typeof c.wheel).toBe('string');
        expect(typeof c.kit).toBe('string');
        expect(typeof c.skin).toBe('string');
        expect(typeof c.helmet).toBe('string');
        expect(typeof c.accent).toBe('string');
      }
    }
  });

  it('each result has positive finishTimeSec and valid rank', () => {
    for (const sr of Object.values(STAGE_RESULTS)) {
      for (const finisher of sr.results) {
        expect(finisher.finishTimeSec).toBeGreaterThan(0);
        expect(finisher.rank).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('results within a stage are ordered by ascending rank', () => {
    for (const sr of Object.values(STAGE_RESULTS)) {
      for (let i = 1; i < sr.results.length; i++) {
        expect(sr.results[i].rank).toBeGreaterThanOrEqual(sr.results[i - 1].rank);
      }
    }
  });

  it('rank 1 finisher has the lowest finishTimeSec within the stage', () => {
    for (const sr of Object.values(STAGE_RESULTS)) {
      const winner = sr.results.find((r) => r.rank === 1);
      if (!winner) continue;
      for (const finisher of sr.results) {
        expect(finisher.finishTimeSec).toBeGreaterThanOrEqual(winner.finishTimeSec);
      }
    }
  });

  it('each stage has exactly 10 curated finishers', () => {
    for (const sr of Object.values(STAGE_RESULTS)) {
      expect(sr.results).toHaveLength(10);
    }
  });
});

// ---------------------------------------------------------------------------
// findStageResults
// ---------------------------------------------------------------------------

describe('findStageResults', () => {
  it('returns StageResults for a known stage id', () => {
    const result = findStageResults('wt-tdf-2024-s19');
    expect(result).not.toBeNull();
    expect((result as StageResults).stageId).toBe('wt-tdf-2024-s19');
  });

  it('returns null for an unknown / unmapped stage id', () => {
    expect(findStageResults('wt-fake-stage-99')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(findStageResults('')).toBeNull();
  });

  it('returns results with the correct year for each known stage', () => {
    expect(findStageResults('wt-giro-2024-s16')?.year).toBe(2024);
    expect(findStageResults('wt-tdf-2024-s19')?.year).toBe(2024);
    expect(findStageResults('wt-vuelta-2023-s13')?.year).toBe(2023);
  });
});

// ---------------------------------------------------------------------------
// Specific stage data sanity checks
// ---------------------------------------------------------------------------

describe('TdF 2024 S19 specific data', () => {
  const sr = STAGE_RESULTS['wt-tdf-2024-s19'];

  it('stage winner is Pogacar', () => {
    const winner = sr.results.find((r) => r.rank === 1);
    expect(winner?.rider.name).toContain('Pogacar');
  });

  it('rank 2 finisher has finishTimeSec >= rank 1', () => {
    const w = sr.results.find((r) => r.rank === 1)!;
    const p2 = sr.results.find((r) => r.rank === 2)!;
    expect(p2.finishTimeSec).toBeGreaterThanOrEqual(w.finishTimeSec);
  });

  it('bonusTimeSec is defined and positive for top 3', () => {
    const top3 = sr.results.filter((r) => r.rank <= 3);
    for (const r of top3) {
      expect(r.bonusTimeSec).toBeDefined();
      expect(r.bonusTimeSec!).toBeGreaterThan(0);
    }
  });
});

describe('Giro 2024 S16 specific data', () => {
  const sr = STAGE_RESULTS['wt-giro-2024-s16'];

  it('stage winner is Pogacar', () => {
    const winner = sr.results.find((r) => r.rank === 1);
    expect(winner?.rider.name).toContain('Pogacar');
  });

  it('finishTimeSec for winner is plausible (> 3 hours for a 206 km stage)', () => {
    const winner = sr.results.find((r) => r.rank === 1)!;
    expect(winner.finishTimeSec).toBeGreaterThan(3 * 3600);
  });
});

describe('Vuelta 2023 S13 specific data', () => {
  const sr = STAGE_RESULTS['wt-vuelta-2023-s13'];

  it('stage winner is Kuss', () => {
    const winner = sr.results.find((r) => r.rank === 1);
    expect(winner?.rider.name).toContain('Kuss');
  });

  it('Vingegaard and Roglic finish close to Kuss (within 30 s)', () => {
    const kuss = sr.results.find((r) => r.rank === 1)!;
    const v = sr.results.find((r) => r.rider.name.includes('Vingegaard'))!;
    const ro = sr.results.find((r) => r.rider.name.includes('Roglic'))!;
    expect(v.finishTimeSec - kuss.finishTimeSec).toBeLessThanOrEqual(30);
    expect(ro.finishTimeSec - kuss.finishTimeSec).toBeLessThanOrEqual(30);
  });
});
