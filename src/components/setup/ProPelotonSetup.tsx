/**
 * ProPelotonSetup — Wave 34.C
 *
 * Pre-ride UI card that allows the user to opt into riding alongside the
 * actual historical finishers of the loaded World Tour stage. Only renders
 * when the loaded route has curated stage results in STAGE_RESULTS.
 *
 * On confirm, calls rideStore.setProPeloton() with the initialized simulator
 * state so the peloton starts riding the moment the user clicks "Start".
 */

import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { useRideStore } from '@/stores/rideStore';
import { findStageResults } from '@/lib/proCycling/stageResults';
import { createProPelotonFromStage } from '@/lib/proCycling/proPelotonSimulator';
import { Button } from '@/components/ui/button';

// Top-N options the user can choose from.
const TOP_N_OPTIONS = [1, 3, 5, 10] as const;

export function ProPelotonSetup() {
  const route      = useRideStore((s) => s.route);
  const proPeloton = useRideStore((s) => s.proPeloton);
  const setProPeloton  = useRideStore((s) => s.setProPeloton);
  const clearProPeloton = useRideStore((s) => s.clearProPeloton);

  const [enabled, setEnabled] = useState(false);
  const [topN, setTopN] = useState<typeof TOP_N_OPTIONS[number]>(5);

  // Clear toggle state whenever the route changes.
  useEffect(() => {
    setEnabled(false);
    clearProPeloton();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.id]);

  if (!route) return null;

  // Check if this route has curated pro stage results.
  const stageResults = findStageResults(route.id);
  if (!stageResults) return null;

  const handleToggle = (on: boolean) => {
    setEnabled(on);
    if (on) {
      const state = createProPelotonFromStage(stageResults, route.totalDistance, topN);
      setProPeloton(state);
    } else {
      clearProPeloton();
    }
  };

  const handleTopNChange = (n: typeof TOP_N_OPTIONS[number]) => {
    setTopN(n);
    if (enabled) {
      // Re-create the peloton with new top-N.
      const state = createProPelotonFromStage(stageResults, route.totalDistance, n);
      setProPeloton(state);
    }
  };

  const isActive = enabled && proPeloton !== null;

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-accent shrink-0" />
          <span className="text-sm font-semibold text-foreground">
            Pro Peloton Overlay
          </span>
        </div>

        {/* Toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          onClick={() => handleToggle(!enabled)}
          className={[
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
            'transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isActive ? 'bg-accent' : 'bg-input',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className={[
              'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0',
              'transition-transform duration-200 ease-in-out',
              isActive ? 'translate-x-4' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Ride alongside the real {stageResults.year} finishers of this stage.
        Their ghosts move at the pace required to match their official finish time.
      </p>

      {/* Top-N selector — shown when enabled */}
      {isActive && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground shrink-0">Show top</span>
          <div className="flex gap-1">
            {TOP_N_OPTIONS.map((n) => (
              <Button
                key={n}
                variant={topN === n ? 'accent' : 'outline'}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => handleTopNChange(n)}
              >
                {n}
              </Button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">finishers</span>
        </div>
      )}

      {/* Rider list preview — shown when enabled */}
      {isActive && proPeloton && (
        <div className="pt-1 space-y-1">
          {proPeloton.riders.slice(0, topN).map((r) => (
            <div key={r.rank} className="flex items-center gap-2 text-xs">
              {/* Team colour swatch */}
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0 border border-border/40"
                style={{ backgroundColor: r.rider.colorways.kit }}
                aria-hidden
              />
              <span className="text-muted-foreground num font-semibold">#{r.rank}</span>
              <span className="text-foreground truncate">{r.rider.name}</span>
              <span className="ml-auto text-muted-foreground num shrink-0">
                {formatTime(r.finishTimeSec)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
