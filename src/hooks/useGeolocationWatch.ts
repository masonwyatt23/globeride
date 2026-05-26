/**
 * React hook that subscribes to the device GPS via outdoorGps.watchGpsPosition.
 *
 * Manages:
 *  - Permission request on mount (calls getCurrentPosition to trigger the
 *    browser permission prompt before the watch starts).
 *  - Subscription lifecycle: subscribe on mount, unsubscribe on unmount.
 *  - Running sample history (bounded at 60 samples — 60 s at 1 Hz).
 *
 * Returns:
 *  { samples, latestSample, error, isWatching }
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { watchGpsPosition, type GpsSample } from '@/lib/outdoorGps';

export interface GeolocationWatchState {
  /** All GPS samples collected since the hook was mounted (max 60). */
  samples: GpsSample[];
  /** The most recent sample, or null before the first fix. */
  latestSample: GpsSample | null;
  /** The most recent geolocation error, or null when none. */
  error: GeolocationPositionError | null;
  /** True once the geolocation watch has been set up and is running. */
  isWatching: boolean;
}

const MAX_SAMPLES = 60;

export function useGeolocationWatch(): GeolocationWatchState {
  const [samples, setSamples] = useState<GpsSample[]>([]);
  const [latestSample, setLatestSample] = useState<GpsSample | null>(null);
  const [error, setError] = useState<GeolocationPositionError | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const handleSample = useCallback((s: GpsSample) => {
    setLatestSample(s);
    setSamples((prev) => {
      const next = [...prev, s];
      return next.length > MAX_SAMPLES ? next.slice(-MAX_SAMPLES) : next;
    });
    setError(null);
  }, []);

  const handleError = useCallback((e: GeolocationPositionError) => {
    setError(e);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      // Construct a synthetic GeolocationPositionError-like object.
      // We can't use new GeolocationPositionError() — it's not a constructor.
      const err = {
        code: 2, // POSITION_UNAVAILABLE
        message: 'Geolocation is not supported by this browser.',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError;
      setError(err);
      return;
    }

    // Fire getCurrentPosition first so the permission prompt appears
    // immediately, before the continuous watch starts.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Emit the initial fix as the first sample.
        handleSample({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          ele: pos.coords.altitude,
          speedMs: pos.coords.speed,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        });
        // Start the continuous watch only after we have permission.
        const unsub = watchGpsPosition(handleSample, handleError);
        unsubscribeRef.current = unsub;
        setIsWatching(true);
      },
      (e) => {
        handleError(e);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );

    return () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setIsWatching(false);
    };
  }, [handleSample, handleError]);

  return { samples, latestSample, error, isWatching };
}
