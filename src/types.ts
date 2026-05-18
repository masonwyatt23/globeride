/**
 * Shared domain types for GlobeRide.
 */

/** A single point along a route, sourced from GPX or generated. */
export interface RoutePoint {
  /** Latitude, degrees. */
  lat: number;
  /** Longitude, degrees. */
  lon: number;
  /** Elevation in meters above ellipsoid. */
  ele: number;
  /** Cumulative distance from route start, meters. */
  distance: number;
  /** Optional original timestamp from GPX (ISO string). */
  time?: string;
}

/** A loaded route with metadata. */
export interface Route {
  id: string;
  name: string;
  /** Densified, distance-tagged route points. */
  points: RoutePoint[];
  /** Total distance in meters. */
  totalDistance: number;
  /** Total elevation gain in meters. */
  ascent: number;
  /** Total elevation loss in meters. */
  descent: number;
  /** Min / max elevation in meters. */
  minElevation: number;
  maxElevation: number;
  /** When the route was loaded into the app. */
  loadedAt: number;
}

/** One telemetry sample recorded during a ride (~1 Hz). */
export interface TelemetrySample {
  /** Unix ms timestamp of the sample. */
  t: number;
  lat: number;
  lon: number;
  /** Elevation along the route in meters. */
  ele: number;
  /** Cumulative distance, meters. */
  distance: number;
  /** Instantaneous speed, m/s. */
  speed: number;
  /** Instantaneous grade, % (slope * 100). */
  grade: number;
  /** Power in watts, when available. */
  power?: number;
  /** Cadence in rpm, when available. */
  cadence?: number;
  /** Heart rate in bpm, when available. */
  heartRate?: number;
}

/** Live data published from the connected smart trainer. */
export interface TrainerData {
  /** Wheel speed, m/s (estimated by trainer). */
  speed?: number;
  /** Instantaneous power, W. */
  power?: number;
  /** Pedaling cadence, rpm. */
  cadence?: number;
  /** Heart rate, bpm — present only if the trainer reports HR. */
  heartRate?: number;
  /** Total distance reported by trainer, m. */
  distance?: number;
  /** Resistance level (raw, trainer-specific). */
  resistance?: number;
}

export type RideState = 'idle' | 'ready' | 'running' | 'paused' | 'finished';
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type RideMode = 'trainer' | 'demo';
