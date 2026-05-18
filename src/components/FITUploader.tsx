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
import { Upload, Loader2, Clapperboard } from 'lucide-react';

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
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
        className={cn(
          'group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 px-4 py-5 text-center transition-colors cursor-pointer',
          'hover:border-amber-500/60 hover:bg-amber-500/5',
          dragOver && 'border-amber-500 bg-amber-500/10',
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
        {busy ? (
          <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
        ) : (
          <Clapperboard className="h-6 w-6 text-muted-foreground group-hover:text-amber-500 transition-colors" />
        )}
        <div className="mt-1.5 text-sm font-medium text-foreground">
          {busy ? 'Parsing FIT…' : 'Drop a .FIT to replay'}
        </div>
        <div className="text-xs text-muted-foreground">
          GlobeRide, Strava, or Garmin export · click to browse
        </div>
      </label>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">
          {error}
        </div>
      )}
    </div>
  );
}
