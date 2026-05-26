/**
 * ReplayPlayer.tsx — Wave 35.A: Cinematic replay UI.
 *
 * Scrubbable timeline · play/pause · variable speed · camera selector
 * · auto-cut highlight reel · optional MP4 export via WebCodecs.
 *
 * Does NOT mount a second Cesium instance — replay drives the same
 * rideStore.loadReplay() / useReplayLoop path that already exists.
 * The component surfaces replay controls that float over the existing
 * Ride route (or the Replay route which embeds a minimal globe view).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  Download,
  Film,
  Camera,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  createReplayPlayer,
  tickReplay,
  jumpToTime,
  togglePlayback,
  setCameraMode,
  setPlaybackSpeed,
  sampleAtTime,
} from '@/lib/replay/replayPlayer';
import type { ReplayState } from '@/lib/replay/replayPlayer';
import { detectHighlights } from '@/lib/replay/highlightDetector';
import { sequenceCameras } from '@/lib/replay/cinematicSequencer';
import { isWebCodecsSupported } from '@/lib/replay/videoExport';
import type { CameraMode } from '@/lib/cesiumCameras';
import { CAMERA_MODES } from '@/lib/cesiumCameras';
import type { RideRecord } from '@/lib/rideHistory';
import { formatDuration } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Playback speed options
// ---------------------------------------------------------------------------

const SPEED_OPTIONS: { label: string; value: number }[] = [
  { label: '0.5×', value: 0.5 },
  { label: '1×',   value: 1   },
  { label: '2×',   value: 2   },
  { label: '4×',   value: 4   },
  { label: '8×',   value: 8   },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ReplayPlayerProps {
  record: RideRecord;
  /** Called when the user wants to close/exit replay mode. */
  onClose?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ReplayPlayer({ record, onClose, className }: ReplayPlayerProps) {
  // Resolve the Cesium canvas lazily so it works even when Cesium mounts
  // after this component (e.g. inside a Suspense boundary).
  const getCesiumCanvas = (): HTMLCanvasElement | null =>
    document.querySelector<HTMLCanvasElement>('.cesium-widget canvas');

  const { samples } = record;

  // Core replay state — managed locally, not in the global store.
  const [state, setState] = useState<ReplayState>(() => createReplayPlayer(samples));

  // Highlight reel state
  const [autoHighlightOn, setAutoHighlightOn] = useState(false);
  const highlights = React.useMemo(() => detectHighlights(samples), [samples]);
  const segments = React.useMemo(
    () => sequenceCameras(highlights, state.durationSec),
    [highlights, state.durationSec],
  );

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const webCodecsOk = isWebCodecsSupported();

  // RAF reference
  const rafRef = useRef<number>(0);
  const lastTRef = useRef<number>(0);

  // ---- Playback RAF loop ----
  useEffect(() => {
    const step = (ts: number) => {
      setState((prev) => {
        if (!prev.isPlaying) {
          lastTRef.current = ts;
          return prev;
        }
        const dt = lastTRef.current === 0 ? 0 : Math.min(0.5, (ts - lastTRef.current) / 1000);
        lastTRef.current = ts;
        return tickReplay(prev, dt);
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ---- Auto-highlight reel: jump between highlights sequentially ----
  const highlightIdxRef = useRef(0);
  useEffect(() => {
    if (!autoHighlightOn || segments.length === 0) return;
    const seg = segments[highlightIdxRef.current % segments.length];
    setState((prev) => {
      const jumped = jumpToTime(prev, seg.startSec);
      const withMode = setCameraMode(jumped, seg.cameraMode);
      return { ...withMode, isPlaying: true };
    });
  }, [autoHighlightOn, segments]);

  // Advance to next highlight segment when current one ends
  useEffect(() => {
    if (!autoHighlightOn || segments.length === 0) return;
    const seg = segments[highlightIdxRef.current % segments.length];
    if (state.currentTime >= seg.endSec) {
      highlightIdxRef.current = (highlightIdxRef.current + 1) % segments.length;
      const next = segments[highlightIdxRef.current];
      setState((prev) => {
        const jumped = jumpToTime(prev, next.startSec);
        return setCameraMode(jumped, next.cameraMode);
      });
    }
  }, [state.currentTime, autoHighlightOn, segments]);

  // ---- Handlers ----

  const handleToggle = useCallback(() => {
    setState((prev) => togglePlayback(prev));
  }, []);

  const handleRestart = useCallback(() => {
    setState((prev) => ({ ...jumpToTime(prev, 0), isPlaying: false }));
    lastTRef.current = 0;
  }, []);

  const handleScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setState((prev) => jumpToTime(prev, t));
  }, []);

  const handleCamera = useCallback((mode: CameraMode) => {
    setState((prev) => setCameraMode(prev, mode));
  }, []);

  const handleSpeed = useCallback((speed: number) => {
    setState((prev) => setPlaybackSpeed(prev, speed));
  }, []);

  const handleExport = useCallback(async () => {
    if (!webCodecsOk) return;
    const canvas = getCesiumCanvas();
    if (!canvas) return;
    setExporting(true);
    setExportProgress(0);
    try {
      const { exportRideAsMP4 } = await import('@/lib/replay/videoExport');
      const blob = await exportRideAsMP4(
        canvas,
        state,
        segments,
        (pct) => setExportProgress(pct),
      );
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${record.name.replace(/[^a-z0-9]/gi, '_')}_replay.mp4`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  }, [webCodecsOk, state, segments, record.name]);

  // ---- Derived values ----

  const currentSample = sampleAtTime(state, state.currentTime);
  const pctComplete = state.durationSec > 0
    ? (state.currentTime / state.durationSec) * 100
    : 0;

  const cameraLabel = (mode: CameraMode) => {
    switch (mode) {
      case 'chase':        return 'Chase';
      case 'firstPerson':  return '1st Person';
      case 'overhead':     return 'Overhead';
      case 'sideTracking': return 'Side Track';
      case 'cinematic':    return 'Cinematic';
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-4 shadow-xl',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground truncate max-w-[18ch]">
            {record.name}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-xs"
          >
            Close
          </button>
        )}
      </div>

      {/* Timeline scrubber */}
      <div className="flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={state.durationSec}
          step={0.1}
          value={state.currentTime}
          onChange={handleScrub}
          className="w-full accent-primary h-1.5 cursor-pointer"
          aria-label="Replay timeline"
        />
        <div className="flex items-center justify-between text-[10px] num text-muted-foreground">
          <span>{formatDuration(state.currentTime)}</span>
          <span className="text-primary/60">{pctComplete.toFixed(0)}%</span>
          <span>{formatDuration(state.durationSec)}</span>
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={handleRestart} className="h-8 w-8 p-0" title="Restart">
          <SkipBack className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleToggle}
          className="h-8 px-3 gap-1.5"
        >
          {state.isPlaying
            ? <Pause className="h-3.5 w-3.5" />
            : <Play className="h-3.5 w-3.5" />
          }
          {state.isPlaying ? 'Pause' : 'Play'}
        </Button>

        {/* Speed selector */}
        <div className="flex items-center gap-1 ml-auto">
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSpeed(opt.value)}
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] num font-medium transition-colors',
                state.playbackSpeed === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Camera selector */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Camera className="h-3 w-3" />
          Camera
        </div>
        <div className="flex flex-wrap gap-1">
          {CAMERA_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleCamera(mode)}
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors',
                state.cameraMode === mode
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {cameraLabel(mode)}
            </button>
          ))}
        </div>
      </div>

      {/* Highlight reel toggle */}
      {highlights.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              highlightIdxRef.current = 0;
              setAutoHighlightOn((v) => !v);
            }}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
              autoHighlightOn
                ? 'bg-primary/10 border-primary text-primary'
                : 'border-border/60 text-muted-foreground hover:border-primary/40',
            )}
          >
            <Film className="h-3 w-3" />
            Auto-cut highlight reel
          </button>
          {autoHighlightOn && (
            <span className="text-[10px] text-muted-foreground">
              {highlights.length} highlight{highlights.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Live sample info */}
      {currentSample && (
        <div className="grid grid-cols-3 gap-2 text-[10px] border-t border-border/30 pt-2">
          <div className="flex flex-col">
            <span className="text-muted-foreground">Speed</span>
            <span className="num font-semibold">{(currentSample.speed * 3.6).toFixed(1)} km/h</span>
          </div>
          {typeof currentSample.power === 'number' && (
            <div className="flex flex-col">
              <span className="text-muted-foreground">Power</span>
              <span className="num font-semibold">{currentSample.power} W</span>
            </div>
          )}
          <div className="flex flex-col">
            <span className="text-muted-foreground">Grade</span>
            <span className="num font-semibold">{currentSample.grade.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {/* MP4 export */}
      {webCodecsOk && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleExport()}
          disabled={exporting}
          className="gap-1.5"
        >
          {exporting
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Encoding… {(exportProgress * 100).toFixed(0)}%</>
            : <><Download className="h-3.5 w-3.5" />Export MP4</>
          }
        </Button>
      )}
    </div>
  );
}
