/**
 * Outdoor GPS Mode — geolocation manager.
 *
 * watchGpsPosition wraps navigator.geolocation.watchPosition, applies a
 * 3-point moving-average smoother to lat/lon, throttles to 1 Hz, and
 * provides helpers for grade estimation, auto-pause detection, haversine
 * distance, and stale-sample detection.
 *
 * No external dependencies. Works on iOS Safari (geolocation available;
 * Web Bluetooth is not needed for outdoor mode).
 */

export interface GpsSample {
  lat: number;
  lon: number;
  /** Elevation in metres above ellipsoid, or null when unavailable. */
  ele: number | null;
  /** Ground speed in m/s, or null when unavailable. */
  speedMs: number | null;
  /** GPS horizontal accuracy in metres. */
  accuracy: number;
  /** Wall-clock timestamp, ms since epoch. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6_371_000;
/** Throttle: skip GPS samples that arrive faster than 1 Hz. */
const MIN_SAMPLE_INTERVAL_MS = 1_000;
/** Auto-pause: consider the rider stopped if mean speed < 0.5 m/s over the window. */
const AUTO_PAUSE_SPEED_THRESHOLD_MS = 0.5;
/** Auto-pause: rolling window length in seconds. */
const AUTO_PAUSE_WINDOW_SEC = 10;
/** Maximum grade clamped ±25 % — mirrors gradientCalculator convention. */
const MAX_GRADE_PCT = 25;
/** Stale-sample threshold: treat a sample older than 5 s as stale. */
const STALE_THRESHOLD_MS = 5_000;
/** Moving-average window size. */
const SMOOTH_WINDOW = 3;

// ---------------------------------------------------------------------------
// Haversine distance
// ---------------------------------------------------------------------------

/**
 * Haversine distance between two GPS samples, metres.
 * Returns 0 when the samples are identical.
 */
export function distanceMeters(a: GpsSample, b: GpsSample): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const aLat = (a.lat * Math.PI) / 180;
  const bLat = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat) * Math.cos(bLat) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ---------------------------------------------------------------------------
// Grade estimation
// ---------------------------------------------------------------------------

/**
 * Compute grade percentage from elevation delta over horizontal distance.
 * Returns 0 when the two samples are at the same position or elevation is
 * unavailable for either sample. Clamped to ±25 %.
 */
export function gpsToGradePct(prev: GpsSample, current: GpsSample): number {
  if (prev.ele === null || current.ele === null) return 0;

  const dist = distanceMeters(prev, current);
  if (dist < 0.5) return 0; // avoid divide-by-near-zero on stationary samples

  const rise = current.ele - prev.ele;
  const grade = (rise / dist) * 100;
  return Math.max(-MAX_GRADE_PCT, Math.min(MAX_GRADE_PCT, grade));
}

// ---------------------------------------------------------------------------
// Stale-sample detection
// ---------------------------------------------------------------------------

/** Returns true when the sample is more than 5 s old. */
export function isStaleGpsSample(s: GpsSample, nowMs: number): boolean {
  return nowMs - s.timestamp > STALE_THRESHOLD_MS;
}

// ---------------------------------------------------------------------------
// Auto-pause detection
// ---------------------------------------------------------------------------

/**
 * Returns true when the rider appears to be stationary.
 *
 * Logic: look at all samples within the last AUTO_PAUSE_WINDOW_SEC seconds.
 * If there are fewer than 2 samples (not enough data), return false.
 * Otherwise average the instantaneous speeds — if the mean is below
 * AUTO_PAUSE_SPEED_THRESHOLD_MS, the rider has been slow for the window
 * duration and we should auto-pause.
 */
export function shouldAutoPause(samples: GpsSample[]): boolean {
  if (samples.length < 2) return false;

  const newest = samples[samples.length - 1];
  const cutoff = newest.timestamp - AUTO_PAUSE_WINDOW_SEC * 1_000;
  const window = samples.filter((s) => s.timestamp >= cutoff);

  if (window.length < 2) return false;

  // Prefer the GPS-reported speedMs field when available; fall back to
  // computing speed from haversine deltas between consecutive samples.
  let totalSpeed = 0;
  let count = 0;

  for (let i = 1; i < window.length; i++) {
    const s = window[i];
    if (s.speedMs !== null) {
      totalSpeed += s.speedMs;
      count++;
    } else {
      const dt = (s.timestamp - window[i - 1].timestamp) / 1_000;
      if (dt > 0) {
        const d = distanceMeters(window[i - 1], s);
        totalSpeed += d / dt;
        count++;
      }
    }
  }

  if (count === 0) return false;
  return totalSpeed / count < AUTO_PAUSE_SPEED_THRESHOLD_MS;
}

// ---------------------------------------------------------------------------
// Moving-average smoother (3-point)
// ---------------------------------------------------------------------------

class MovingAverage {
  private readonly size: number;
  private latBuf: number[] = [];
  private lonBuf: number[] = [];

  constructor(size = SMOOTH_WINDOW) {
    this.size = size;
  }

  push(lat: number, lon: number): { lat: number; lon: number } {
    this.latBuf.push(lat);
    this.lonBuf.push(lon);
    if (this.latBuf.length > this.size) {
      this.latBuf.shift();
      this.lonBuf.shift();
    }
    const n = this.latBuf.length;
    return {
      lat: this.latBuf.reduce((s, v) => s + v, 0) / n,
      lon: this.lonBuf.reduce((s, v) => s + v, 0) / n,
    };
  }
}

// ---------------------------------------------------------------------------
// Main watcher
// ---------------------------------------------------------------------------

/**
 * Subscribe to the device GPS with a 1 Hz throttle and a 3-point moving
 * average on lat/lon.
 *
 * @returns An unsubscribe function — call it to stop watching.
 */
export function watchGpsPosition(
  onSample: (s: GpsSample) => void,
  onError: (e: GeolocationPositionError) => void,
): () => void {
  const smoother = new MovingAverage(SMOOTH_WINDOW);
  let lastEmittedTs = 0;

  const handlePosition = (pos: GeolocationPosition) => {
    const now = pos.timestamp;
    // Throttle to 1 Hz
    if (now - lastEmittedTs < MIN_SAMPLE_INTERVAL_MS) return;
    lastEmittedTs = now;

    const raw = pos.coords;
    const { lat, lon } = smoother.push(raw.latitude, raw.longitude);

    const sample: GpsSample = {
      lat,
      lon,
      ele: raw.altitude,
      speedMs: raw.speed,
      accuracy: raw.accuracy,
      timestamp: now,
    };
    onSample(sample);
  };

  const watchId = navigator.geolocation.watchPosition(
    handlePosition,
    onError,
    {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 0,
    },
  );

  return () => navigator.geolocation.clearWatch(watchId);
}
