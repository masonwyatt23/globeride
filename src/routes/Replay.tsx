/**
 * Replay.tsx: /replay/:rideId route.
 *
 * Loads the ride from rideHistory (IndexedDB) and mounts the ReplayPlayer
 * floating over the existing Cesium globe. The replay is driven by the
 * existing rideStore.loadReplay() + useReplayLoop path — no second viewer.
 *
 * URL: /replay/:rideId
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import { getRide } from '@/lib/rideHistory';
import type { RideRecord } from '@/lib/rideHistory';
import { useRideStore } from '@/stores/rideStore';
import { ReplayPlayer } from '@/components/replay/ReplayPlayer';

// Cesium viewer is lazy-loaded to avoid blocking the initial paint.
const CesiumViewer = React.lazy(
  () => import('@/components/ride/CesiumViewer').then((m) => ({ default: m.CesiumViewer })),
);

function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading ride…</p>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  const navigate = useNavigate();
  const isNoRide = message.includes('not found') || message.includes('no telemetry');
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4 px-6 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
      {isNoRide && (
        <p className="text-xs text-muted-foreground max-w-[28ch] leading-relaxed">
          Finish a ride first — GlobeRide records telemetry automatically so you can
          watch it back in cinematic replay.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Go back
        </button>
        {isNoRide && (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-semibold hover:bg-primary/90"
          >
            Start a ride
          </button>
        )}
      </div>
    </div>
  );
}

const TOKEN_KEY = 'globeride.cesiumIonToken';

export function Replay() {
  const { rideId } = useParams<{ rideId: string }>();
  const navigate = useNavigate();
  const loadReplay = useRideStore((s) => s.loadReplay);

  // Resolve Cesium ion token (same precedence as Ride.tsx).
  const ionToken = useMemo<string | null>(() => {
    const fromEnv = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';
    if (fromEnv) return fromEnv;
    return window.localStorage.getItem(TOKEN_KEY);
  }, []);

  const [record, setRecord] = useState<RideRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the ride record on mount.
  useEffect(() => {
    if (!rideId) {
      setError('No ride ID in URL');
      setLoading(false);
      return;
    }

    let cancelled = false;
    getRide(rideId).then((r) => {
      if (cancelled) return;
      if (!r) {
        setError(`Ride "${rideId}" not found`);
      } else if (r.samples.length === 0) {
        setError('This ride has no telemetry samples and cannot be replayed');
      } else {
        setRecord(r);
        // Prime the global store so the Cesium viewer and useReplayLoop
        // pick up the route and samples immediately.
        loadReplay({
          route: {
            id: `replay-${r.id}`,
            name: r.name,
            points: r.samples.map((s) => ({
              lat: s.lat,
              lon: s.lon,
              ele: s.ele,
              distance: s.distance,
            })),
            totalDistance: r.samples[r.samples.length - 1]?.distance ?? 0,
            ascent: r.ascentM,
            descent: 0,
            minElevation: Math.min(...r.samples.map((s) => s.ele)),
            maxElevation: Math.max(...r.samples.map((s) => s.ele)),
            loadedAt: r.startedAt,
          },
          samples: r.samples,
          startTimeMs: r.startedAt,
        });
      }
      setLoading(false);
    }).catch((err: unknown) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : 'Could not load ride');
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [rideId, loadReplay]);

  const handleClose = () => navigate(-1);

  if (loading) return <LoadingScreen />;
  if (error || !record) return <ErrorScreen message={error ?? 'Unknown error'} />;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background">
      {/* Cesium globe — reuses existing component, driven by useReplayLoop */}
      <React.Suspense fallback={<LoadingScreen />}>
        <CesiumViewer ionToken={ionToken} />
      </React.Suspense>

      {/* Replay controls overlay */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-full max-w-sm px-4">
        <ReplayPlayer
          record={record}
          onClose={handleClose}
        />
      </div>
    </div>
  );
}
