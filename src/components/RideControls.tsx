import { useCallback } from 'react';
import { Play, Pause, Square, Save, RotateCcw } from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { Button } from '@/components/ui/button';
import { buildFit, downloadFit } from '@/lib/fitExporter';

/**
 * Start / pause / stop transport for the ride, plus end-of-ride export.
 * Pill-shaped glass bar — large enough to hit with sweaty fingers (h-12 = 48px).
 */
export function RideControls() {
  const rideState  = useRideStore((s) => s.rideState);
  const start      = useRideStore((s) => s.start);
  const pause      = useRideStore((s) => s.pause);
  const resume     = useRideStore((s) => s.resume);
  const finish     = useRideStore((s) => s.finish);
  const reset      = useRideStore((s) => s.reset);
  const samples    = useRideStore((s) => s.samples);
  const startedAt  = useRideStore((s) => s.startedAt);
  const route      = useRideStore((s) => s.route);

  const handleExport = useCallback(() => {
    if (!startedAt || samples.length === 0) return;
    const blob = buildFit({ startTime: startedAt, samples });
    const safe  = (route?.name ?? 'globeride').replace(/[^a-z0-9-_]+/gi, '_');
    const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadFit(blob, `${safe}_${stamp}.fit`);
  }, [startedAt, samples, route?.name]);

  if (!route) return null;

  return (
    <div className="glass glass-hairline rounded-pill px-3 py-2.5 flex items-center gap-2">
      {rideState === 'ready' && (
        <Button variant="accent" size="lg" className="rounded-pill min-w-[7rem]" onClick={start}>
          <Play className="h-4.5 w-4.5" fill="currentColor" />
          Start ride
        </Button>
      )}

      {rideState === 'running' && (
        <>
          <Button variant="outline" size="lg" className="rounded-pill" onClick={pause}>
            <Pause className="h-4 w-4" />
            Pause
          </Button>
          <Button variant="destructive" size="lg" className="rounded-pill" onClick={finish}>
            <Square className="h-3.5 w-3.5" fill="currentColor" />
            Finish
          </Button>
        </>
      )}

      {rideState === 'paused' && (
        <>
          <Button variant="accent" size="lg" className="rounded-pill" onClick={resume}>
            <Play className="h-4 w-4" fill="currentColor" />
            Resume
          </Button>
          <Button variant="destructive" size="lg" className="rounded-pill" onClick={finish}>
            <Square className="h-3.5 w-3.5" fill="currentColor" />
            Finish
          </Button>
        </>
      )}

      {rideState === 'finished' && (
        <>
          <Button variant="default" size="lg" className="rounded-pill" onClick={handleExport}>
            <Save className="h-4 w-4" />
            Export .FIT
          </Button>
          <Button variant="outline" size="lg" className="rounded-pill" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5" />
            New ride
          </Button>
        </>
      )}
    </div>
  );
}
