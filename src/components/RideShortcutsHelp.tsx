/**
 * RideShortcutsHelp — full-screen glass overlay listing ride keyboard
 * shortcuts. Triggered by `?` (or `h`) via useRideKeyboardShortcuts.
 *
 * Deliberately minimal: a centered glass card on a dimmed backdrop, click
 * anywhere or press any of the dismiss keys to close. Designed to be
 * dropped into Ride.tsx behind a useState boolean.
 */

import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface RideShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  description: string;
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: ['Space'], description: 'Pause / resume the ride' },
  { keys: ['Esc'],   description: 'Press once to pause · press again to finish' },
  { keys: ['?'],     description: 'Toggle this shortcut overlay' },
];

export function RideShortcutsHelp({ open, onClose }: RideShortcutsHelpProps) {
  // Esc also closes the overlay when it is open — but only when it IS open,
  // so the global ride shortcut on Esc isn't accidentally hijacked otherwise.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey, true); // capture so we run first
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className={cn(
        'absolute inset-0 z-30 flex items-center justify-center p-6',
        'bg-background/65 backdrop-blur-sm animate-fadeIn',
      )}
      onClick={onClose}
    >
      <div
        className="glass glass-hairline rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="rounded-lg bg-accent/12 p-1.5 text-accent ring-1 ring-accent/25">
            <Keyboard className="h-4 w-4" />
          </div>
          <div className="text-base font-bold text-foreground tracking-tight">
            Keyboard shortcuts
          </div>
          <button
            type="button"
            aria-label="Close shortcuts"
            onClick={onClose}
            className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="flex flex-col gap-2.5">
          {SHORTCUTS.map((s) => (
            <li key={s.keys.join('+')} className="flex items-start gap-3">
              <div className="flex items-center gap-1 shrink-0 min-w-[5.5rem]">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="num inline-flex h-6 min-w-[1.75rem] px-1.5 items-center justify-center rounded border border-border/70 bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-foreground/80 shadow-[inset_0_-1px_0_hsl(var(--border)/0.5)]"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
              <div className="text-sm text-muted-foreground leading-snug pt-0.5">
                {s.description}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 pt-3 border-t border-border/40 text-[11px] text-muted-foreground/80 leading-relaxed">
          Shortcuts work while the ride view is focused. Typing in any input
          (settings, workout name, search) suspends them — keep ergonomic.
        </div>
      </div>
    </div>
  );
}
