/**
 * useRideHistory — loads all rides from IndexedDB and exposes reload.
 *
 * Returns { rides, loading, error, reload }.
 * Components that display ride history use this hook instead of calling
 * listRides() + useState/useEffect themselves.
 *
 * Pure lib files (trainingLoad.ts, ghosts.ts) keep using listRides() directly
 * — they are not React and don't need a hook.
 */

import { useCallback, useEffect, useState } from 'react';
import { listRides } from '@/lib/rideHistory';
import type { RideRecord } from '@/lib/rideHistory';

export interface UseRideHistoryResult {
  rides: RideRecord[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useRideHistory(): UseRideHistoryResult {
  const [rides, setRides] = useState<RideRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    listRides()
      .then(setRides)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load rides'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { rides, loading, error, reload };
}
