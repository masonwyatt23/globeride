import { useState, useRef, useEffect } from 'react';
import {
  User,
  X,
  Trophy,
  TrendingUp,
  Bike,
  Mountain,
  Zap,
  CheckCircle2,
  Lock,
  ChevronRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Achievements } from '@/components/training/Achievements';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Section } from '@/components/ui/section-header';
import { useProfileStore } from '@/stores/profileStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { xpProgressInLevel, xpForLevel } from '@/lib/progression';
import { GEAR_CATALOG, type GearItem } from '@/lib/gear';
import { AVATAR_COLOR_ROLES } from '@/lib/avatarConfig';
import type { AvatarColors } from '@/lib/avatarConfig';

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function ProfilePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, createProfile, renameProfile } = useProfileStore();

  // Auto-create a default profile on first open so the panel is never empty.
  useEffect(() => {
    if (open && !profile) {
      createProfile('Rider');
    }
  }, [open, profile, createProfile]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Rider profile"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Rider Profile
          </CardTitle>
          <button
            onClick={onClose}
            aria-label="Close profile"
            className="rounded-full p-1.5 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </CardHeader>

        <CardContent className="space-y-6">
          {profile && (
            <>
              <IdentitySection
                displayName={profile.displayName}
                onRename={renameProfile}
              />
              <LevelSection xp={profile.xp} />
              <StatsSection profile={profile} />
              <GarageSection xp={profile.xp} />
              <Achievements />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identity — editable display name
// ---------------------------------------------------------------------------

function IdentitySection({
  displayName,
  onRename,
}: {
  displayName: string;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== displayName) onRename(trimmed);
    else setDraft(displayName);
    setEditing(false);
  }

  return (
    <Section icon={<User className="h-4 w-4" />} title="Identity">
      <div className="flex items-center gap-3">
        {/* Avatar swatch */}
        <div className="h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-primary/30 via-primary/15 to-accent/20 ring-2 ring-inset ring-border/60 flex items-center justify-center">
          <User className="h-5 w-5 text-primary" />
        </div>

        {editing ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') { setDraft(displayName); setEditing(false); }
              }}
              onBlur={commit}
              maxLength={32}
              className="flex-1 rounded-md border border-primary/60 bg-background px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              aria-label="Display name"
              spellCheck={false}
            />
            <Button size="sm" variant="accent" aria-label="Save display name" onMouseDown={(e) => { e.preventDefault(); commit(); }}>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-between min-w-0">
            <span className="text-base font-semibold text-foreground truncate">{displayName}</span>
            <button
              onClick={() => { setDraft(displayName); setEditing(true); }}
              className="ml-2 shrink-0 text-[11px] text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              Rename
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Level + XP progress bar
// ---------------------------------------------------------------------------

function LevelSection({ xp }: { xp: number }) {
  const { level, into, needed, pct } = xpProgressInLevel(xp);
  const nextLevel = level + 1;
  const nextLevelTotalXp = xpForLevel(nextLevel);

  return (
    <Section icon={<Trophy className="h-4 w-4" />} title="Level">
      <div className="space-y-3">
        {/* Level badge row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-accent/20 ring-1 ring-inset ring-border/60">
              <span className="text-sm font-bold text-primary num">{level}</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Level {level}</div>
              <div className="text-[11px] text-muted-foreground num">
                {xp.toLocaleString()} XP total
              </div>
            </div>
          </div>
          {nextLevel <= 50 && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span className="num">{into.toLocaleString()}</span>
              <span>/</span>
              <span className="num">{needed.toLocaleString()} XP</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium">Lvl {nextLevel}</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700 ease-out"
              style={{ width: `${Math.min(100, pct * 100).toFixed(1)}%` }}
            />
          </div>
          {nextLevel <= 50 && (
            <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground num">
              <span>Lvl {level}</span>
              <span>Lvl {nextLevel} at {nextLevelTotalXp.toLocaleString()} XP</span>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Lifetime stats
// ---------------------------------------------------------------------------

function StatsSection({
  profile,
}: {
  profile: {
    totalRides: number;
    totalDistanceM: number;
    totalAscentM: number;
    totalWorkoutsCompleted: number;
    xp: number;
  };
}) {
  const distKm = (profile.totalDistanceM / 1000).toFixed(1);
  const ascentM = Math.round(profile.totalAscentM).toLocaleString();

  return (
    <Section icon={<TrendingUp className="h-4 w-4" />} title="Lifetime Stats">
      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={<Bike className="h-3.5 w-3.5" />} label="Rides" value={profile.totalRides.toLocaleString()} />
        <StatCard icon={<TrendingUp className="h-3.5 w-3.5" />} label="Distance" value={`${distKm} km`} />
        <StatCard icon={<Mountain className="h-3.5 w-3.5" />} label="Ascent" value={`${ascentM} m`} />
        <StatCard icon={<Zap className="h-3.5 w-3.5" />} label="Workouts" value={profile.totalWorkoutsCompleted.toLocaleString()} />
      </div>
    </Section>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card/40 px-3 py-2.5">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-sm font-semibold text-foreground num truncate">{value}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gear Garage
// ---------------------------------------------------------------------------

function GarageSection({ xp }: { xp: number }) {
  const { level } = xpProgressInLevel(xp);
  const avatar = useSettingsStore((st) => st.avatar);
  const setSettings = useSettingsStore((st) => st.setSettings);

  /** Check if the given gear colors match the currently equipped avatar. */
  function isEquipped(colors: AvatarColors): boolean {
    return AVATAR_COLOR_ROLES.every((r) => colors[r.key] === avatar[r.key]);
  }

  return (
    <Section icon={<Bike className="h-4 w-4" />} title="Gear Garage">
      <div className="grid grid-cols-2 gap-2">
        {GEAR_CATALOG.map((item) => (
          <GearCard
            key={item.id}
            item={item}
            unlocked={item.unlockLevel <= level}
            equipped={isEquipped(item.colors)}
            onEquip={() => setSettings({ avatar: item.colors })}
          />
        ))}
      </div>
    </Section>
  );
}

function GearCard({
  item,
  unlocked,
  equipped,
  onEquip,
}: {
  item: GearItem;
  unlocked: boolean;
  equipped: boolean;
  onEquip: () => void;
}) {
  // Build a mini color swatch from the gear's palette
  const swatchColors = [item.colors.kit, item.colors.frame, item.colors.accent];

  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 rounded-xl border p-3 transition-all duration-200',
        unlocked
          ? equipped
            ? 'border-primary/60 bg-primary/8 ring-1 ring-primary/30'
            : 'border-border bg-card/40 hover:border-border/80 hover:bg-card/60'
          : 'border-border/40 bg-card/20 opacity-50',
      )}
    >
      {/* Color swatch strip */}
      <div className="flex h-2 w-full overflow-hidden rounded-full gap-px">
        {swatchColors.map((color, i) => (
          <div
            key={i}
            className="flex-1 rounded-full"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      {/* Name + kind */}
      <div className="min-w-0">
        <div className="text-xs font-semibold text-foreground truncate">{item.name}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {item.kind}
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between gap-1">
        {unlocked ? (
          equipped ? (
            <Badge variant="success" className="gap-1 text-[10px] px-1.5 py-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Equipped
            </Badge>
          ) : (
            <button
              onClick={onEquip}
              className="text-[11px] font-medium text-primary hover:text-primary/80 underline underline-offset-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              Equip
            </button>
          )
        ) : (
          <div
            className="flex items-center gap-1 text-[11px] text-muted-foreground"
            aria-label={`Unlocks at level ${item.unlockLevel}`}
          >
            <Lock className="h-3 w-3" aria-hidden="true" />
            <span className="num">Lvl {item.unlockLevel}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProfileButton — drop into any toolbar; manages its own open/close state.
// ---------------------------------------------------------------------------

export function ProfileButton({
  className,
  variant = 'outline',
  size = 'icon',
}: {
  className?: string;
  variant?: 'outline' | 'ghost' | 'default' | 'accent';
  size?: 'icon' | 'sm' | 'default' | 'lg';
}) {
  const [open, setOpen] = useState(false);
  const profile = useProfileStore((s) => s.profile);
  const xp = profile?.xp ?? 0;
  const { level } = xpProgressInLevel(xp);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn('relative', className)}
        onClick={() => setOpen(true)}
        aria-label="Open rider profile"
        title="Rider Profile"
      >
        <User className="h-4 w-4" />
        {/* Level badge pip */}
        {profile && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground leading-none num pointer-events-none">
            {level}
          </span>
        )}
      </Button>
      <ProfilePanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
