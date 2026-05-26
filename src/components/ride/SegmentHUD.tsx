/**
 * SegmentHUD — Strava Live Segments overlay shown during an active segment.
 *
 * Displays when the rider is inside a Strava segment (activeSegment != null).
 * Shows: segment name, length, climb category, rider's PR, live Δ vs PR pace,
 * and a progress bar.
 *
 * On segment exit (triggered by the ride store), shows a 3-second celebration
 * card: "+12s vs PR" or "NEW PR!" with a confetti burst.
 *
 * State is read from the ride store's strava-segment slice.
 *
 * Wave 33.B — no VR / WebXR code modified.
 */

import { useEffect, useRef, useState } from 'react';
import { Flag, Timer, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/utils';
import { useRideStore } from '@/stores/rideStore';

// ---------------------------------------------------------------------------
// Confetti burst — pure CSS/DOM, no third-party library.
// ---------------------------------------------------------------------------

function ConfettiBurst({ active }: { active: boolean }) {
  if (!active) return null;

  // 20 particles with random colors and trajectories.
  const particles = Array.from({ length: 20 }, (_, i) => {
    const angle = (i / 20) * 360;
    const distance = 40 + Math.random() * 60;
    const duration = 0.6 + Math.random() * 0.4;
    const size = 4 + Math.random() * 6;
    const colors = ['#22d3ee', '#fbbf24', '#34d399', '#f87171', '#a78bfa'];
    const color = colors[i % colors.length];

    const dx = Math.cos((angle * Math.PI) / 180) * distance;
    const dy = Math.sin((angle * Math.PI) / 180) * distance;

    return { dx, dy, duration, size, color, key: i };
  });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      {particles.map((p) => (
        <div
          key={p.key}
          className="absolute top-1/2 left-1/2 rounded-sm"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            transform: `translate(-50%, -50%)`,
            animation: `confettiPop ${p.duration}s ease-out forwards`,
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Climb category label
// ---------------------------------------------------------------------------

function climbCategoryLabel(cat?: number): string | null {
  if (cat === undefined || cat === 0) return null;
  if (cat === 5) return 'HC';
  return `Cat ${cat}`;
}

// ---------------------------------------------------------------------------
// SegmentHUD
// ---------------------------------------------------------------------------

export function SegmentHUD() {
  const activeSegment         = useRideStore((s) => s.activeSegment);
  const segmentDistanceStart  = useRideStore((s) => s.segmentDistanceStarted);
  const segmentElapsedSec     = useRideStore((s) => s.segmentElapsedSec);
  const distance              = useRideStore((s) => s.distance);

  // Celebration state — fires when segment exits.
  const [celebration, setCelebration] = useState<{
    deltaStr: string;
    isNewPR: boolean;
  } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const prevActiveRef = useRef(activeSegment);
  const celebTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect transition from active → null (segment exit).
  useEffect(() => {
    const prev = prevActiveRef.current;
    prevActiveRef.current = activeSegment;

    if (prev !== null && activeSegment === null) {
      // Segment just exited — grab the last known data from the store directly.
      const st = useRideStore.getState();
      const exitedSegment = prev;
      const elapsed = st.segmentElapsedSec;
      const prTime  = exitedSegment.segment.prTime;

      let deltaStr = '';
      let isNewPR  = false;

      if (prTime && prTime > 0) {
        const delta = Math.round(elapsed - prTime);
        isNewPR = delta < 0;
        const absDelta = Math.abs(delta);
        deltaStr = isNewPR ? `-${absDelta}s` : `+${absDelta}s`;
      } else {
        // First effort on this segment.
        deltaStr = formatDuration(elapsed);
        isNewPR  = false;
      }

      setCelebration({ deltaStr, isNewPR });
      setShowConfetti(isNewPR);

      // Auto-dismiss after 3 s.
      if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
      celebTimerRef.current = setTimeout(() => {
        setCelebration(null);
        setShowConfetti(false);
      }, 3_500);
    }
  }, [activeSegment]);

  // Cleanup on unmount.
  useEffect(() => () => {
    if (celebTimerRef.current) clearTimeout(celebTimerRef.current);
  }, []);

  // ---- Active segment view ----
  if (activeSegment) {
    const seg = activeSegment.segment;
    const segLength = activeSegment.routeEndDistance - activeSegment.routeStartDistance;
    const distanceCovered = Math.max(0, distance - segmentDistanceStart);
    const progress = segLength > 0 ? Math.min(1, distanceCovered / segLength) : 0;
    const prTime = seg.prTime;

    // Live delta vs PR.
    let deltaLabel: string | null = null;
    let deltaColor = 'text-amber-400';

    if (prTime && prTime > 0 && segmentElapsedSec > 0 && distanceCovered > 10) {
      const pace = segmentElapsedSec / distanceCovered;             // s/m
      const projected = pace * segLength;
      const delta = Math.round(projected - prTime);

      if (delta < 0) {
        deltaLabel = `▼${Math.abs(delta)}s`;
        deltaColor = 'text-emerald-400';
      } else {
        deltaLabel = `▲${delta}s`;
        deltaColor = delta > 30 ? 'text-rose-400' : 'text-amber-400';
      }
    }

    const catLabel = climbCategoryLabel(seg.climbCategory);
    const lenKm    = (segLength / 1000).toFixed(1);

    return (
      <div
        role="region"
        aria-label={`Active Strava segment: ${seg.name}`}
        className={cn(
          'pointer-events-auto flex flex-col gap-2',
          'animate-fadeUp',
        )}
      >
        <div
          className="relative flex flex-col gap-2 rounded-2xl overflow-hidden px-3 py-3"
          style={{
            background: 'linear-gradient(135deg, rgba(8,14,28,0.94) 0%, rgba(3,25,40,0.90) 100%)',
            border: '1px solid rgba(34,211,238,0.35)',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
            boxShadow: '0 0 28px -8px rgba(34,211,238,0.30), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Aqua glow strip */}
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-3/4 rounded-full"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.65), transparent)' }}
            aria-hidden
          />

          {/* Header row */}
          <div className="flex items-center gap-2">
            <Flag className="h-3.5 w-3.5 shrink-0" style={{ color: '#22d3ee' }} aria-hidden />
            <span
              className="text-xs font-bold uppercase tracking-widest leading-tight truncate flex-1"
              style={{ color: '#e2e8f0' }}
            >
              {seg.name}
            </span>
            {catLabel && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0"
                style={{
                  background: 'rgba(251,191,36,0.15)',
                  border: '1px solid rgba(251,191,36,0.40)',
                  color: '#fbbf24',
                }}
              >
                {catLabel}
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" aria-hidden />
              {lenKm} km
            </span>
            {seg.avgGrade !== undefined && (
              <span>{seg.avgGrade.toFixed(1)}% avg</span>
            )}
            {prTime && prTime > 0 && (
              <span className="flex items-center gap-1">
                <Timer className="h-3 w-3" aria-hidden />
                PR {formatDuration(prTime)}
              </span>
            )}
            {deltaLabel && (
              <span className={cn('font-bold tabular-nums num', deltaColor)}>
                {deltaLabel}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div
            className="relative h-1 rounded-full bg-slate-800/70 overflow-hidden"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Segment progress: ${Math.round(progress * 100)}%`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${(progress * 100).toFixed(1)}%`,
                background: 'linear-gradient(90deg, #22d3ee, #fbbf24)',
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ---- Celebration card ----
  if (celebration) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={celebration.isNewPR ? 'New personal record!' : `Segment finished: ${celebration.deltaStr} vs PR`}
        className="pointer-events-none animate-fadeUp"
      >
        <div
          className="relative flex flex-col items-center gap-1 rounded-2xl px-5 py-3 overflow-hidden"
          style={{
            background: celebration.isNewPR
              ? 'linear-gradient(135deg, rgba(52,211,153,0.25), rgba(34,211,238,0.20))'
              : 'linear-gradient(135deg, rgba(8,14,28,0.92), rgba(3,25,40,0.88))',
            border: celebration.isNewPR
              ? '1px solid rgba(52,211,153,0.50)'
              : '1px solid rgba(34,211,238,0.25)',
            backdropFilter: 'blur(20px) saturate(160%)',
            WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          }}
        >
          <ConfettiBurst active={showConfetti} />

          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: celebration.isNewPR ? '#34d399' : '#94a3b8' }}
          >
            {celebration.isNewPR ? 'NEW PR!' : 'Segment finished'}
          </span>
          <span
            className={cn(
              'num text-2xl font-bold tabular-nums',
              celebration.isNewPR ? 'text-emerald-400' : 'text-amber-400',
            )}
          >
            {celebration.deltaStr}
          </span>
          <span className="text-[10px] text-slate-400">vs PR pace</span>
        </div>
      </div>
    );
  }

  return null;
}
