/**
 * Gear Garage — elite redesign.
 *
 * Self-contained: reads XP from profileStore and avatar from settingsStore
 * directly, so ProfilePanel just mounts <Garage /> with no props.
 *
 * Wave 19 extension point: add 'helmet' | 'glasses' to GearKind in gear.ts,
 * add items to GEAR_CATALOG, and the category tabs here auto-expand — just
 * add them to CATEGORY_CONFIG below.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bike,
  Shirt,
  HardHat,
  CheckCircle2,
  Lock,
  Palette,
  X,
  RotateCcw,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Section } from '@/components/ui/section-header';
import { useProfileStore } from '@/stores/profileStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { xpProgressInLevel, xpForLevel } from '@/lib/progression';
import { GEAR_CATALOG, HELMETS, type GearItem, type GearKind, type HelmetItem } from '@/lib/gear';
import {
  AVATAR_COLOR_ROLES,
  AVATAR_PRESETS,
  DEFAULT_AVATAR_COLORS,
  type AvatarColors,
} from '@/lib/avatarConfig';

// ---------------------------------------------------------------------------
// Category config — bikes, kits, helmets
// ---------------------------------------------------------------------------

interface CategoryConfig {
  kind: GearKind;
  label: string;
  icon: React.ReactNode;
}

const CATEGORY_CONFIG: CategoryConfig[] = [
  { kind: 'bike',   label: 'Bikes',   icon: <Bike    className="h-3.5 w-3.5" /> },
  { kind: 'kit',    label: 'Kits',    icon: <Shirt   className="h-3.5 w-3.5" /> },
  { kind: 'helmet', label: 'Helmets', icon: <HardHat className="h-3.5 w-3.5" /> },
];

// ---------------------------------------------------------------------------
// SVG gear visuals
// ---------------------------------------------------------------------------

/** Stylised side-view road bike silhouette. Tinted with gear's frame/wheel/accent colours. */
function BikeSvg({
  frame,
  wheel,
  accent,
  className,
}: {
  frame: string;
  wheel: string;
  accent: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('w-full', className)}
      aria-hidden="true"
    >
      {/* Rear wheel */}
      <circle cx="24" cy="44" r="16" stroke={wheel} strokeWidth="3.5" fill="none" />
      <circle cx="24" cy="44" r="4"  fill={wheel} />
      {/* Front wheel */}
      <circle cx="96" cy="44" r="16" stroke={wheel} strokeWidth="3.5" fill="none" />
      <circle cx="96" cy="44" r="4"  fill={wheel} />
      {/* Spokes rear */}
      <line x1="24" y1="28" x2="24" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="10" y1="37" x2="24" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="14" y1="52" x2="24" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="34" y1="55" x2="24" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="38" y1="37" x2="24" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      {/* Spokes front */}
      <line x1="96" y1="28" x2="96" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="82" y1="37" x2="96" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="86" y1="55" x2="96" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="106" y1="55" x2="96" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="110" y1="37" x2="96" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      {/* Chain stay */}
      <line x1="24" y1="44" x2="58" y2="44" stroke={frame} strokeWidth="2.5" />
      {/* Down tube */}
      <line x1="58" y1="44" x2="72" y2="16" stroke={frame} strokeWidth="3" strokeLinecap="round" />
      {/* Seat tube */}
      <line x1="58" y1="44" x2="62" y2="16" stroke={frame} strokeWidth="3" strokeLinecap="round" />
      {/* Top tube */}
      <line x1="62" y1="16" x2="84" y2="18" stroke={frame} strokeWidth="2.5" strokeLinecap="round" />
      {/* Fork */}
      <line x1="84" y1="18" x2="96" y2="44" stroke={frame} strokeWidth="2.5" strokeLinecap="round" />
      {/* Head tube */}
      <line x1="72" y1="16" x2="84" y2="18" stroke={frame} strokeWidth="3.5" strokeLinecap="round" />
      {/* Seat post */}
      <line x1="62" y1="16" x2="60" y2="9" stroke={frame} strokeWidth="2.5" strokeLinecap="round" />
      {/* Saddle */}
      <path d="M54 9 Q60 6 66 9" stroke={accent} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* Handlebar stem */}
      <line x1="84" y1="18" x2="87" y2="13" stroke={frame} strokeWidth="2" strokeLinecap="round" />
      {/* Handlebar drop */}
      <path d="M83 11 Q87 10 91 13" stroke={accent} strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Bottom bracket */}
      <circle cx="58" cy="44" r="4" fill={accent} />
      {/* Crank arm */}
      <line x1="58" y1="44" x2="65" y2="50" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      <circle cx="65" cy="50" r="2" fill={frame} />
    </svg>
  );
}

/** Stylised jersey / kit shape. Tinted with kit colour and accent. */
function JerseySvg({
  kit,
  accent,
  className,
}: {
  kit: string;
  accent: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('w-full', className)}
      aria-hidden="true"
    >
      {/* Main body */}
      <path
        d="M28 18 L14 30 L20 36 L26 30 L26 62 L74 62 L74 30 L80 36 L86 30 L72 18 C68 10 60 8 50 8 C40 8 32 10 28 18Z"
        fill={kit}
        opacity="0.9"
      />
      {/* Collar */}
      <path
        d="M38 8 Q50 4 62 8 Q58 16 50 17 Q42 16 38 8Z"
        fill={accent}
        opacity="0.85"
      />
      {/* Left sleeve */}
      <path
        d="M28 18 L14 30 L20 36 L26 30 L30 20Z"
        fill={accent}
        opacity="0.75"
      />
      {/* Right sleeve */}
      <path
        d="M72 18 L86 30 L80 36 L74 30 L70 20Z"
        fill={accent}
        opacity="0.75"
      />
      {/* Center stripe */}
      <rect x="46" y="17" width="8" height="45" fill={accent} opacity="0.25" rx="2" />
      {/* Zipper line */}
      <line x1="50" y1="17" x2="50" y2="62" stroke={accent} strokeWidth="1" opacity="0.5" strokeDasharray="3,3" />
      {/* Pocket stripe */}
      <rect x="26" y="46" width="48" height="6" fill={accent} opacity="0.2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helmet SVG illustrations — one per helmet id
// ---------------------------------------------------------------------------

/** Starter helmet: simple round vented shell (entry-level road lid). */
function HelmetStarterSvg({ shell, accent }: { shell: string; accent: string }) {
  return (
    <svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-full">
      {/* Main shell dome */}
      <path d="M10 38 Q10 10 40 10 Q70 10 70 38 L66 42 Q40 48 14 42Z" fill={shell} opacity="0.92" />
      {/* Vent slots */}
      <rect x="24" y="16" width="6" height="12" rx="3" fill={accent} opacity="0.70" />
      <rect x="34" y="13" width="6" height="14" rx="3" fill={accent} opacity="0.70" />
      <rect x="44" y="16" width="6" height="12" rx="3" fill={accent} opacity="0.70" />
      {/* Retention clip highlight */}
      <path d="M14 42 Q40 50 66 42" stroke={accent} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.8" />
      {/* Visor brim */}
      <path d="M14 42 Q10 46 12 50 Q40 56 68 50 Q70 46 66 42" fill={shell} opacity="0.65" />
    </svg>
  );
}

/** Aero TT helmet: elongated teardrop tail, smooth shell, no vents. */
function HelmetAeroSvg({ shell, accent }: { shell: string; accent: string }) {
  return (
    <svg viewBox="0 0 90 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-full">
      {/* Teardrop shell */}
      <path d="M8 36 Q8 12 38 10 Q58 10 72 18 Q84 26 82 40 L76 44 Q50 52 18 44Z" fill={shell} opacity="0.93" />
      {/* Aero tail */}
      <path d="M72 18 Q86 24 84 38 L76 44 Q80 32 72 18Z" fill={shell} opacity="0.75" />
      {/* Single center seam line */}
      <path d="M36 10 Q44 10 72 18" stroke={accent} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6" />
      {/* Gloss highlight */}
      <path d="M20 20 Q34 14 50 16" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.25" />
      {/* Retention buckle strip */}
      <path d="M18 44 Q50 54 76 44" stroke={accent} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.85" />
      {/* Visor edge */}
      <path d="M8 36 Q6 42 10 46 Q14 50 18 44" fill={accent} opacity="0.55" />
    </svg>
  );
}

/** Road Vent helmet: round shell with generous vent channels and a short visor. */
function HelmetRoadSvg({ shell, accent }: { shell: string; accent: string }) {
  return (
    <svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-full">
      {/* Main shell */}
      <path d="M12 38 Q12 8 40 8 Q68 8 68 38 L64 43 Q40 50 16 43Z" fill={shell} opacity="0.90" />
      {/* Large vent channels */}
      <rect x="19" y="14" width="7" height="16" rx="3.5" fill={accent} opacity="0.65" />
      <rect x="30" y="11" width="7" height="18" rx="3.5" fill={accent} opacity="0.65" />
      <rect x="41" y="11" width="7" height="18" rx="3.5" fill={accent} opacity="0.65" />
      <rect x="52" y="14" width="7" height="16" rx="3.5" fill={accent} opacity="0.65" />
      {/* Retention harness line */}
      <path d="M16 43 Q40 52 64 43" stroke={accent} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9" />
      {/* Short front visor */}
      <path d="M12 38 Q8 43 10 47 Q14 50 20 46 L16 43Z" fill={shell} opacity="0.70" />
      {/* Shell highlight */}
      <path d="M22 16 Q34 10 50 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.20" />
    </svg>
  );
}

/** Pro Aero helmet: aggressive low-profile teardrop with accent trim lines. */
function HelmetProSvg({ shell, accent }: { shell: string; accent: string }) {
  return (
    <svg viewBox="0 0 90 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-full">
      {/* Extended teardrop shell */}
      <path d="M6 34 Q6 10 36 8 Q62 8 78 22 Q88 32 86 44 L78 48 Q50 56 16 46Z" fill={shell} opacity="0.95" />
      {/* Long aero tail fin */}
      <path d="M78 22 Q92 30 88 44 L78 48 Q84 38 78 22Z" fill={shell} opacity="0.70" />
      {/* Accent trim lines */}
      <path d="M16 46 Q50 56 78 48" stroke={accent} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.90" />
      <path d="M34 8 Q62 8 78 22" stroke={accent} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.55" />
      {/* Accent stripe along flank */}
      <path d="M10 30 Q30 18 60 16 Q74 16 82 26" stroke={accent} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.40" />
      {/* Gloss highlight */}
      <path d="M18 18 Q36 10 56 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.22" />
      {/* Visor cutout */}
      <path d="M6 34 Q4 40 8 44 Q12 48 16 46 L10 38Z" fill={accent} opacity="0.50" />
    </svg>
  );
}

/** Dispatch the right SVG by helmet id, tinted with the user's avatar.helmet color. */
function HelmetVisual({
  item,
  helmetColor,
  size = 'md',
}: {
  item: HelmetItem;
  helmetColor: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const h = size === 'sm' ? 'h-10' : size === 'lg' ? 'h-20' : 'h-14';
  // Blend catalog accentColor with avatar helmet tint: use accentColor as-is,
  // override the shell with the user's chosen helmet color.
  const shell  = helmetColor;
  const accent = item.accentColor;

  const svgProps = { shell, accent };

  return (
    <div className={cn(h, 'w-full flex items-center justify-center px-2')}>
      {item.id === 'helmet-aero' && <HelmetAeroSvg  {...svgProps} />}
      {item.id === 'helmet-road' && <HelmetRoadSvg  {...svgProps} />}
      {item.id === 'helmet-pro'  && <HelmetProSvg   {...svgProps} />}
      {item.id === 'helmet-starter' && <HelmetStarterSvg {...svgProps} />}
      {/* Fallback for any future helmets */}
      {!['helmet-aero', 'helmet-road', 'helmet-pro', 'helmet-starter'].includes(item.id) && (
        <HelmetStarterSvg {...svgProps} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helmet gear card
// ---------------------------------------------------------------------------

function HelmetCard({
  item,
  unlocked,
  equipped,
  xp,
  helmetColor,
  onEquip,
}: {
  item: HelmetItem;
  unlocked: boolean;
  equipped: boolean;
  xp: number;
  helmetColor: string;
  onEquip: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  // Reuse the same LockedTooltip shape — build a minimal GearItem-compatible object
  const fakeGearItem: GearItem = {
    id: item.id,
    name: item.name,
    kind: 'helmet',
    unlockLevel: item.unlockLevel,
    colors: {
      frame: item.defaultColor,
      wheel: item.defaultColor,
      kit: item.defaultColor,
      skin: '#d8a877',
      helmet: item.defaultColor,
      accent: item.accentColor,
    },
  };

  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 rounded-xl border p-3 transition-all duration-200 select-none',
        unlocked
          ? equipped
            ? 'border-primary/50 bg-primary/6 ring-1 ring-primary/25 shadow-[0_0_18px_-4px_hsl(var(--primary)/0.30)]'
            : 'border-border bg-card/40 hover:border-border/70 hover:bg-card/60 hover:-translate-y-0.5 hover:shadow-md cursor-pointer'
          : 'border-border/30 bg-card/15 opacity-60 cursor-pointer',
      )}
      onClick={() => {
        if (!unlocked) { setShowTooltip((v) => !v); return; }
        if (!equipped) onEquip();
      }}
      role={unlocked && !equipped ? 'button' : undefined}
      aria-label={
        unlocked
          ? equipped
            ? `${item.name} — currently equipped`
            : `Equip ${item.name}`
          : `${item.name} — locked until level ${item.unlockLevel}`
      }
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!unlocked) { setShowTooltip((v) => !v); return; }
          if (!equipped) onEquip();
        }
        if (e.key === 'Escape') setShowTooltip(false);
      }}
    >
      {/* Equipped glow accent bar */}
      {equipped && (
        <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-gradient-to-r from-primary/60 via-primary to-accent/60" />
      )}

      {/* Helmet visual */}
      <HelmetVisual item={item} helmetColor={helmetColor} size="md" />

      {/* Name + kind chip */}
      <div className="flex items-start justify-between gap-1 min-w-0">
        <div className="min-w-0">
          <div className="text-xs font-bold text-foreground truncate leading-tight">{item.name}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5">HELMET</div>
        </div>
        {/* Color dot pair */}
        <div className="flex gap-0.5 shrink-0 mt-0.5">
          {[item.defaultColor, item.accentColor].map((c, i) => (
            <div
              key={i}
              className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-1 min-h-[20px]">
        {unlocked ? (
          equipped ? (
            <Badge variant="success" className="gap-1 text-[10px] px-1.5 py-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
              Equipped
            </Badge>
          ) : (
            <span className="text-[11px] font-medium text-primary/80">Tap to equip</span>
          )
        ) : (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Lock className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
            <span className="font-medium">Level {item.unlockLevel}</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="num">{xpForLevel(item.unlockLevel).toLocaleString()} XP</span>
          </div>
        )}
      </div>

      {/* XP progress for locked items */}
      {!unlocked && (
        <div className="h-1 w-full rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500/70 to-amber-300/70 transition-all duration-500"
            style={{ width: `${(Math.min(1, xp / xpForLevel(item.unlockLevel)) * 100).toFixed(1)}%` }}
          />
        </div>
      )}

      {/* Locked tooltip */}
      {showTooltip && !unlocked && (
        <LockedTooltip item={fakeGearItem} xp={xp} onClose={() => setShowTooltip(false)} />
      )}
    </div>
  );
}

/** Compact gear visual — picks bike or jersey based on kind. */
function GearVisual({
  item,
  size = 'md',
}: {
  item: GearItem;
  size?: 'sm' | 'md' | 'lg';
}) {
  const h = size === 'sm' ? 'h-10' : size === 'lg' ? 'h-20' : 'h-14';
  if (item.kind === 'bike') {
    return (
      <div className={cn(h, 'w-full flex items-center justify-center px-1')}>
        <BikeSvg
          frame={item.colors.frame}
          wheel={item.colors.wheel}
          accent={item.colors.accent}
          className="max-h-full"
        />
      </div>
    );
  }
  return (
    <div className={cn(h, 'w-full flex items-center justify-center px-4')}>
      <JerseySvg
        kit={item.colors.kit}
        accent={item.colors.accent}
        className="max-h-full"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// XP unlock tooltip (shown when clicking a locked card)
// ---------------------------------------------------------------------------

function LockedTooltip({
  item,
  xp,
  onClose,
}: {
  item: GearItem;
  xp: number;
  onClose: () => void;
}) {
  const needed = xpForLevel(item.unlockLevel);
  const pct    = Math.min(1, xp / needed);
  const ref    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="tooltip"
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 w-56 rounded-xl border border-border bg-card/95 backdrop-blur-sm p-3 shadow-xl text-xs space-y-2"
    >
      <div className="flex items-center gap-1.5 font-semibold text-foreground">
        <Lock className="h-3 w-3 text-amber-400" aria-hidden="true" />
        Unlocks at Level {item.unlockLevel}
      </div>
      <div className="space-y-1.5">
        <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-300 transition-all duration-500"
            style={{ width: `${(pct * 100).toFixed(1)}%` }}
          />
        </div>
        <div className="flex justify-between text-muted-foreground num">
          <span>{xp.toLocaleString()} XP</span>
          <span>{needed.toLocaleString()} XP needed</span>
        </div>
      </div>
      <p className="text-muted-foreground leading-relaxed">
        Earn XP by riding (10/km), completing workouts (+250), and finishing routes.
      </p>
      {/* Arrow */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 w-2.5 h-1.5 overflow-hidden">
        <div className="w-2 h-2 bg-card/95 border-r border-b border-border rotate-45 mx-auto -mt-1" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual gear card
// ---------------------------------------------------------------------------

function GearCard({
  item,
  unlocked,
  equipped,
  xp,
  onEquip,
}: {
  item: GearItem;
  unlocked: boolean;
  equipped: boolean;
  xp: number;
  onEquip: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const kindLabel = item.kind === 'bike' ? 'BIKE' : 'KIT';

  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 rounded-xl border p-3 transition-all duration-200 select-none',
        unlocked
          ? equipped
            ? 'border-primary/50 bg-primary/6 ring-1 ring-primary/25 shadow-[0_0_18px_-4px_hsl(var(--primary)/0.30)]'
            : 'border-border bg-card/40 hover:border-border/70 hover:bg-card/60 hover:-translate-y-0.5 hover:shadow-md cursor-pointer'
          : 'border-border/30 bg-card/15 opacity-60 cursor-pointer',
      )}
      onClick={() => {
        if (!unlocked) { setShowTooltip((v) => !v); return; }
        if (!equipped) onEquip();
      }}
      role={unlocked && !equipped ? 'button' : undefined}
      aria-label={
        unlocked
          ? equipped
            ? `${item.name} — currently equipped`
            : `Equip ${item.name}`
          : `${item.name} — locked until level ${item.unlockLevel}`
      }
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!unlocked) { setShowTooltip((v) => !v); return; }
          if (!equipped) onEquip();
        }
        if (e.key === 'Escape') setShowTooltip(false);
      }}
    >
      {/* Equipped glow accent bar */}
      {equipped && (
        <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-gradient-to-r from-primary/60 via-primary to-accent/60" />
      )}

      {/* Gear visual */}
      <GearVisual item={item} size="md" />

      {/* Name + kind chip */}
      <div className="flex items-start justify-between gap-1 min-w-0">
        <div className="min-w-0">
          <div className="text-xs font-bold text-foreground truncate leading-tight">{item.name}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5">{kindLabel}</div>
        </div>
        {/* Color dot trio */}
        <div className="flex gap-0.5 shrink-0 mt-0.5">
          {[item.colors.kit, item.colors.frame, item.colors.accent].map((c, i) => (
            <div
              key={i}
              className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-1 min-h-[20px]">
        {unlocked ? (
          equipped ? (
            <Badge variant="success" className="gap-1 text-[10px] px-1.5 py-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
              Equipped
            </Badge>
          ) : (
            <span className="text-[11px] font-medium text-primary/80">Tap to equip</span>
          )
        ) : (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Lock className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
            <span className="font-medium">Level {item.unlockLevel}</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="num">{xpForLevel(item.unlockLevel).toLocaleString()} XP</span>
          </div>
        )}
      </div>

      {/* XP progress for locked items */}
      {!unlocked && (
        <div className="h-1 w-full rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500/70 to-amber-300/70 transition-all duration-500"
            style={{ width: `${(Math.min(1, xp / xpForLevel(item.unlockLevel)) * 100).toFixed(1)}%` }}
          />
        </div>
      )}

      {/* Locked tooltip */}
      {showTooltip && !unlocked && (
        <LockedTooltip item={item} xp={xp} onClose={() => setShowTooltip(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active gear summary strip (above the grid)
// ---------------------------------------------------------------------------

function ActiveGearSummary({
  equippedBike,
  equippedKit,
  equippedHelmet,
  onCustomize,
}: {
  equippedBike: GearItem | undefined;
  equippedKit: GearItem | undefined;
  equippedHelmet: HelmetItem | undefined;
  onCustomize: () => void;
}) {
  const avatar = useSettingsStore((s) => s.avatar);

  return (
    <div className="rounded-xl border border-border bg-card/50 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          Currently Equipped
        </span>
        <button
          onClick={onCustomize}
          aria-label="Customize avatar colors"
          className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary px-1"
        >
          <Palette className="h-3 w-3" aria-hidden="true" />
          Customize colors
        </button>
      </div>

      <div className="flex gap-3">
        {/* Bike preview */}
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground/70">Bike</div>
          {equippedBike ? (
            <div className="h-10 w-full">
              <BikeSvg
                frame={avatar.frame}
                wheel={avatar.wheel}
                accent={avatar.accent}
              />
            </div>
          ) : (
            <div className="h-10 flex items-center text-[10px] text-muted-foreground">Default</div>
          )}
          <div className="text-[10px] font-semibold text-foreground truncate">
            {equippedBike?.name ?? 'Custom'}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-border/50 self-stretch" />

        {/* Kit preview */}
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground/70">Kit</div>
          {equippedKit ? (
            <div className="h-10 w-full px-3">
              <JerseySvg kit={avatar.kit} accent={avatar.accent} />
            </div>
          ) : (
            <div className="h-10 flex items-center text-[10px] text-muted-foreground">Default</div>
          )}
          <div className="text-[10px] font-semibold text-foreground truncate">
            {equippedKit?.name ?? 'Custom'}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-border/50 self-stretch" />

        {/* Helmet preview */}
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground/70">Helmet</div>
          {equippedHelmet ? (
            <div className="h-10 w-full">
              <HelmetVisual item={equippedHelmet} helmetColor={avatar.helmet} size="sm" />
            </div>
          ) : (
            <div className="h-10 flex items-center text-[10px] text-muted-foreground">Default</div>
          )}
          <div className="text-[10px] font-semibold text-foreground truncate">
            {equippedHelmet?.name ?? 'Custom'}
          </div>
        </div>

        {/* Color chip strip */}
        <div className="flex flex-col gap-1 justify-center shrink-0">
          {AVATAR_COLOR_ROLES.map((role) => (
            <div key={role.key} className="flex items-center gap-1">
              <div
                className="h-3 w-3 rounded-sm ring-1 ring-inset ring-black/15 shrink-0"
                style={{ backgroundColor: avatar[role.key] }}
                title={role.label}
              />
              <span className="text-[9px] text-muted-foreground w-10 truncate">{role.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color customization modal
// ---------------------------------------------------------------------------

function ColorModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const avatar     = useSettingsStore((s) => s.avatar);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const [draft, setDraft] = useState<AvatarColors>({ ...avatar });
  const modalRef   = useRef<HTMLDivElement>(null);
  const closeRef   = useRef<HTMLButtonElement>(null);

  // Focus trap on mount
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Click-outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    }
    // slight delay so the triggering click doesn't immediately close
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  function save() {
    setSettings({ avatar: draft });
    onClose();
  }

  function resetToDefault() {
    setDraft({ ...DEFAULT_AVATAR_COLORS });
  }

  function applyPreset(presetId: string) {
    const preset = AVATAR_PRESETS.find((p) => p.id === presetId);
    if (preset) setDraft({ ...preset.colors });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Customize avatar colors"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-sm font-bold text-foreground">Customize Colors</span>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close color customization"
            className="rounded-full p-1.5 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-0 overflow-hidden max-h-[80vh] overflow-y-auto">
          {/* Left: live preview */}
          <div className="w-40 shrink-0 flex flex-col gap-4 p-4 bg-muted/20 border-r border-border/40">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold text-center">
              Preview
            </div>
            <div className="space-y-3">
              <BikeSvg
                frame={draft.frame}
                wheel={draft.wheel}
                accent={draft.accent}
              />
              <div className="px-4">
                <JerseySvg kit={draft.kit} accent={draft.accent} />
              </div>
            </div>
            {/* Preset quick-apply */}
            <div className="space-y-1.5">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Presets</div>
              {AVATAR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  aria-label={`Apply ${preset.name} preset`}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {/* Mini palette swatch */}
                  <div className="flex gap-0.5 shrink-0">
                    {[preset.colors.kit, preset.colors.frame, preset.colors.accent].map((c, i) => (
                      <div
                        key={i}
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-foreground truncate">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: color role rows */}
          <div className="flex-1 p-4 space-y-3">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">
              Color Roles
            </div>
            {AVATAR_COLOR_ROLES.map((role) => (
              <div key={role.key} className="flex items-center gap-3">
                {/* Swatch */}
                <div
                  className="h-6 w-6 rounded-md ring-1 ring-inset ring-black/15 shrink-0"
                  style={{ backgroundColor: draft[role.key] }}
                />
                {/* Label */}
                <label
                  htmlFor={`color-role-${role.key}`}
                  className="w-16 text-xs text-foreground font-medium shrink-0 cursor-pointer"
                >
                  {role.label}
                </label>
                {/* Color picker */}
                <input
                  id={`color-role-${role.key}`}
                  type="color"
                  value={draft[role.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [role.key]: e.target.value }))}
                  className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`${role.label} color`}
                />
                {/* Hex value */}
                <span className="text-[10px] text-muted-foreground font-mono uppercase num flex-1 min-w-0">
                  {draft[role.key].toUpperCase()}
                </span>
                {/* Reset single role */}
                <button
                  onClick={() =>
                    setDraft((d) => ({ ...d, [role.key]: DEFAULT_AVATAR_COLORS[role.key] }))
                  }
                  aria-label={`Reset ${role.label} to default`}
                  className="shrink-0 rounded p-0.5 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  title={`Reset ${role.label}`}
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-border/60 bg-muted/10">
          <button
            onClick={resetToDefault}
            aria-label="Reset all colors to default"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1"
          >
            <RotateCcw className="h-3 w-3" />
            Reset all
          </button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} aria-label="Cancel color changes">
              Cancel
            </Button>
            <Button variant="default" size="sm" onClick={save} aria-label="Save avatar colors">
              Save colors
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Garage component
// ---------------------------------------------------------------------------

export function Garage() {
  const xp          = useProfileStore((s) => s.profile?.xp ?? 0);
  const avatar      = useSettingsStore((s) => s.avatar);
  const helmetId    = useSettingsStore((s) => s.helmetId);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const { level, into, needed, pct } = xpProgressInLevel(xp);

  // Active category tab — helmets tab is always present (HELMETS is non-empty)
  const availableKinds = CATEGORY_CONFIG.filter((c) =>
    c.kind === 'helmet'
      ? HELMETS.length > 0
      : GEAR_CATALOG.some((g) => g.kind === c.kind),
  );
  const [activeKind, setActiveKind] = useState<GearKind>(availableKinds[0]?.kind ?? 'bike');
  const [showColorModal, setShowColorModal] = useState(false);

  /** Items in the active category (bikes/kits), sorted by unlockLevel ascending. */
  const categoryItems = activeKind !== 'helmet'
    ? GEAR_CATALOG.filter((g) => g.kind === activeKind).sort((a, b) => a.unlockLevel - b.unlockLevel)
    : [];

  /** Helmets sorted by unlockLevel ascending. */
  const helmetItems = HELMETS.slice().sort((a, b) => a.unlockLevel - b.unlockLevel);

  /** True if a GearItem's colors exactly match the current avatar. */
  const isEquipped = useCallback(
    (item: GearItem) => AVATAR_COLOR_ROLES.every((r) => item.colors[r.key] === avatar[r.key]),
    [avatar],
  );

  const equippedBike    = GEAR_CATALOG.find((g) => g.kind === 'bike' && isEquipped(g));
  const equippedKit     = GEAR_CATALOG.find((g) => g.kind === 'kit'  && isEquipped(g));
  const equippedHelmet  = HELMETS.find((h) => h.id === helmetId);

  // Empty state: user is still at level 1 with only the starter kit
  const totalUnlocked = GEAR_CATALOG.filter((g) => g.unlockLevel <= level).length;
  const showEarnMore  = totalUnlocked <= 1;

  // Count helpers for the tab badges
  function helmetUnlockedCount() {
    return HELMETS.filter((h) => h.unlockLevel <= level).length;
  }

  return (
    <>
      <Section icon={<Bike className="h-4 w-4" />} title="Gear Garage">
        <div className="space-y-4">

          {/* ── Header strip: level pill + XP progress bar ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-bold text-primary ring-1 ring-inset ring-primary/20">
                  <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                  Level {level}
                </span>
                <span className="text-[11px] text-muted-foreground num">
                  {into.toLocaleString()} / {needed.toLocaleString()} XP to next unlock
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground num">{xp.toLocaleString()} total</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-700 ease-out"
                style={{ width: `${(pct * 100).toFixed(1)}%` }}
              />
            </div>
          </div>

          {/* ── Active gear summary card ── */}
          <ActiveGearSummary
            equippedBike={equippedBike}
            equippedKit={equippedKit}
            equippedHelmet={equippedHelmet}
            onCustomize={() => setShowColorModal(true)}
          />

          {/* ── Category tabs ── */}
          <div
            className="flex gap-1 rounded-xl bg-muted/30 p-1"
            role="tablist"
            aria-label="Gear categories"
          >
            {availableKinds.map((cat) => {
              const unlockedCount = cat.kind === 'helmet'
                ? helmetUnlockedCount()
                : GEAR_CATALOG.filter((g) => g.kind === cat.kind && g.unlockLevel <= level).length;
              const totalCount = cat.kind === 'helmet'
                ? HELMETS.length
                : GEAR_CATALOG.filter((g) => g.kind === cat.kind).length;
              return (
                <button
                  key={cat.kind}
                  role="tab"
                  aria-selected={activeKind === cat.kind}
                  aria-label={`Show ${cat.label}`}
                  onClick={() => setActiveKind(cat.kind)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    activeKind === cat.kind
                      ? 'bg-card text-primary shadow-sm ring-1 ring-inset ring-border/60'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <span aria-hidden="true">{cat.icon}</span>
                  {cat.label}
                  <span className="ml-0.5 rounded-full bg-muted/60 px-1.5 py-0.5 text-[9px] num">
                    {unlockedCount}/{totalCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Earn XP hero (when near-empty loadout) ── */}
          {showEarnMore && (
            <div className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-4 text-center space-y-1.5">
              <Sparkles className="h-6 w-6 text-primary/50 mx-auto" aria-hidden="true" />
              <div className="text-xs font-semibold text-foreground">Unlock your garage</div>
              <div className="text-[11px] text-muted-foreground leading-relaxed max-w-xs mx-auto">
                Complete rides to earn XP and unlock premium bikes, kits, helmets, and more. Each
                kilometer earns 10 XP — finishing a workout adds 250 XP.
              </div>
              <div className="inline-flex items-center gap-1 text-[11px] text-primary font-medium">
                <ChevronRight className="h-3 w-3" />
                {(needed - into).toLocaleString()} XP to Level {level + 1}
              </div>
            </div>
          )}

          {/* ── Gear grid (bikes + kits) ── */}
          {activeKind !== 'helmet' && (
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
              role="list"
              aria-label={`${availableKinds.find((c) => c.kind === activeKind)?.label ?? 'Gear'} collection`}
            >
              {categoryItems.map((item) => (
                <div key={item.id} role="listitem">
                  <GearCard
                    item={item}
                    unlocked={item.unlockLevel <= level}
                    equipped={isEquipped(item)}
                    xp={xp}
                    onEquip={() => setSettings({ avatar: item.colors })}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Helmet grid ── */}
          {activeKind === 'helmet' && (
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
              role="list"
              aria-label="Helmets collection"
            >
              {helmetItems.map((item) => (
                <div key={item.id} role="listitem">
                  <HelmetCard
                    item={item}
                    unlocked={item.unlockLevel <= level}
                    equipped={helmetId === item.id}
                    xp={xp}
                    helmetColor={avatar.helmet}
                    onEquip={() => setSettings({ helmetId: item.id })}
                  />
                </div>
              ))}
            </div>
          )}

        </div>
      </Section>

      {/* ── Color customization modal ── */}
      {showColorModal && (
        <ColorModal onClose={() => setShowColorModal(false)} />
      )}
    </>
  );
}
