/**
 * Unit tests for worldTourStages.ts — Wave 38.C
 * Pure — no network, no React, no stores.
 */

import { describe, it, expect } from 'vitest';
import { WORLD_TOUR_STAGES } from '@/lib/worldTourStages';

describe('WORLD_TOUR_STAGES catalogue', () => {
  it('has at least 20 entries', () => {
    expect(WORLD_TOUR_STAGES.length).toBeGreaterThanOrEqual(20);
  });

  it('every entry has a unique route id', () => {
    const ids = WORLD_TOUR_STAGES.map((s) => s.route.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every route has at least 2 GPS points', () => {
    for (const stage of WORLD_TOUR_STAGES) {
      expect(stage.route.points.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every route has positive totalDistance', () => {
    for (const stage of WORLD_TOUR_STAGES) {
      expect(stage.route.totalDistance).toBeGreaterThan(0);
    }
  });

  it('every stage info has required string fields', () => {
    for (const stage of WORLD_TOUR_STAGES) {
      const { info } = stage;
      expect(typeof info.name).toBe('string');
      expect(info.name.length).toBeGreaterThan(0);
      expect(typeof info.region).toBe('string');
      expect(info.region.length).toBeGreaterThan(0);
      expect(typeof info.description).toBe('string');
      expect(info.description.length).toBeGreaterThan(0);
      expect(typeof info.heroNarrative).toBe('string');
      expect(info.heroNarrative.length).toBeGreaterThan(0);
    }
  });

  it('every stage has a valid grandTour value', () => {
    const valid = new Set(['tour', 'giro', 'vuelta']);
    for (const stage of WORLD_TOUR_STAGES) {
      expect(valid.has(stage.info.grandTour)).toBe(true);
    }
  });

  it('every stage has a valid difficulty value', () => {
    const valid = new Set(['flat', 'hilly', 'mountain', 'queen']);
    for (const stage of WORLD_TOUR_STAGES) {
      expect(valid.has(stage.info.difficulty)).toBe(true);
    }
  });

  it('every stage has a plausible year (2010–2030)', () => {
    for (const stage of WORLD_TOUR_STAGES) {
      expect(stage.info.year).toBeGreaterThanOrEqual(2010);
      expect(stage.info.year).toBeLessThanOrEqual(2030);
    }
  });

  it('every stage has at least one keyClimb', () => {
    for (const stage of WORLD_TOUR_STAGES) {
      expect(Array.isArray(stage.info.keyClimbs)).toBe(true);
      expect(stage.info.keyClimbs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every stage has positive distanceKm and ascentM', () => {
    for (const stage of WORLD_TOUR_STAGES) {
      expect(stage.info.distanceKm).toBeGreaterThan(0);
      expect(stage.info.ascentM).toBeGreaterThan(0);
    }
  });

  it('spectatorClimbs (when present) have valid start/end distances', () => {
    for (const stage of WORLD_TOUR_STAGES) {
      const crowds = stage.info.spectatorClimbs;
      if (!crowds) continue;
      for (const zone of crowds) {
        expect(zone.startDistance).toBeGreaterThanOrEqual(0);
        expect(zone.endDistance).toBeGreaterThan(zone.startDistance);
        expect(zone.densityPerKm).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Spot-checks for Wave 38.C additions
// ---------------------------------------------------------------------------

describe('WORLD_TOUR_STAGES — 38.C entries present', () => {
  const ids = new Set(WORLD_TOUR_STAGES.map((s) => s.route.id));

  it('includes TdF 2023 S17 (Courchevel / La Loze)', () =>
    expect(ids.has('wt-tdf-2023-s17')).toBe(true));

  it('includes TdF 2022 S12 (Alpe d\'Huez)', () =>
    expect(ids.has('wt-tdf-2022-s12')).toBe(true));

  it('includes TdF 2021 S11 (Mont Ventoux ×2)', () =>
    expect(ids.has('wt-tdf-2021-s11')).toBe(true));

  it('includes Paris-Roubaix 2024', () =>
    expect(ids.has('wt-paris-roubaix-2024')).toBe(true));

  it('includes Tour of Flanders 2024', () =>
    expect(ids.has('wt-flanders-2024')).toBe(true));

  it('includes Liège-Bastogne-Liège 2024', () =>
    expect(ids.has('wt-liege-2024')).toBe(true));

  it('includes Strade Bianche 2024', () =>
    expect(ids.has('wt-strade-bianche-2024')).toBe(true));

  it('includes Giro 2025 S20 (Stelvio)', () =>
    expect(ids.has('wt-giro-2025-s20')).toBe(true));

  it('includes Vuelta 2024 S17 (Moncalvillo)', () =>
    expect(ids.has('wt-vuelta-2024-s17')).toBe(true));

  it('includes Tour Down Under 2024 S6', () =>
    expect(ids.has('wt-tdu-2024-s6')).toBe(true));

  it('includes Tour of California 2023 S5 (Big Sur)', () =>
    expect(ids.has('wt-toc-2023-s5')).toBe(true));

  it('includes Volta Catalunya 2024 S5 (Arcalís)', () =>
    expect(ids.has('wt-volta-2024-s5')).toBe(true));

  it('includes Vuelta 2024 S13 (Lagos de Covadonga)', () =>
    expect(ids.has('wt-vuelta-2024-s13')).toBe(true));
});
