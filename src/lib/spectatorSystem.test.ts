import { describe, it, expect } from 'vitest';
import {
  spectatorZonesForRoute,
  generateSpectatorPositions,
  buildSpectatorDistanceIndex,
  type SpectatorZone,
} from '@/lib/spectatorSystem';
import type { Route } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkRoute(id: string, totalDistanceM = 200_000): Route {
  const points = [
    { lat: 45.0, lon: 6.0, ele: 1000, distance: 0 },
    { lat: 45.5, lon: 6.5, ele: 2000, distance: totalDistanceM },
  ];
  return {
    id,
    name: id,
    points,
    totalDistance: totalDistanceM,
    ascent: 1000,
    descent: 0,
    minElevation: 1000,
    maxElevation: 2000,
    loadedAt: 0,
  };
}

// A plain user-uploaded route (no World Tour match).
const plainRoute = mkRoute('user-upload-abc123');

// Route IDs that match World Tour stages (must have spectatorClimbs defined).
// wt-tdf-2024-s19 (Isola 2000) and wt-giro-2024-s16 (Mortirolo).
const isolaRoute   = mkRoute('wt-tdf-2024-s19',  144_000);
const mortiRoute   = mkRoute('wt-giro-2024-s16',  206_000);
const tourmRoute   = mkRoute('wt-vuelta-2023-s13', 135_000);

// ---------------------------------------------------------------------------
// spectatorZonesForRoute
// ---------------------------------------------------------------------------

describe('spectatorZonesForRoute', () => {
  it('returns empty array for a plain (non-catalog) route', () => {
    expect(spectatorZonesForRoute(plainRoute)).toEqual([]);
  });

  it('returns zones for the Isola 2000 stage (has spectatorClimbs)', () => {
    const zones = spectatorZonesForRoute(isolaRoute);
    expect(zones.length).toBeGreaterThan(0);
  });

  it('returns zones for the Mortirolo stage (has spectatorClimbs)', () => {
    const zones = spectatorZonesForRoute(mortiRoute);
    expect(zones.length).toBeGreaterThan(0);
  });

  it('returns zones for the Tourmalet stage (has spectatorClimbs)', () => {
    const zones = spectatorZonesForRoute(tourmRoute);
    expect(zones.length).toBeGreaterThan(0);
  });

  it('every returned zone has numeric startDistance < endDistance', () => {
    const zones = spectatorZonesForRoute(isolaRoute);
    for (const z of zones) {
      expect(typeof z.startDistance).toBe('number');
      expect(typeof z.endDistance).toBe('number');
      expect(z.startDistance).toBeLessThan(z.endDistance);
    }
  });

  it('every returned zone has a positive densityPerKm', () => {
    const zones = spectatorZonesForRoute(isolaRoute);
    for (const z of zones) {
      expect(z.densityPerKm).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// generateSpectatorPositions
// ---------------------------------------------------------------------------

describe('generateSpectatorPositions', () => {
  const zones: SpectatorZone[] = [
    { startDistance: 140_000, endDistance: 142_000, densityPerKm: 60 },
  ];

  it('returns an empty array when zones is empty', () => {
    expect(generateSpectatorPositions(plainRoute, [])).toEqual([]);
  });

  it('returns spectator positions for a zone', () => {
    const positions = generateSpectatorPositions(isolaRoute, zones);
    expect(positions.length).toBeGreaterThan(0);
  });

  it('is deterministic — same route id produces identical positions', () => {
    const a = generateSpectatorPositions(isolaRoute, zones);
    const b = generateSpectatorPositions(isolaRoute, zones);
    expect(a).toEqual(b);
  });

  it('different route ids produce different positions (seed varies)', () => {
    const routeA = mkRoute('route-aaa', 144_000);
    const routeB = mkRoute('route-bbb', 144_000);
    const a = generateSpectatorPositions(routeA, zones);
    const b = generateSpectatorPositions(routeB, zones);
    // It's astronomically unlikely both are equal.
    expect(a).not.toEqual(b);
  });

  it('alternates sides of the road', () => {
    const positions = generateSpectatorPositions(isolaRoute, zones);
    // First two spectators should be on opposite sides.
    if (positions.length >= 2) {
      expect(positions[0].sideOfRoad).not.toBe(positions[1].sideOfRoad);
    }
  });

  it('halves spectator count at low quality', () => {
    const high   = generateSpectatorPositions(isolaRoute, zones, 'high').length;
    const low    = generateSpectatorPositions(isolaRoute, zones, 'low').length;
    // low is 0.5× high; rounding may cause ±1 difference.
    expect(low).toBeLessThan(high);
  });

  it('every position has a valid sprite type', () => {
    const valid = new Set(['cheering', 'waving', 'flag']);
    const positions = generateSpectatorPositions(isolaRoute, zones);
    for (const p of positions) {
      expect(valid.has(p.sprite)).toBe(true);
    }
  });

  it('every position has finite lat/lon', () => {
    const positions = generateSpectatorPositions(isolaRoute, zones);
    for (const p of positions) {
      expect(isFinite(p.lat)).toBe(true);
      expect(isFinite(p.lon)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// buildSpectatorDistanceIndex
// ---------------------------------------------------------------------------

describe('buildSpectatorDistanceIndex', () => {
  const zones: SpectatorZone[] = [
    { startDistance: 140_000, endDistance: 142_000, densityPerKm: 40 },
  ];

  it('returns the same count as generateSpectatorPositions', () => {
    const positions = generateSpectatorPositions(isolaRoute, zones);
    const idx = buildSpectatorDistanceIndex(zones, positions, isolaRoute);
    expect(idx.length).toBe(positions.length);
  });

  it('all distances fall within the zone bounds', () => {
    const positions = generateSpectatorPositions(isolaRoute, zones);
    const idx = buildSpectatorDistanceIndex(zones, positions, isolaRoute);
    for (const d of idx) {
      expect(d).toBeGreaterThanOrEqual(zones[0].startDistance);
      expect(d).toBeLessThanOrEqual(zones[0].endDistance);
    }
  });
});
