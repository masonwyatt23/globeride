/**
 * AchievementToast — celebratory popup when one or more achievements unlock.
 *
 * Self-contained: manages its own visibility via the achievementStore.
 * Mount once in the app (e.g. in Ride.tsx or App.tsx):
 *
 *   import { AchievementToast } from '@/components/ride/AchievementToast';
 *   <AchievementToast />
 *
 * The toast stack is driven by `pendingToasts` in achievementStore. It auto-
 * dismisses after TOAST_DURATION_MS. Multiple achievements stack sequentially.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TIER_LABEL_STYLES } from '@/components/ride/AchievementToast.styles';
import type { Achievement } from '@/lib/achievements';

// ---------------------------------------------------------------------------
// Internal queue — driven by whatever calls `enqueueToast`
// ---------------------------------------------------------------------------

/** Expose a simple imperative API so useRideHistoryRecorder can push toasts. */
type ToastListener = (achievements: Achievement[]) => void;
const listeners: Set<ToastListener> = new Set();

export function enqueueAchievementToast(achievements: Achievement[]): void {
  if (achievements.length === 0) return;
  listeners.forEach((fn) => fn(achievements));
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

const TOAST_DURATION_MS = 5_000;

// ---------------------------------------------------------------------------
// Single toast card
// ---------------------------------------------------------------------------

interface ToastEntry {
  key: number;
  achievements: Achievement[];
}

function AchievementCard({
  achievements,
  onClose,
}: {
  achievements: Achievement[];
  onClose: () => void;
}) {
  const first = achievements[0];
  const extra = achievements.length - 1;
  const cardRef = useRef<HTMLDivElement>(null);

  // Progress bar that shrinks over TOAST_DURATION_MS
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const start = performance.now();
    let raf: number;

    function tick(now: number) {
      const elapsed = now - start;
      const pct = Math.max(0, 100 - (elapsed / TOAST_DURATION_MS) * 100);
      setProgress(pct);
      if (elapsed < TOAST_DURATION_MS) {
        raf = requestAnimationFrame(tick);
      }
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Dismiss on Escape key when focused inside the card
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    card.addEventListener('keydown', handler);
    return () => card.removeEventListener('keydown', handler);
  }, [onClose]);

  const styles = TIER_LABEL_STYLES[first.tier];

  return (
    <div
      ref={cardRef}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      aria-label={`Achievement unlocked: ${first.name}`}
      className={cn(
        'relative w-80 overflow-hidden rounded-2xl border bg-card/95 backdrop-blur-md shadow-2xl',
        'animate-in slide-in-from-bottom-4 fade-in duration-300 ease-out',
        styles.border,
      )}
    >
      {/* Top accent stripe */}
      <div className={cn('h-0.5 w-full', styles.stripe)} aria-hidden="true" />

      {/* Body */}
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div
          aria-hidden="true"
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl leading-none ring-1 ring-inset',
            styles.iconBg,
            styles.iconRing,
          )}
        >
          {first.icon}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-1.5 mb-0.5" aria-hidden="true">
            <Trophy className={cn('h-3 w-3 shrink-0', styles.trophyColor)} />
            <span className={cn('text-[10px] font-bold uppercase tracking-widest', styles.trophyColor)}>
              Achievement Unlocked!
            </span>
          </div>
          <div className="text-sm font-semibold text-foreground leading-tight">
            {first.name}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
            {first.description}
          </div>
          {extra > 0 && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              +{extra} more achievement{extra > 1 ? 's' : ''} unlocked!
            </div>
          )}
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss achievement notification"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-card active:scale-90"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 w-full bg-muted/30" aria-hidden="true">
        <div
          className={cn('h-full transition-none', styles.stripe)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast container (mount once)
// ---------------------------------------------------------------------------

export function AchievementToast() {
  const [queue, setQueue] = useState<ToastEntry[]>([]);
  const keyRef = useRef(0);
  // Track pending auto-dismiss timers so they can be cancelled on unmount.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const push = useCallback((achievements: Achievement[]) => {
    const key = ++keyRef.current;
    setQueue((q) => [...q, { key, achievements }]);

    // Auto-dismiss after duration
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      setQueue((q) => q.filter((t) => t.key !== key));
    }, TOAST_DURATION_MS + 350); // +350ms for exit animation
    timersRef.current.add(timer);
  }, []);

  useEffect(() => {
    listeners.add(push);
    return () => {
      listeners.delete(push);
      // Cancel all pending timers to avoid setting state on an unmounted component.
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, [push]);

  if (queue.length === 0) return null;

  return (
    <div
      aria-label="Achievement notifications"
      // Position above the ride controls (bottom ~5rem) so it never overlaps
      className="fixed bottom-24 right-4 sm:bottom-6 sm:right-6 z-[200] flex flex-col gap-3 pointer-events-none max-w-[calc(100vw-2rem)]"
    >
      {queue.map((entry) => (
        <div key={entry.key} className="pointer-events-auto">
          <AchievementCard
            achievements={entry.achievements}
            onClose={() => setQueue((q) => q.filter((t) => t.key !== entry.key))}
          />
        </div>
      ))}
    </div>
  );
}
