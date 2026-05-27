/**
 * PaceBotsPanel — pre-ride pace-partner picker.
 *
 * Renders a grid of AI pace-bot cards (from BOT_PRESETS in paceBots.ts).
 * The user can select 0–3 bots to ride with; the selection is written into
 * rideStore.paceBots before the ride starts.
 *
 * Integration contract (paceBots.ts, created by parallel agent):
 *   export interface PaceBot { name: string; personality: string; ftpW: number; weightKg: number; colorHex?: string; }
 *   export const BOT_PRESETS: PaceBot[];
 *
 * If paceBots.ts hasn't landed yet, the LOCAL_STUB below is used automatically.
 */

import { useState, useCallback } from 'react';
import { Check, Shuffle, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useRideStore } from '@/stores/rideStore';

// ---------------------------------------------------------------------------
// PaceBot type + preset stub
// (real values come from src/lib/paceBots.ts once it lands)
// ---------------------------------------------------------------------------

export interface PaceBot {
  /** Display name */
  name: string;
  /** Personality tag — "Climber" | "Sprinter" | "Steady" | "Attacker" */
  personality: string;
  /** FTP in watts */
  ftpW: number;
  /** Body weight in kg */
  weightKg: number;
  /** Accent hex colour — used for the card ring + chip */
  colorHex?: string;
}

// Attempt to import from the real module; fall back silently to the stub.
let resolvedPresets: PaceBot[] | null = null;
try {
  // Dynamic require so a missing module doesn't break the build.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/lib/paceBots') as { BOT_PRESETS?: PaceBot[] };
  if (Array.isArray(mod.BOT_PRESETS) && mod.BOT_PRESETS.length > 0) {
    resolvedPresets = mod.BOT_PRESETS;
  }
} catch {
  // paceBots.ts not yet present — use stub below.
}

const LOCAL_STUB: PaceBot[] = [
  {
    name: 'Steady Eddie',
    personality: 'Steady',
    ftpW: 220,
    weightKg: 72,
    colorHex: '#3b82f6', // blue
  },
  {
    name: 'Alpe Ana',
    personality: 'Climber',
    ftpW: 260,
    weightKg: 58,
    colorHex: '#8b5cf6', // violet
  },
  {
    name: 'Sprint King',
    personality: 'Sprinter',
    ftpW: 300,
    weightKg: 80,
    colorHex: '#f59e0b', // amber
  },
  {
    name: 'Chaos Carlo',
    personality: 'Attacker',
    ftpW: 280,
    weightKg: 68,
    colorHex: '#ef4444', // red
  },
];

const BOT_PRESETS: PaceBot[] = resolvedPresets ?? LOCAL_STUB;

// ---------------------------------------------------------------------------
// Personality metadata
// ---------------------------------------------------------------------------

interface PersonalityMeta {
  blurb: string;
  /** Tailwind bg + text for the chip */
  chipClasses: string;
  /** Tailwind ring colour for the selected state */
  ringColor: string;
  /** Tailwind bg tint for the card when selected */
  selectedBg: string;
}

const PERSONALITY_META: Record<string, PersonalityMeta> = {
  Steady: {
    blurb: 'Holds a steel pace, never blows up.',
    chipClasses: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
    ringColor: 'ring-sky-500/50',
    selectedBg: 'bg-sky-500/6',
  },
  Climber: {
    blurb: 'Lights it up on every climb.',
    chipClasses: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30',
    ringColor: 'ring-violet-500/50',
    selectedBg: 'bg-violet-500/6',
  },
  Sprinter: {
    blurb: 'Hides until the last 200 m, then sprints.',
    chipClasses: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    ringColor: 'ring-amber-500/50',
    selectedBg: 'bg-amber-500/6',
  },
  Attacker: {
    blurb: 'Random vicious attacks.',
    chipClasses: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
    ringColor: 'ring-rose-500/50',
    selectedBg: 'bg-rose-500/6',
  },
};

const DEFAULT_META: PersonalityMeta = {
  blurb: 'A capable pace partner.',
  chipClasses: 'bg-muted/60 text-muted-foreground border-border/60',
  ringColor: 'ring-border/60',
  selectedBg: 'bg-muted/10',
};

function getPersonalityMeta(personality: string): PersonalityMeta {
  return PERSONALITY_META[personality] ?? DEFAULT_META;
}

// ---------------------------------------------------------------------------
// Max selection cap
// ---------------------------------------------------------------------------

const MAX_BOTS = 3;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface PaceBotsPanelProps {
  className?: string;
}

export function PaceBotsPanel({ className }: PaceBotsPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Write to the store whenever selection changes.
  const syncStore = useCallback((names: Set<string>) => {
    const bots = BOT_PRESETS.filter((b) => names.has(b.name));
    // setPaceBots is added by the original store agent; guard in case it's
    // not landed yet so nothing throws during the transition period.
    const store = useRideStore.getState() as unknown as Record<string, unknown>;
    if (typeof store.setPaceBots === 'function') {
      (store.setPaceBots as (bots: PaceBot[]) => void)(bots);
    }
  }, []);

  const toggle = useCallback(
    (name: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(name)) {
          next.delete(name);
        } else {
          if (next.size >= MAX_BOTS) return prev; // cap at 3
          next.add(name);
        }
        syncStore(next);
        return next;
      });
    },
    [syncStore],
  );

  const surpriseMe = useCallback(() => {
    // Pick 2 random distinct bots.
    const shuffled = [...BOT_PRESETS].sort(() => Math.random() - 0.5).slice(0, 2);
    const next = new Set(shuffled.map((b) => b.name));
    setSelected(next);
    syncStore(next);
  }, [syncStore]);

  const clearAll = useCallback(() => {
    const next = new Set<string>();
    setSelected(next);
    syncStore(next);
  }, [syncStore]);

  const count = selected.size;

  return (
    <div className={cn('flex flex-col gap-4', className)}>

      {/* Header row */}
      <div className="flex flex-col gap-0.5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Ride solo, or invite up to 3 AI riders to push you.
        </p>
      </div>

      {/* Bot grid */}
      <div
        role="group"
        aria-label="Pace partner selection"
        className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
      >
        {BOT_PRESETS.map((bot) => {
          const isSelected = selected.has(bot.name);
          const meta = getPersonalityMeta(bot.personality);
          const isDisabled = !isSelected && count >= MAX_BOTS;

          return (
            <BotCard
              key={bot.name}
              bot={bot}
              meta={meta}
              isSelected={isSelected}
              isDisabled={isDisabled}
              onToggle={() => toggle(bot.name)}
            />
          );
        })}
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Selection count indicator */}
        <span
          className={cn(
            'text-[11px] font-semibold tabular-nums transition-colors',
            count > 0 ? 'text-foreground' : 'text-muted-foreground/60',
          )}
          aria-live="polite"
          aria-atomic="true"
        >
          {count > 0 ? `${count} / ${MAX_BOTS} selected` : 'No pace partners selected'}
        </span>

        <div className="flex items-center gap-2">
          {/* "No bots" / clear toggle */}
          <button
            type="button"
            aria-pressed={count === 0}
            onClick={clearAll}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              count === 0
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/60 bg-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <UserX className="h-3 w-3" aria-hidden />
            Ride solo
          </button>

          {/* Surprise me */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 gap-1.5 text-[11px]"
            onClick={surpriseMe}
          >
            <Shuffle className="h-3 w-3" aria-hidden />
            Surprise me
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual bot card
// ---------------------------------------------------------------------------

interface BotCardProps {
  bot: PaceBot;
  meta: PersonalityMeta;
  isSelected: boolean;
  isDisabled: boolean;
  onToggle: () => void;
}

function BotCard({ bot, meta, isSelected, isDisabled, onToggle }: BotCardProps) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      disabled={isDisabled}
      onClick={onToggle}
      className={cn(
        // Base layout
        'relative w-full text-left rounded-xl border p-3 transition-all duration-150 outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        // Default state
        !isSelected && !isDisabled && 'border-border/60 bg-card/40 hover:border-border/90 hover:bg-card/60',
        // Selected state: 2px accent ring + tinted bg
        isSelected && [
          'border-transparent ring-2',
          meta.ringColor,
          meta.selectedBg,
        ],
        // Disabled / cap-reached state
        isDisabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      {/* Checkmark badge — top-right corner when selected */}
      {isSelected && (
        <span
          aria-hidden
          className={cn(
            'absolute top-2 right-2 flex h-4.5 w-4.5 items-center justify-center rounded-full',
            'bg-primary text-primary-foreground shadow-sm',
          )}
          style={{ height: '1.125rem', width: '1.125rem' }}
        >
          <Check className="h-2.5 w-2.5 stroke-[3]" />
        </span>
      )}

      {/* Bot name */}
      <div className="flex items-start gap-2 pr-5">
        {/* Colour dot using bot.colorHex */}
        <span
          aria-hidden
          className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: bot.colorHex ?? '#888' }}
        />
        <span className="text-sm font-bold text-foreground leading-snug">{bot.name}</span>
      </div>

      {/* Personality chip */}
      <div className="mt-1.5 mb-1">
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-semibold leading-5',
            meta.chipClasses,
          )}
        >
          {bot.personality}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground num">
        <span>{bot.ftpW} W FTP</span>
        <span className="opacity-40">·</span>
        <span>{bot.weightKg} kg</span>
      </div>

      {/* Blurb */}
      <p className="mt-1 text-[11px] text-muted-foreground/80 leading-snug italic">
        {meta.blurb}
      </p>
    </button>
  );
}
