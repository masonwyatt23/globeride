/**
 * Achievements — badge grid shown inside the rider profile panel.
 *
 * Usage (integrator mounts this wherever appropriate, e.g. ProfilePanel):
 *   import { Achievements } from '@/components/Achievements';
 *   <Achievements />
 *
 * Locked badges render greyed-out with their unlock criteria.
 * Unlocked badges are full-colour with a timestamp.
 */

import { useState } from 'react';
import { Trophy, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACHIEVEMENTS, type AchievementTier } from '@/lib/achievements';
import { useAchievementStore } from '@/stores/achievementStore';

// ---------------------------------------------------------------------------
// Tier palette — maps a tier to visual styles
// ---------------------------------------------------------------------------

interface TierStyle {
  ring: string;
  glow: string;
  labelBg: string;
  labelText: string;
  label: string;
}

const TIER_STYLES: Record<AchievementTier, TierStyle> = {
  bronze: {
    ring:      'ring-amber-600/50',
    glow:      'shadow-amber-600/20',
    labelBg:   'bg-amber-600/15',
    labelText: 'text-amber-500 dark:text-amber-400',
    label:     'Bronze',
  },
  silver: {
    ring:      'ring-slate-400/60',
    glow:      'shadow-slate-400/20',
    labelBg:   'bg-slate-400/12',
    labelText: 'text-slate-400 dark:text-slate-300',
    label:     'Silver',
  },
  gold: {
    ring:      'ring-yellow-400/70',
    glow:      'shadow-yellow-400/25',
    labelBg:   'bg-yellow-400/12',
    labelText: 'text-yellow-400 dark:text-yellow-300',
    label:     'Gold',
  },
  platinum: {
    ring:      'ring-cyan-400/70',
    glow:      'shadow-cyan-400/30',
    labelBg:   'bg-cyan-400/12',
    labelText: 'text-cyan-400 dark:text-cyan-300',
    label:     'Platinum',
  },
};

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

type FilterTab = 'all' | 'unlocked' | 'locked';

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',      label: 'All'      },
  { id: 'unlocked', label: 'Earned'   },
  { id: 'locked',   label: 'Locked'   },
];

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function Achievements() {
  const unlockedMap = useAchievementStore((s) => s.unlocked);
  const [filter, setFilter] = useState<FilterTab>('all');

  const totalCount    = ACHIEVEMENTS.length;
  const unlockedCount = Object.keys(unlockedMap).length;

  const visible = ACHIEVEMENTS.filter((a) => {
    if (filter === 'unlocked') return a.id in unlockedMap;
    if (filter === 'locked')   return !(a.id in unlockedMap);
    return true;
  });

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <Trophy className="h-4 w-4" />
          <span>Achievements</span>
        </div>
        <span className="text-[11px] text-muted-foreground num">
          {unlockedCount} / {totalCount}
        </span>
      </div>

      {/* Overall progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700 ease-out"
          style={{ width: `${((unlockedCount / totalCount) * 100).toFixed(1)}%` }}
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              filter === tab.id
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Badge grid */}
      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-6 text-center">
          {filter === 'unlocked' ? (
            <>
              <Trophy className="h-7 w-7 mx-auto mb-2.5 text-muted-foreground/40" aria-hidden="true" />
              <p className="text-sm font-medium text-muted-foreground">No achievements earned yet</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">Complete rides and workouts to unlock badges.</p>
            </>
          ) : (
            <>
              <Lock className="h-7 w-7 mx-auto mb-2.5 text-muted-foreground/40" aria-hidden="true" />
              <p className="text-sm font-medium text-muted-foreground">All achievements unlocked!</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">You've earned every badge available.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {visible.map((achievement) => {
            const isUnlocked = achievement.id in unlockedMap;
            const unlockedAt  = unlockedMap[achievement.id];
            const ts          = TIER_STYLES[achievement.tier];

            return (
              <div
                key={achievement.id}
                title={isUnlocked ? achievement.description : `Locked: ${achievement.description}`}
                className={cn(
                  'relative flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-all duration-200 select-none',
                  isUnlocked
                    ? [
                        'border-transparent bg-card/60',
                        'ring-1',
                        ts.ring,
                        'shadow-md',
                        ts.glow,
                      ]
                    : 'border-border/30 bg-card/20 opacity-50',
                )}
              >
                {/* Icon face */}
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none',
                    isUnlocked
                      ? 'bg-card/80 ring-1 ring-inset ring-border/40'
                      : 'bg-muted/30',
                  )}
                >
                  {isUnlocked ? (
                    achievement.icon
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />
                  )}
                </div>

                {/* Name */}
                <div className="min-w-0 w-full">
                  <div className="text-[10px] font-semibold text-foreground leading-tight line-clamp-2">
                    {achievement.name}
                  </div>
                </div>

                {/* Tier label or unlock date */}
                {isUnlocked ? (
                  <div className="flex flex-col items-center gap-0.5 w-full">
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider',
                        ts.labelBg,
                        ts.labelText,
                      )}
                    >
                      {ts.label}
                    </span>
                    {unlockedAt && (
                      <span className="text-[9px] text-muted-foreground num">
                        {new Date(unlockedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[9px] text-muted-foreground leading-tight line-clamp-2">
                    {achievement.description}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
