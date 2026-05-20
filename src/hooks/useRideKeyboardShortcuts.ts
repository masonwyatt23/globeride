/**
 * Ride-time keyboard shortcuts.
 *
 *  Space      pause / resume       (running ↔ paused)
 *  Escape     two-step finish      (running → paused → finished)
 *  ? / Shift+/ toggle help overlay (caller-controlled via onToggleHelp)
 *  h          toggle help overlay  (alias for `?` without Shift)
 *
 * Skips when the focus is in a form input or contentEditable so the
 * shortcuts never hijack typing — keeps the Settings panel and the
 * workout-builder name field usable while a ride is paused.
 */

import { useEffect } from 'react';
import { useRideStore } from '@/stores/rideStore';

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function useRideKeyboardShortcuts({
  onToggleHelp,
}: { onToggleHelp?: () => void } = {}): void {
  const pause = useRideStore((s) => s.pause);
  const resume = useRideStore((s) => s.resume);
  const finish = useRideStore((s) => s.finish);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Let the browser handle Cmd/Ctrl/Alt-stacked combos (copy/paste/etc).
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const state = useRideStore.getState().rideState;

      // Space — toggle pause/resume.
      if (e.key === ' ' || e.key === 'Spacebar') {
        if (state === 'running') {
          e.preventDefault();
          pause();
        } else if (state === 'paused') {
          e.preventDefault();
          resume();
        }
        return;
      }

      // Escape — two-step finish: running → pause first, then paused → finish.
      if (e.key === 'Escape') {
        if (state === 'running') {
          e.preventDefault();
          pause();
        } else if (state === 'paused') {
          e.preventDefault();
          finish();
        }
        return;
      }

      // `?` (Shift+/) or plain `h` — toggle the help overlay.
      if (onToggleHelp && (e.key === '?' || e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        onToggleHelp();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pause, resume, finish, onToggleHelp]);
}
