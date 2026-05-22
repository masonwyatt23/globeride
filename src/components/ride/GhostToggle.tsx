/**
 * GhostToggle — a compact HUD button that enables/disables ghost riders and
 * shows how many ghost avatars are currently loaded on the globe.
 *
 * Self-contained: reads and writes ghostStore only. Mount it anywhere in the
 * Ride or Explore layout — it has no required props.
 */

import { useGhostStore } from '@/stores/ghostStore';
import { cn } from '@/lib/utils';

export function GhostToggle() {
  const ghostsEnabled    = useGhostStore((s) => s.ghostsEnabled);
  const ghostCount       = useGhostStore((s) => s.ghostCount);
  const setGhostsEnabled = useGhostStore((s) => s.setGhostsEnabled);

  const ariaLabel = ghostsEnabled
    ? ghostCount > 0
      ? `${ghostCount} ghost${ghostCount > 1 ? 's' : ''} visible — click to hide`
      : 'Ghost riders enabled — click to disable'
    : 'Ghost riders off — click to enable';

  return (
    <button
      type="button"
      onClick={() => setGhostsEnabled(!ghostsEnabled)}
      aria-label={ariaLabel}
      aria-pressed={ghostsEnabled}
      title={ghostsEnabled ? 'Hide ghost riders' : 'Show ghost riders'}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold select-none',
        'glass glass-hairline border border-transparent',
        'transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'active:scale-95',
        ghostsEnabled && ghostCount > 0
          ? 'text-cyan-300 ring-1 ring-cyan-500/40 hover:ring-cyan-400/60'
          : ghostsEnabled && ghostCount === 0
            ? 'text-slate-400 ring-1 ring-slate-600/30 hover:ring-slate-500/50'
            : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {/* Ghost icon — a simple SVG phantom shape */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M7 1a5 5 0 0 0-5 5v6l1.5-1.5L5 12l1.5-1.5L7 11l.5.5L9 12l1.5-1.5L12 12V6A5 5 0 0 0 7 1Z" />
      </svg>

      <span aria-hidden="true">
        {ghostsEnabled
          ? ghostCount > 0
            ? `${ghostCount} ghost${ghostCount > 1 ? 's' : ''}`
            : 'Ghosts'
          : 'Ghosts off'}
      </span>
    </button>
  );
}
