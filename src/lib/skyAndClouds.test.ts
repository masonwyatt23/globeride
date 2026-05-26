/**
 * skyAndClouds.test.ts — Wave 30.C
 *
 * Tests for:
 *   sunAzimuthAndAltitude — pure solar-position math (no Cesium needed)
 *   scaledCloudCount      — quality-tier scaling
 *   spawnCumulusClouds    — shape of returned object (Cesium mocked)
 *   updateCloudParallax   — positional drift (Cesium mocked)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Cesium mock — spawnCumulusClouds and updateCloudParallax use Cesium.
// The mock must be declared BEFORE any imports that transitively import cesium.
// ---------------------------------------------------------------------------

// Simple mock cloud entry.
interface MockCloud {
  position: { lon: number; lat: number; alt: number };
  scale: unknown;
  maximumSize: unknown;
  slice: number;
  show: boolean;
}

// Minimal CloudCollection mock.
function makeMockCollection(clouds: MockCloud[]) {
  return {
    _clouds: clouds,
    add(opts: {
      position: { x: number; y: number; z: number };
      scale: unknown;
      maximumSize: unknown;
      slice: number;
    }) {
      const c: MockCloud = {
        position: opts.position as unknown as { lon: number; lat: number; alt: number },
        scale: opts.scale,
        maximumSize: opts.maximumSize,
        slice: opts.slice,
        show: true,
      };
      clouds.push(c);
      return c;
    },
    get length() {
      return clouds.length;
    },
    get(i: number) {
      return clouds[i];
    },
  };
}

type MockViewer = {
  isDestroyed: () => boolean;
  scene: {
    primitives: { add: (x: unknown) => void; remove: (x: unknown) => void };
  };
};

vi.mock('cesium', () => {
  // Cartesian3: constructable AND has static helpers.
  function MockCartesian3(x = 0, y = 0, z = 0) {
    return { x, y, z };
  }
  MockCartesian3.fromDegrees = (lon: number, lat: number, alt: number) => ({ x: lon, y: lat, z: alt });
  MockCartesian3.fromRadians = (lon: number, lat: number, alt: number) => ({ x: lon, y: lat, z: alt });

  // CloudCollection: each `new` call returns a fresh independent collection
  // so cloud counts don't accumulate across tests.
  function MockCloudCollection() {
    const clouds: MockCloud[] = [];
    return {
      _clouds: clouds,
      add(opts: {
        position: { x: number; y: number; z: number };
        scale: unknown;
        maximumSize: unknown;
        slice: number;
      }) {
        const c: MockCloud = {
          position: opts.position as unknown as { lon: number; lat: number; alt: number },
          scale: opts.scale,
          maximumSize: opts.maximumSize,
          slice: opts.slice,
          show: true,
        };
        clouds.push(c);
        return c;
      },
      get length() { return clouds.length; },
      get(i: number) { return clouds[i]; },
    };
  }

  return {
    CloudCollection: MockCloudCollection,
    Cartesian3: MockCartesian3,
    Cartesian2: vi.fn((x: number, y: number) => ({ x, y })),
    Cartographic: {
      fromCartesian: (pos: { x: number; y: number; z: number }) => ({
        longitude: pos.x * (Math.PI / 180),
        latitude: pos.y * (Math.PI / 180),
        height: pos.z,
      }),
    },
    JulianDate: {
      fromIso8601: vi.fn(() => ({})),
      addHours: vi.fn(() => ({})),
    },
    Viewer: vi.fn(),
  };
});

// Import under test AFTER the mock.
import {
  sunAzimuthAndAltitude,
  scaledCloudCount,
  spawnCumulusClouds,
  updateCloudParallax,
} from '@/lib/skyAndClouds';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDate(isoUtc: string): Date {
  return new Date(isoUtc);
}

/** Solar noon at a given longitude occurs when UTC hour = 12 - lon/15. */
function solarNoonDate(lon: number): Date {
  const utcHourOfNoon = 12 - lon / 15;
  const h = Math.floor(utcHourOfNoon);
  const m = Math.round((utcHourOfNoon - h) * 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return makeDate(`2024-03-20T${pad(h)}:${pad(m)}:00Z`); // vernal equinox
}

// ---------------------------------------------------------------------------
// sunAzimuthAndAltitude — solar position math
// ---------------------------------------------------------------------------

describe('sunAzimuthAndAltitude', () => {
  // ---- 1. Equinox solar noon at equator/Greenwich ----
  it('equinox solar noon at (0°N, 0°E) → altitude ≈ 90°, azimuth finite', () => {
    // On the vernal equinox, solar noon at the equator: sun is at zenith (90°).
    // At near-zenith, azimuth is geometrically undefined — the formula can return
    // any value in [0,360]. Only altitude is reliable here.
    const date = solarNoonDate(0);
    const result = sunAzimuthAndAltitude(date, 0, 0);
    // Allow ±3° tolerance for approximate formula.
    expect(result.altitude).toBeGreaterThan(87);
    expect(result.altitude).toBeLessThan(90.5);
    // Azimuth should still be a finite number in [0, 360].
    expect(Number.isFinite(result.azimuth)).toBe(true);
    expect(result.azimuth).toBeGreaterThanOrEqual(0);
    expect(result.azimuth).toBeLessThanOrEqual(360);
  });

  // ---- 2. Mid-latitude (51.5°N London) solar noon on equinox ----
  // Expected altitude ≈ 90 - 51.5 = 38.5°; azimuth = 180° (due South).
  it('equinox solar noon at London (51.5°N, 0°E) → altitude ≈ 38–40°, azimuth ≈ 180°', () => {
    const date = solarNoonDate(0);
    const result = sunAzimuthAndAltitude(date, 51.5, 0);
    expect(result.altitude).toBeGreaterThan(36);
    expect(result.altitude).toBeLessThan(41);
    expect(result.azimuth).toBeGreaterThan(177);
    expect(result.azimuth).toBeLessThan(183);
  });

  // ---- 3. Midnight UTC at 0°N/0°E → sun below horizon ----
  it('midnight UTC at equator → altitude is negative (sun below horizon)', () => {
    const date = makeDate('2024-06-21T00:00:00Z'); // UTC midnight, summer solstice
    const result = sunAzimuthAndAltitude(date, 0, 0);
    expect(result.altitude).toBeLessThan(0);
  });

  // ---- 4. Sunrise direction: morning sun is roughly in the East ----
  // At solar noon ± 6 hours the sun should be near the eastern/western horizon.
  it('6 hours before noon at equator on equinox → sun near East (azimuth ≈ 90°), altitude near 0', () => {
    // Solar time = noon - 6h → actual sunrise zone.
    const lon = 0;
    const utcHourOfNoon = 12 - lon / 15;
    const h = Math.floor(utcHourOfNoon - 6);
    const date = makeDate(`2024-03-20T${String(h).padStart(2, '0')}:00:00Z`);
    const result = sunAzimuthAndAltitude(date, 0, lon);
    // At 6h from noon the sun is roughly on the horizon; azimuth ≈ East (90°).
    expect(result.azimuth).toBeGreaterThan(60);
    expect(result.azimuth).toBeLessThan(120);
    expect(result.altitude).toBeGreaterThan(-5);
    expect(result.altitude).toBeLessThan(20);
  });

  // ---- 5. Longitude shift: Sydney (151°E) noon ----
  it('equinox solar noon at Sydney (34°S, 151°E) → altitude ≈ 56°, azimuth ≈ 0° (due North)', () => {
    const date = solarNoonDate(151);
    const result = sunAzimuthAndAltitude(date, -34, 151);
    // For southern hemisphere: sun is to the north at noon, azimuth ≈ 0° (360°).
    expect(result.altitude).toBeGreaterThan(52);
    expect(result.altitude).toBeLessThan(60);
    // North for S hemisphere = 0° or very close to 360°.
    const az = result.azimuth;
    expect(az < 5 || az > 355).toBe(true);
  });

  // ---- 6. Winter solstice at high latitude — very low sun ----
  // At 65°N on winter solstice (Dec 21) at solar noon: altitude ≈ 90-65-23.5 ≈ 1.5°.
  it('winter solstice at 65°N noon → altitude is very low (< 5°)', () => {
    // Dec 21 solar noon UTC at Greenwich: sun altitude ≈ 90 - 65 - 23.5 ≈ 1.5°.
    const decDate = makeDate('2024-12-21T12:00:00Z');
    const result = sunAzimuthAndAltitude(decDate, 65, 0);
    expect(result.altitude).toBeLessThan(5);
    expect(result.altitude).toBeGreaterThan(-10);
  });

  // ---- 7. Returns finite numbers ----
  it('returns finite azimuth and altitude for any valid input', () => {
    const cases: [Date, number, number][] = [
      [makeDate('2024-01-01T06:00:00Z'), 45, 90],
      [makeDate('2024-07-15T18:00:00Z'), -10, -60],
      [makeDate('2024-04-01T12:00:00Z'), 70, 150],
    ];
    for (const [d, lat, lon] of cases) {
      const r = sunAzimuthAndAltitude(d, lat, lon);
      expect(Number.isFinite(r.azimuth)).toBe(true);
      expect(Number.isFinite(r.altitude)).toBe(true);
      expect(r.azimuth).toBeGreaterThanOrEqual(0);
      expect(r.azimuth).toBeLessThanOrEqual(360);
      expect(r.altitude).toBeGreaterThanOrEqual(-90);
      expect(r.altitude).toBeLessThanOrEqual(90.5);
    }
  });

  // ---- 8. Azimuth is symmetric around solar noon ----
  // Morning and afternoon azimuths should be roughly symmetric around 180°.
  it('morning and afternoon azimuths are roughly symmetric around 180°', () => {
    const lon = 30;
    const lat = 40;
    const utcNoon = 12 - lon / 15;
    const morningDate = makeDate(
      `2024-06-21T${String(Math.floor(utcNoon - 3)).padStart(2, '0')}:00:00Z`,
    );
    const afternoonDate = makeDate(
      `2024-06-21T${String(Math.floor(utcNoon + 3)).padStart(2, '0')}:00:00Z`,
    );
    const morning = sunAzimuthAndAltitude(morningDate, lat, lon);
    const afternoon = sunAzimuthAndAltitude(afternoonDate, lat, lon);
    // morning az < 180, afternoon az > 180; their average should be near 180.
    expect(morning.azimuth).toBeLessThan(180);
    expect(afternoon.azimuth).toBeGreaterThan(180);
    const avg = (morning.azimuth + afternoon.azimuth) / 2;
    expect(avg).toBeGreaterThan(170);
    expect(avg).toBeLessThan(190);
  });
});

// ---------------------------------------------------------------------------
// scaledCloudCount
// ---------------------------------------------------------------------------

describe('scaledCloudCount', () => {
  it('returns 0 for low quality regardless of nominal count', () => {
    expect(scaledCloudCount(30, 'low')).toBe(0);
    expect(scaledCloudCount(0, 'low')).toBe(0);
  });

  it('returns half (floor) for medium quality', () => {
    expect(scaledCloudCount(30, 'medium')).toBe(15);
    expect(scaledCloudCount(7, 'medium')).toBe(3); // floor(7/2)
    expect(scaledCloudCount(0, 'medium')).toBe(0);
  });

  it('returns full count for high quality', () => {
    expect(scaledCloudCount(30, 'high')).toBe(30);
    expect(scaledCloudCount(0, 'high')).toBe(0);
    expect(scaledCloudCount(1, 'high')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// spawnCumulusClouds — shape tests (Cesium mocked)
// ---------------------------------------------------------------------------

describe('spawnCumulusClouds', () => {
  let mockViewer: MockViewer;
  let addedPrimitive: unknown;

  beforeEach(() => {
    addedPrimitive = undefined;
    // Reset the shared mock collection between tests so clouds don't accumulate.
    // The vi.mock factory is module-scoped; we reach into the mock via vi.mocked.
    // Simplest approach: clear the underlying array via the CloudCollection mock.
    // Since the mock returns the same object from the module factory, we access
    // it via the Cesium import which resolves to the mock.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const CesiumMock = require('cesium') as { CloudCollection: { mock?: { instances?: unknown[] } } };
    void CesiumMock; // The mock does not expose the clouds array directly.
    // Instead: reach through the mock collection via the CloudCollection fn.
    // The safest approach here is to clear mockClouds via the module-level ref.
    // We do this by calling a fresh import cycle — but in Vitest modules are
    // cached. So we directly mutate: the mock collection `_clouds` array.
    vi.clearAllMocks();
    // Re-initialise mockViewer after clearAllMocks.
    mockViewer = {
      isDestroyed: () => false,
      scene: {
        primitives: {
          add: (p: unknown) => {
            addedPrimitive = p;
          },
          remove: vi.fn(),
        },
      },
    };
  });

  it('returns null when count is 0', () => {
    const result = spawnCumulusClouds(mockViewer as Parameters<typeof spawnCumulusClouds>[0], 48, 7, 0, 3000);
    expect(result).toBeNull();
  });

  it('returns null when viewer is destroyed', () => {
    const destroyedViewer = { isDestroyed: () => true } as Parameters<typeof spawnCumulusClouds>[0];
    const result = spawnCumulusClouds(destroyedViewer, 48, 7, 5, 3000);
    expect(result).toBeNull();
  });

  it('adds a CloudCollection to scene.primitives when count > 0', () => {
    const result = spawnCumulusClouds(mockViewer as Parameters<typeof spawnCumulusClouds>[0], 48, 7, 10, 3000);
    expect(result).not.toBeNull();
    expect(addedPrimitive).not.toBeUndefined();
  });

  it('spawned collection has the requested number of clouds', () => {
    const result = spawnCumulusClouds(mockViewer as Parameters<typeof spawnCumulusClouds>[0], 48, 7, 10, 3000);
    expect(result?.length).toBe(10);
  });

  it('cloud positions are within ~10km radius of center', () => {
    const centerLat = 48;
    const centerLon = 7;
    const result = spawnCumulusClouds(
      mockViewer as Parameters<typeof spawnCumulusClouds>[0],
      centerLat,
      centerLon,
      10,
      3000,
    );
    expect(result).not.toBeNull();
    // Each cloud's x (lon) and y (lat) should be within the radius (~0.09°).
    for (let i = 0; i < (result?.length ?? 0); i++) {
      const cloud = result!.get(i);
      // Mock Cartesian3.fromDegrees returns { x: lon, y: lat, z: alt }.
      const pos = cloud.position as unknown as { x: number; y: number; z: number };
      const dLon = pos.x - centerLon;
      const dLat = pos.y - centerLat;
      expect(Math.abs(dLon)).toBeLessThan(0.15);
      // Lat displacement is amplified by 1/cos(lat): at 48°N, cos≈0.669
      // so RADIUS_DEG=0.09 maps to ~0.134° in lat — use 0.15° margin.
      expect(Math.abs(dLat)).toBeLessThan(0.15);
      // Altitude should match.
      expect(pos.z).toBe(3000);
    }
  });
});

// ---------------------------------------------------------------------------
// updateCloudParallax — positional drift
// ---------------------------------------------------------------------------

describe('updateCloudParallax', () => {
  it('does nothing when dtMs=0', () => {
    // We test via the updateCloudParallax function; since Cesium is mocked
    // with pass-through Cartographic/Cartesian3 helpers, just verify no throw.
    // Create a minimal mock collection.
    const clouds: MockCloud[] = [];
    const col = makeMockCollection(clouds);
    // Push a fake cloud with { x: lon_rad, y: lat_rad, z: alt }.
    clouds.push({
      position: { lon: 7 * (Math.PI / 180), lat: 48 * (Math.PI / 180), alt: 3000 } as unknown as {
        lon: number; lat: number; alt: number;
      },
      scale: {},
      maximumSize: {},
      slice: 0.4,
      show: true,
    });
    // No throw expected.
    expect(() =>
      updateCloudParallax(col as unknown as Parameters<typeof updateCloudParallax>[0], 5, 270, 0),
    ).not.toThrow();
  });
});
