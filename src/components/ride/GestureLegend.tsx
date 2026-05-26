/**
 * GestureLegend — small "?" button in the top-right corner of the ride view
 * that opens a glass overlay listing the available handlebar gestures.
 *
 * Auto-dismisses after 5 s of no interaction (moved to last-interaction tracking).
 * Designed to be unobtrusive: minimal footprint when closed, full-screen glass
 * overlay when open (same pattern as RideShortcutsHelp).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { HelpCircle, X, HandMetal, TimerReset, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GestureRow {
  icon: React.ReactNode;
  gesture: string;
  description: string;
}

const GESTURES: GestureRow[] = [
  {
    icon: <HandMetal className="h-4 w-4 shrink-0" aria-hidden="true" />,
    gesture: 'Double-tap',
    description: 'Pause / resume the ride',
  },
  {
    icon: <TimerReset className="h-4 w-4 shrink-0" aria-hidden="true" />,
    gesture: 'Long-press (600 ms)',
    description: 'Open quick-action menu (End / Lap / Resume)',
  },
  {
    icon: <TrendingUp className="h-4 w-4 shrink-0" aria-hidden="true" />,
    gesture: '2-finger swipe up',
    description: 'Increase ERG target +10 W',
  },
  {
    icon: <TrendingDown className="h-4 w-4 shrink-0" aria-hidden="true" />,
    gesture: '2-finger swipe down',
    description: 'Decrease ERG target −10 W',
  },
];

const AUTO_DISMISS_MS = 5_000;

export function GestureLegend() {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startDismissTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setOpen(false), AUTO_DISMISS_MS);
  }, []);

  const handleOpen = useCallback(() => {
    setOpen(true);
    startDismissTimer();
  }, [startDismissTimer]);

  const handleClose = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(false);
  }, []);

  // Restart dismiss timer on any interaction inside the overlay.
  const handleInteraction = useCallback(() => {
    startDismissTimer();
  }, [startDismissTimer]);

  // Escape key closes the overlay.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, handleClose]);

  // Cleanup timer on unmount.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <>
      {/* Trigger button — small "?" chip */}
      <button
        type="button"
        aria-label="Show gesture controls legend"
        aria-expanded={open}
        onClick={handleOpen}
        className={cn(
          'absolute top-3 right-3 z-[4]',
          'flex items-center justify-center',
          'h-7 w-7 rounded-full',
          'glass glass-hairline',
          'text-muted-foreground hover:text-foreground',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Gesture controls legend"
          className={cn(
            'absolute inset-0 z-30 flex items-center justify-center p-6',
            'bg-background/65 backdrop-blur-sm animate-fadeIn',
          )}
          onClick={handleClose}
          onPointerMove={handleInteraction}
        >
          <div
            className="glass glass-hairline rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
              <div className="rounded-lg bg-accent/12 p-1.5 text-accent ring-1 ring-accent/25">
                <HandMetal className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="text-base font-bold text-foreground tracking-tight">
                Handlebar gestures
              </div>
              <button
                type="button"
                aria-label="Close gesture legend"
                onClick={handleClose}
                className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Gesture rows */}
            <ul className="flex flex-col gap-3">
              {GESTURES.map((g) => (
                <li key={g.gesture} className="flex items-start gap-3">
                  <div
                    className="flex items-center justify-center h-7 w-7 rounded-lg bg-muted/40 border border-border/60 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  >
                    {g.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-tight">
                      {g.gesture}
                    </p>
                    <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                      {g.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {/* Footer note */}
            <div className="mt-4 pt-3 border-t border-border/40 text-[11px] text-muted-foreground/80 leading-relaxed">
              Gestures work on the ride canvas — gloves friendly. Disable in Settings
              → Display &amp; Gestures if they conflict with other interactions.
              <br />
              <span className="opacity-60">Auto-closes in {AUTO_DISMISS_MS / 1000} s.</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
