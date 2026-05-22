/**
 * FIT file uploader for ride replay.
 *
 * Parses an uploaded .FIT into a Route + telemetry track and calls
 * `loadReplay` on the store. The user then sees the normal Ride view but
 * with a REPLAY badge and recorded telemetry driving the HUD.
 *
 * Sibling to GPXUploader — placed in the same "Pick a route" card on Home.
 */

import { useCallback, useRef, useState } from 'react';
import { Loader2, Clapperboard } from 'lucide-react';

import { useRideStore } from '@/stores/rideStore';
import { parseFit, FitParseError } from '@/lib/fitParser';
import { cn } from '@/lib/utils';

export function FITUploader() {
  const loadReplay = useRideStore((s) => s.loadReplay);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const buf = await file.arrayBuffer();
        const fit = parseFit(buf);
        loadReplay(fit);
      } catch (err) {
        if (err instanceof FitParseError) {
          setError(err.message);
        } else {
          setError(err instanceof Error ? err.message : 'Could not parse FIT file');
        }
      } finally {
        setBusy(false);
      }
    },
    [loadReplay],
  );

  return (
    <div className="flex flex-col gap-3">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
        className={cn(
          'group relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 bg-muted/20 px-4 py-7 text-center transition-all duration-200 cursor-pointer',
          'hover:border-amber-500/50 hover:bg-amber-500/5',
          dragOver && 'dropzone-active',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".fit,application/vnd.ant.fit"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            // Reset so the same file can be re-uploaded after clearing
            e.target.value = '';
          }}
        />
        <div className={cn(
          'flex items-center justify-center h-10 w-10 rounded-full transition-all duration-200',
          'bg-muted/60 group-hover:bg-amber-500/12',
          dragOver && 'bg-amber-500/15',
        )}>
          {busy
            ? <Loader2 className="h-5 w-5 text-amber-500 animate-[spinSlow_1.5s_linear_infinite]" />
            : <Clapperboard className={cn('h-5 w-5 transition-colors', dragOver ? 'text-amber-500' : 'text-muted-foreground group-hover:text-amber-500')} />
          }
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">
            {busy ? 'Parsing FIT…' : 'Drop a .FIT to replay'}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Or click to browse · GlobeRide, Strava, or Garmin export
          </div>
        </div>
      </label>

      {error && (
        <div className="rounded-lg border border-destructive/35 bg-destructive/8 px-3 py-2.5 text-xs text-destructive leading-snug">
          {error}
        </div>
      )}
    </div>
  );
}
