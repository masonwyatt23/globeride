/**
 * Unit tests for iconicRoutes.ts — Wave 38.C
 * Pure — no network, no React, no stores.
 */

import { describe, it, expect } from 'vitest';
import { ICONIC_ROUTES } from '@/lib/iconicRoutes';

describe('ICONIC_ROUTES catalogue', () => {
  it('has at least 50 entries', () => {
    expect(ICONIC_ROUTES.length).toBeGreaterThanOrEqual(50);
  });

  it('every entry has a unique route id', () => {
    const ids = ICONIC_ROUTES.map((r) => r.route.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every entry has a non-empty climbName and region', () => {
    for (const entry of ICONIC_ROUTES) {
      expect(entry.climbName.length).toBeGreaterThan(0);
      expect(entry.region.length).toBeGreaterThan(0);
    }
  });

  it('every route has at least 2 GPS points', () => {
    for (const entry of ICONIC_ROUTES) {
      expect(entry.route.points.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every route point has valid lat, lon, ele and non-negative distance', () => {
    for (const entry of ICONIC_ROUTES) {
      for (const pt of entry.route.points) {
        expect(pt.lat).toBeGreaterThan(-90);
        expect(pt.lat).toBeLessThan(90);
        expect(pt.lon).toBeGreaterThan(-180);
        expect(pt.lon).toBeLessThan(180);
        expect(typeof pt.ele).toBe('number');
        expect(pt.distance).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('every route has positive totalDistance', () => {
    for (const entry of ICONIC_ROUTES) {
      expect(entry.route.totalDistance).toBeGreaterThan(0);
    }
  });

  it('every route has non-negative ascent', () => {
    for (const entry of ICONIC_ROUTES) {
      expect(entry.route.ascent).toBeGreaterThanOrEqual(0);
    }
  });

  it('every entry has a valid difficulty tag', () => {
    const valid = new Set(['hors catégorie', 'category 1', 'category 2']);
    for (const entry of ICONIC_ROUTES) {
      expect(valid.has(entry.difficulty)).toBe(true);
    }
  });

  it('every entry has avgGradient and maxGradient > 0', () => {
    for (const entry of ICONIC_ROUTES) {
      expect(entry.avgGradient).toBeGreaterThan(0);
      expect(entry.maxGradient).toBeGreaterThan(0);
    }
  });

  it('maxGradient >= avgGradient for every entry', () => {
    for (const entry of ICONIC_ROUTES) {
      expect(entry.maxGradient).toBeGreaterThanOrEqual(entry.avgGradient);
    }
  });
});

// ---------------------------------------------------------------------------
// Geography coverage — spot-checks for Wave 38.C additions
// ---------------------------------------------------------------------------

describe('ICONIC_ROUTES — geography coverage', () => {
  const ids = new Set(ICONIC_ROUTES.map((r) => r.route.id));

  // Asia
  it('includes Mount Fuji', () => expect(ids.has('iconic-mount-fuji')).toBe(true));
  it('includes Hakone Pass', () => expect(ids.has('iconic-hakone-pass')).toBe(true));
  it('includes Hehuanshan (Taiwan)', () => expect(ids.has('iconic-taroko-hehuanshan')).toBe(true));
  it('includes Cameron Highlands', () => expect(ids.has('iconic-cameron-highlands')).toBe(true));
  it('includes Mount Hiei', () => expect(ids.has('iconic-kyoto-hiei')).toBe(true));

  // North America
  it('includes Pikes Peak', () => expect(ids.has('iconic-pikes-peak')).toBe(true));
  it('includes Mount Hamilton', () => expect(ids.has('iconic-mt-hamilton')).toBe(true));
  it('includes Mount Lemmon', () => expect(ids.has('iconic-mt-lemmon')).toBe(true));
  it('includes Mont-Tremblant', () => expect(ids.has('iconic-mont-tremblant')).toBe(true));
  it('includes Mauna Kea', () => expect(ids.has('iconic-mauna-kea')).toBe(true));

  // Australia / Oceania
  it('includes Mount Buller', () => expect(ids.has('iconic-mt-buller')).toBe(true));
  it('includes Mount Hotham', () => expect(ids.has('iconic-mt-hotham')).toBe(true));
  it('includes Norton Summit', () => expect(ids.has('iconic-adelaide-hills')).toBe(true));

  // South America
  it('includes Alto de Letras', () => expect(ids.has('iconic-alto-de-letras')).toBe(true));
  it('includes Cerro Otto (Bariloche)', () => expect(ids.has('iconic-bariloche-cerro-otto')).toBe(true));

  // Africa
  it("includes Chapman's Peak", () => expect(ids.has('iconic-chapmans-peak')).toBe(true));
  it('includes Kilimanjaro approach', () => expect(ids.has('iconic-kilimanjaro-approach')).toBe(true));

  // Eastern Europe
  it('includes Transfăgărășan', () => expect(ids.has('iconic-transfagarasan')).toBe(true));
  it('includes Transalpina', () => expect(ids.has('iconic-transalpina')).toBe(true));
  it('includes High Tatras', () => expect(ids.has('iconic-high-tatras')).toBe(true));

  // UK / Ireland
  it('includes Hardknott Pass', () => expect(ids.has('iconic-hardknott-pass')).toBe(true));
  it('includes Cheddar Gorge', () => expect(ids.has('iconic-cheddar-gorge')).toBe(true));
  it('includes Wicklow Gap', () => expect(ids.has('iconic-wicklow-gap')).toBe(true));

  // Mediterranean / Islands
  it('includes Sa Calobra', () => expect(ids.has('iconic-sa-calobra')).toBe(true));
  it('includes Mount Teide', () => expect(ids.has('iconic-mount-teide')).toBe(true));

  // Dolomites / Alps extension
  it('includes Tre Cime di Lavaredo', () => expect(ids.has('iconic-tre-cime-di-lavaredo')).toBe(true));
  it('includes Stelvio south side', () => expect(ids.has('iconic-stelvio-south')).toBe(true));

  // Classics / North European
  it('includes Paterberg', () => expect(ids.has('iconic-paterberg')).toBe(true));
  it('includes Koppenberg', () => expect(ids.has('iconic-koppenberg')).toBe(true));
  it('includes Poggio di Sanremo', () => expect(ids.has('iconic-poggio-sanremo')).toBe(true));
  it('includes Mur de Huy', () => expect(ids.has('iconic-mur-de-huy')).toBe(true));
});
