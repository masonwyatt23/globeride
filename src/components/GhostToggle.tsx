/**
 * GhostToggle — a compact HUD button that enables/disables ghost riders and
 * shows how many ghost avatars are currently loaded on the globe.
 *
 * Self-contained: reads and writes ghostStore only. Mount it anywhere in the
 * Ride or Explore layout — it has no required props.
 */

import { useGhostStore } from '@/stores/ghostStore';

export function GhostToggle() {
  const ghostsEnabled = useGhostStore((s) => s.ghostsEnabled);
  const ghostCount = useGhostStore((s) => s.ghostCount);
  const setGhostsEnabled = useGhostStore((s) => s.setGhostsEnabled);

  return (
    <button
      type="button"
      onClick={() => setGhostsEnabled(!ghostsEnabled)}
      title={ghostsEnabled ? 'Hide ghost riders' : 'Show ghost riders'}
      className={[
        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold',
        'border transition-colors select-none',
        ghostsEnabled && ghostCount > 0
          ? 'border-cyan-500/60 bg-cyan-950/70 text-cyan-300 hover:bg-cyan-900/70'
          : ghostsEnabled && ghostCount === 0
            ? 'border-slate-600/50 bg-slate-900/70 text-slate-400 hover:bg-slate-800/70'
            : 'border-slate-700/40 bg-slate-950/50 text-slate-500 hover:bg-slate-900/60',
      ].join(' ')}
    >
      {/* Ghost icon — a simple SVG phantom shape */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M7 1a5 5 0 0 0-5 5v6l1.5-1.5L5 12l1.5-1.5L7 11l.5.5L9 12l1.5-1.5L12 12V6A5 5 0 0 0 7 1Z" />
      </svg>

      <span>
        {ghostsEnabled
          ? ghostCount > 0
            ? `${ghostCount} ghost${ghostCount > 1 ? 's' : ''}`
            : 'Ghosts'
          : 'Ghosts off'}
      </span>
    </button>
  );
}
