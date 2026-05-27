/**
 * Gear Garage — Wave 38.A overhaul.
 *
 * Rebuilt for 125 items across 6 categories. Features:
 *  - Tab navigation across Bikes / Helmets / Kits / Glasses / Shoes / Bottles
 *  - Search bar (case-insensitive substring)
 *  - Sub-category filter chips per tab
 *  - Sort: Default (unlock level), Name (A-Z), Locked-last
 *  - Item card grid with SVG visual, name, unlock level, equipped / locked state
 *  - Item detail modal (full description, colorway swatch, Equip button)
 *  - Currently-equipped strip at top across all 6 categories
 *  - ColorModal (avatar color customization) — preserved from prior version
 *
 * Self-contained: reads XP from profileStore and equipped IDs from settingsStore.
 * ProfilePanel just mounts <Garage /> with no props.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Bike,
  Shirt,
  HardHat,
  Glasses,
  Footprints,
  FlaskConical,
  CheckCircle2,
  Lock,
  Palette,
  X,
  RotateCcw,
  ChevronRight,
  Sparkles,
  Search,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Section } from '@/components/ui/section-header';
import { useProfileStore } from '@/stores/profileStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { xpProgressInLevel, xpForLevel } from '@/lib/progression';
import {
  GEAR_CATALOG,
  HELMETS,
  type GearItem,
  type GearKind,
  type HelmetItem,
} from '@/lib/gear';
import { subCategoriesFor } from '@/lib/gear/gearByCategory';
import {
  AVATAR_COLOR_ROLES,
  AVATAR_PRESETS,
  DEFAULT_AVATAR_COLORS,
  type AvatarColors,
} from '@/lib/avatarConfig';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface CategoryConfig {
  kind: GearKind;
  label: string;
  icon: React.ReactNode;
}

const CATEGORY_CONFIG: CategoryConfig[] = [
  { kind: 'bike',    label: 'Bikes',   icon: <Bike         className="h-3.5 w-3.5" /> },
  { kind: 'helmet',  label: 'Helmets', icon: <HardHat      className="h-3.5 w-3.5" /> },
  { kind: 'kit',     label: 'Kits',    icon: <Shirt        className="h-3.5 w-3.5" /> },
  { kind: 'glasses', label: 'Glasses', icon: <Glasses      className="h-3.5 w-3.5" /> },
  { kind: 'shoes',   label: 'Shoes',   icon: <Footprints   className="h-3.5 w-3.5" /> },
  { kind: 'bottle',  label: 'Bottles', icon: <FlaskConical className="h-3.5 w-3.5" /> },
];

type SortMode = 'default' | 'name' | 'locked-last';

// ---------------------------------------------------------------------------
// SVG gear visuals
// ---------------------------------------------------------------------------

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
      <circle cx="24" cy="44" r="16" stroke={wheel} strokeWidth="3.5" fill="none" />
      <circle cx="24" cy="44" r="4"  fill={wheel} />
      <circle cx="96" cy="44" r="16" stroke={wheel} strokeWidth="3.5" fill="none" />
      <circle cx="96" cy="44" r="4"  fill={wheel} />
      <line x1="24" y1="28" x2="24" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="10" y1="37" x2="24" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="14" y1="52" x2="24" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="34" y1="55" x2="24" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="38" y1="37" x2="24" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="96" y1="28" x2="96" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="82" y1="37" x2="96" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="86" y1="55" x2="96" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="106" y1="55" x2="96" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="110" y1="37" x2="96" y2="44" stroke={wheel} strokeWidth="1" opacity="0.6" />
      <line x1="24" y1="44" x2="58" y2="44" stroke={frame} strokeWidth="2.5" />
      <line x1="58" y1="44" x2="72" y2="16" stroke={frame} strokeWidth="3" strokeLinecap="round" />
      <line x1="58" y1="44" x2="62" y2="16" stroke={frame} strokeWidth="3" strokeLinecap="round" />
      <line x1="62" y1="16" x2="84" y2="18" stroke={frame} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="84" y1="18" x2="96" y2="44" stroke={frame} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="72" y1="16" x2="84" y2="18" stroke={frame} strokeWidth="3.5" strokeLinecap="round" />
      <line x1="62" y1="16" x2="60" y2="9" stroke={frame} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M54 9 Q60 6 66 9" stroke={accent} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <line x1="84" y1="18" x2="87" y2="13" stroke={frame} strokeWidth="2" strokeLinecap="round" />
      <path d="M83 11 Q87 10 91 13" stroke={accent} strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="58" cy="44" r="4" fill={accent} />
      <line x1="58" y1="44" x2="65" y2="50" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      <circle cx="65" cy="50" r="2" fill={frame} />
    </svg>
  );
}

function JerseySvg({ kit, accent, className }: { kit: string; accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 72" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn('w-full', className)} aria-hidden="true">
      <path d="M28 18 L14 30 L20 36 L26 30 L26 62 L74 62 L74 30 L80 36 L86 30 L72 18 C68 10 60 8 50 8 C40 8 32 10 28 18Z" fill={kit} opacity="0.9" />
      <path d="M38 8 Q50 4 62 8 Q58 16 50 17 Q42 16 38 8Z" fill={accent} opacity="0.85" />
      <path d="M28 18 L14 30 L20 36 L26 30 L30 20Z" fill={accent} opacity="0.75" />
      <path d="M72 18 L86 30 L80 36 L74 30 L70 20Z" fill={accent} opacity="0.75" />
      <rect x="46" y="17" width="8" height="45" fill={accent} opacity="0.25" rx="2" />
      <line x1="50" y1="17" x2="50" y2="62" stroke={accent} strokeWidth="1" opacity="0.5" strokeDasharray="3,3" />
      <rect x="26" y="46" width="48" height="6" fill={accent} opacity="0.2" />
    </svg>
  );
}

function GlassesSvg({ frame, accent, className }: { frame: string; accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 40" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn('w-full', className)} aria-hidden="true">
      {/* Left lens */}
      <rect x="8" y="10" width="34" height="20" rx="6" fill={frame} opacity="0.85" />
      <rect x="11" y="13" width="28" height="14" rx="4" fill={accent} opacity="0.35" />
      {/* Right lens */}
      <rect x="58" y="10" width="34" height="20" rx="6" fill={frame} opacity="0.85" />
      <rect x="61" y="13" width="28" height="14" rx="4" fill={accent} opacity="0.35" />
      {/* Bridge */}
      <path d="M42 20 Q50 15 58 20" stroke={frame} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* Temples */}
      <line x1="8" y1="20" x2="2" y2="22" stroke={frame} strokeWidth="2" strokeLinecap="round" />
      <line x1="92" y1="20" x2="98" y2="22" stroke={frame} strokeWidth="2" strokeLinecap="round" />
      {/* Gloss */}
      <path d="M14 15 Q22 12 28 15" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.3" />
      <path d="M64 15 Q72 12 78 15" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.3" />
    </svg>
  );
}

function ShoesSvg({ frame, accent, className }: { frame: string; accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 60" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn('w-full', className)} aria-hidden="true">
      {/* Sole */}
      <path d="M10 44 Q10 50 20 52 L80 52 Q92 52 92 46 L92 42 Q85 40 70 40 L30 40 Q20 38 10 44Z" fill={accent} opacity="0.9" />
      {/* Upper */}
      <path d="M20 40 L22 22 Q30 14 46 14 L60 16 Q72 18 80 26 L80 40Z" fill={frame} opacity="0.88" />
      {/* Toe box */}
      <path d="M10 44 L20 40 L22 22 Q16 28 12 38 Q10 40 10 44Z" fill={frame} opacity="0.75" />
      {/* Boa / strap lines */}
      <line x1="28" y1="28" x2="76" y2="30" stroke={accent} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <line x1="26" y1="35" x2="78" y2="36" stroke={accent} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      {/* Cleat hint */}
      <rect x="34" y="47" width="22" height="5" rx="2" fill={accent} opacity="0.55" />
    </svg>
  );
}

function BottleSvg({ frame, accent, className }: { frame: string; accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 60 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={cn('w-full max-h-full', className)} aria-hidden="true">
      {/* Cap */}
      <rect x="22" y="6" width="16" height="12" rx="4" fill={accent} opacity="0.9" />
      {/* Neck */}
      <rect x="24" y="16" width="12" height="8" rx="2" fill={frame} opacity="0.8" />
      {/* Body */}
      <path d="M16 24 Q14 30 14 50 L14 80 Q14 88 30 88 Q46 88 46 80 L46 50 Q46 30 44 24Z" fill={frame} opacity="0.88" />
      {/* Label band */}
      <rect x="16" y="44" width="28" height="18" fill={accent} opacity="0.3" />
      {/* Highlight */}
      <path d="M18 30 Q20 26 24 26" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helmet SVG illustrations
// ---------------------------------------------------------------------------

function HelmetStarterSvg({ shell, accent }: { shell: string; accent: string }) {
  return (
    <svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-full">
      <path d="M10 38 Q10 10 40 10 Q70 10 70 38 L66 42 Q40 48 14 42Z" fill={shell} opacity="0.92" />
      <rect x="24" y="16" width="6" height="12" rx="3" fill={accent} opacity="0.70" />
      <rect x="34" y="13" width="6" height="14" rx="3" fill={accent} opacity="0.70" />
      <rect x="44" y="16" width="6" height="12" rx="3" fill={accent} opacity="0.70" />
      <path d="M14 42 Q40 50 66 42" stroke={accent} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.8" />
      <path d="M14 42 Q10 46 12 50 Q40 56 68 50 Q70 46 66 42" fill={shell} opacity="0.65" />
    </svg>
  );
}

function HelmetAeroSvg({ shell, accent }: { shell: string; accent: string }) {
  return (
    <svg viewBox="0 0 90 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-full">
      <path d="M8 36 Q8 12 38 10 Q58 10 72 18 Q84 26 82 40 L76 44 Q50 52 18 44Z" fill={shell} opacity="0.93" />
      <path d="M72 18 Q86 24 84 38 L76 44 Q80 32 72 18Z" fill={shell} opacity="0.75" />
      <path d="M36 10 Q44 10 72 18" stroke={accent} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6" />
      <path d="M20 20 Q34 14 50 16" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.25" />
      <path d="M18 44 Q50 54 76 44" stroke={accent} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.85" />
      <path d="M8 36 Q6 42 10 46 Q14 50 18 44" fill={accent} opacity="0.55" />
    </svg>
  );
}

function HelmetRoadSvg({ shell, accent }: { shell: string; accent: string }) {
  return (
    <svg viewBox="0 0 80 60" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-full">
      <path d="M12 38 Q12 8 40 8 Q68 8 68 38 L64 43 Q40 50 16 43Z" fill={shell} opacity="0.90" />
      <rect x="19" y="14" width="7" height="16" rx="3.5" fill={accent} opacity="0.65" />
      <rect x="30" y="11" width="7" height="18" rx="3.5" fill={accent} opacity="0.65" />
      <rect x="41" y="11" width="7" height="18" rx="3.5" fill={accent} opacity="0.65" />
      <rect x="52" y="14" width="7" height="16" rx="3.5" fill={accent} opacity="0.65" />
      <path d="M16 43 Q40 52 64 43" stroke={accent} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9" />
      <path d="M12 38 Q8 43 10 47 Q14 50 20 46 L16 43Z" fill={shell} opacity="0.70" />
      <path d="M22 16 Q34 10 50 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.20" />
    </svg>
  );
}

function HelmetProSvg({ shell, accent }: { shell: string; accent: string }) {
  return (
    <svg viewBox="0 0 90 58" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="w-full">
      <path d="M6 34 Q6 10 36 8 Q62 8 78 22 Q88 32 86 44 L78 48 Q50 56 16 46Z" fill={shell} opacity="0.95" />
      <path d="M78 22 Q92 30 88 44 L78 48 Q84 38 78 22Z" fill={shell} opacity="0.70" />
      <path d="M16 46 Q50 56 78 48" stroke={accent} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.90" />
      <path d="M34 8 Q62 8 78 22" stroke={accent} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.55" />
      <path d="M10 30 Q30 18 60 16 Q74 16 82 26" stroke={accent} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.40" />
      <path d="M18 18 Q36 10 56 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.22" />
      <path d="M6 34 Q4 40 8 44 Q12 48 16 46 L10 38Z" fill={accent} opacity="0.50" />
    </svg>
  );
}

/** Dispatch the right helmet SVG by id. Falls back to starter shape. */
function HelmetSvg({
  item,
  helmetColor,
  className,
}: {
  item: HelmetItem;
  helmetColor: string;
  className?: string;
}) {
  const props = { shell: helmetColor, accent: item.accentColor };
  return (
    <div className={cn('w-full flex items-center justify-center px-2', className)}>
      {item.id.includes('aero') || item.id.includes('tt')
        ? <HelmetAeroSvg {...props} />
        : item.id.includes('road') && !item.id.includes('pro')
        ? <HelmetRoadSvg {...props} />
        : item.id.includes('pro')
        ? <HelmetProSvg {...props} />
        : <HelmetStarterSvg {...props} />}
    </div>
  );
}

/** Generic visual dispatcher for all 6 gear kinds. */
function GearVisual({ item, size = 'md' }: { item: GearItem; size?: 'sm' | 'md' | 'lg' }) {
  const h = size === 'sm' ? 'h-10' : size === 'lg' ? 'h-20' : 'h-14';
  const c = item.colors;

  if (item.kind === 'bike') {
    return (
      <div className={cn(h, 'w-full flex items-center justify-center px-1')}>
        <BikeSvg frame={c.frame} wheel={c.wheel} accent={c.accent} className="max-h-full" />
      </div>
    );
  }
  if (item.kind === 'kit') {
    return (
      <div className={cn(h, 'w-full flex items-center justify-center px-4')}>
        <JerseySvg kit={c.kit} accent={c.accent} className="max-h-full" />
      </div>
    );
  }
  if (item.kind === 'glasses') {
    return (
      <div className={cn(h, 'w-full flex items-center justify-center px-2')}>
        <GlassesSvg frame={c.frame} accent={c.accent} className="max-h-full" />
      </div>
    );
  }
  if (item.kind === 'shoes') {
    return (
      <div className={cn(h, 'w-full flex items-center justify-center px-1')}>
        <ShoesSvg frame={c.frame} accent={c.accent} className="max-h-full" />
      </div>
    );
  }
  if (item.kind === 'bottle') {
    return (
      <div className={cn(h, 'w-full flex items-center justify-center py-1')}>
        <BottleSvg frame={c.frame} accent={c.accent} className="max-h-full" />
      </div>
    );
  }
  // helmet fallback (shouldn't normally be hit — helmets use HelmetSvg directly)
  return (
    <div className={cn(h, 'w-full flex items-center justify-center px-2')}>
      <HelmetStarterSvg shell={c.helmet} accent={c.accent} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// XP unlock tooltip
// ---------------------------------------------------------------------------

function LockedTooltip({ item, xp, onClose }: { item: GearItem; xp: number; onClose: () => void }) {
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
      <div className="absolute top-full left-1/2 -translate-x-1/2 w-2.5 h-1.5 overflow-hidden">
        <div className="w-2 h-2 bg-card/95 border-r border-b border-border rotate-45 mx-auto -mt-1" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item detail modal
// ---------------------------------------------------------------------------

function GearDetailModal({
  item,
  unlocked,
  equipped,
  xp,
  helmetColor,
  onEquip,
  onClose,
}: {
  item: GearItem | null;
  unlocked: boolean;
  equipped: boolean;
  xp: number;
  helmetColor: string;
  onEquip: () => void;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const equipBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!item) return;
    equipBtnRef.current?.focus();
  }, [item]);

  useEffect(() => {
    if (!item) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  useEffect(() => {
    if (!item) return;
    const id = setTimeout(() => {
      function handler(e: MouseEvent) {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
      }
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, 100);
    return () => clearTimeout(id);
  }, [item, onClose]);

  if (!item) return null;

  const colors = [item.colors.frame, item.colors.wheel, item.colors.kit, item.colors.accent, item.colors.helmet];

  // Fake HelmetItem shape for the HelmetSvg dispatch
  const asHelmetItem: HelmetItem = {
    id: item.id,
    name: item.name,
    defaultColor: item.colors.helmet,
    accentColor: item.colors.accent,
    unlockLevel: item.unlockLevel,
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.name} details`}
    >
      <div
        ref={modalRef}
        className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <span className="text-sm font-bold text-foreground truncate">{item.name}</span>
          <button
            onClick={onClose}
            aria-label="Close gear details"
            className="rounded-full p-1.5 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ml-2 shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Visual */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 flex items-center justify-center h-36">
            {item.kind === 'helmet'
              ? <HelmetSvg item={asHelmetItem} helmetColor={helmetColor} className="h-full" />
              : <GearVisual item={item} size="lg" />}
          </div>

          {/* Meta */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                {item.kind} {item.subCategory ? `· ${item.subCategory}` : ''}
              </span>
              {equipped && (
                <Badge variant="success" className="gap-1 text-[10px] px-1.5 py-0.5">
                  <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                  Equipped
                </Badge>
              )}
            </div>
            {item.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            )}
          </div>

          {/* Colorway swatch */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Colorway</div>
            <div className="flex gap-1.5">
              {colors.map((c, i) => (
                <div
                  key={i}
                  className="h-6 w-6 rounded-md ring-1 ring-inset ring-black/15"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Unlock level */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {unlocked ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Unlocked — Level {item.unlockLevel}</span>
            ) : (
              <>
                <Lock className="h-3 w-3 text-amber-400 shrink-0" aria-hidden="true" />
                <span>Requires Level <span className="font-bold text-foreground">{item.unlockLevel}</span></span>
              </>
            )}
          </div>

          {/* XP bar for locked */}
          {!unlocked && (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-300 transition-all duration-500"
                  style={{ width: `${(Math.min(1, xp / xpForLevel(item.unlockLevel)) * 100).toFixed(1)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground num">
                <span>{xp.toLocaleString()} XP</span>
                <span>{xpForLevel(item.unlockLevel).toLocaleString()} XP needed</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border/60 bg-muted/10">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {unlocked && !equipped && (
            <Button ref={equipBtnRef} variant="default" size="sm" onClick={() => { onEquip(); onClose(); }}>
              Equip
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item card (GearItem — bikes, kits, glasses, shoes, bottles, helmets via GearItem)
// ---------------------------------------------------------------------------

const GearCard = ({
  item,
  unlocked,
  equipped,
  xp,
  helmetColor,
  onEquip: _onEquip,
  onOpenDetail,
}: {
  item: GearItem;
  unlocked: boolean;
  equipped: boolean;
  xp: number;
  helmetColor: string;
  onEquip: () => void;
  onOpenDetail: () => void;
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // Fake HelmetItem for HelmetSvg dispatch when kind === 'helmet'
  const asHelmetItem: HelmetItem = {
    id: item.id,
    name: item.name,
    defaultColor: item.colors.helmet,
    accentColor: item.colors.accent,
    unlockLevel: item.unlockLevel,
  };

  function handleActivate() {
    if (!unlocked) { setShowTooltip((v) => !v); return; }
    onOpenDetail();
  }

  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 rounded-xl border p-3 transition-all duration-200 select-none',
        unlocked
          ? equipped
            ? 'border-primary/50 bg-primary/6 ring-1 ring-primary/25 shadow-[0_0_18px_-4px_hsl(var(--primary)/0.30)] cursor-pointer'
            : 'border-border bg-card/40 hover:border-border/70 hover:bg-card/60 hover:-translate-y-0.5 hover:shadow-md cursor-pointer'
          : 'border-border/30 bg-card/15 opacity-60 cursor-pointer',
      )}
      onClick={handleActivate}
      role="button"
      aria-label={
        unlocked
          ? equipped
            ? `${item.name} — currently equipped`
            : `View ${item.name}`
          : `${item.name} — locked until level ${item.unlockLevel}`
      }
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate(); }
        if (e.key === 'Escape') setShowTooltip(false);
      }}
    >
      {/* Equipped glow accent bar */}
      {equipped && (
        <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl bg-gradient-to-r from-primary/60 via-primary to-accent/60" />
      )}

      {/* Gear visual */}
      {item.kind === 'helmet'
        ? <HelmetSvg item={asHelmetItem} helmetColor={helmetColor} className="h-14" />
        : <GearVisual item={item} size="md" />}

      {/* Name + color dots */}
      <div className="flex items-start justify-between gap-1 min-w-0">
        <div className="min-w-0">
          <div className="text-xs font-bold text-foreground truncate leading-tight">{item.name}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5">
            {item.subCategory ?? item.kind}
          </div>
        </div>
        <div className="flex gap-0.5 shrink-0 mt-0.5">
          {[item.colors.frame, item.colors.accent].map((c, i) => (
            <div key={i} className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: c }} />
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
            <span className="text-[11px] font-medium text-primary/80">Tap to view</span>
          )
        ) : (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Lock className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
            <span className="font-medium">Level {item.unlockLevel}</span>
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
};

// ---------------------------------------------------------------------------
// Currently-equipped strip
// ---------------------------------------------------------------------------

function EquippedStrip({
  equippedItems,
  helmetColor,
  onCustomize,
}: {
  equippedItems: Record<GearKind, GearItem | undefined>;
  helmetColor: string;
  onCustomize: () => void;
}) {
  const STRIP_ORDER: GearKind[] = ['bike', 'helmet', 'kit', 'glasses', 'shoes', 'bottle'];
  const avatar = useSettingsStore((s) => s.avatar);

  return (
    <div className="rounded-xl border border-border bg-card/50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          Current Loadout
        </span>
        <button
          onClick={onCustomize}
          aria-label="Customize avatar colors"
          className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary px-1"
        >
          <Palette className="h-3 w-3" aria-hidden="true" />
          Colors
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STRIP_ORDER.map((kind) => {
          const item = equippedItems[kind];
          const catLabel = CATEGORY_CONFIG.find((c) => c.kind === kind)?.label ?? kind;
          const asHelmetItem: HelmetItem | undefined = item
            ? { id: item.id, name: item.name, defaultColor: item.colors.helmet, accentColor: item.colors.accent, unlockLevel: item.unlockLevel }
            : undefined;
          return (
            <div key={kind} className="flex flex-col items-center gap-1 shrink-0 w-14">
              <div className="text-[8px] uppercase tracking-widest text-muted-foreground/70">{catLabel}</div>
              <div className="h-10 w-14 flex items-center justify-center rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
                {item ? (
                  kind === 'helmet'
                    ? <HelmetSvg item={asHelmetItem!} helmetColor={helmetColor} className="h-9 w-full px-1" />
                    : kind === 'bike'
                    ? <BikeSvg frame={avatar.frame} wheel={avatar.wheel} accent={avatar.accent} className="w-full px-0.5" />
                    : kind === 'kit'
                    ? <JerseySvg kit={avatar.kit} accent={avatar.accent} className="w-full px-1" />
                    : kind === 'glasses'
                    ? <GlassesSvg frame={item.colors.frame} accent={item.colors.accent} className="w-full px-1" />
                    : kind === 'shoes'
                    ? <ShoesSvg frame={item.colors.frame} accent={item.colors.accent} className="w-full px-0.5" />
                    : <BottleSvg frame={item.colors.frame} accent={item.colors.accent} className="w-full py-0.5" />
                ) : (
                  <span className="text-[9px] text-muted-foreground/50">None</span>
                )}
              </div>
              <div className="text-[8px] font-semibold text-foreground truncate w-full text-center">
                {item?.name ?? '—'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color customization modal (preserved from prior version)
// ---------------------------------------------------------------------------

function ColorModal({ onClose }: { onClose: () => void }) {
  const avatar      = useSettingsStore((s) => s.avatar);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const [draft, setDraft] = useState<AvatarColors>({ ...avatar });
  const modalRef  = useRef<HTMLDivElement>(null);
  const closeRef  = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const id = setTimeout(() => {
      function handler(e: MouseEvent) {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
      }
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, 100);
    return () => clearTimeout(id);
  }, [onClose]);

  function save() { setSettings({ avatar: draft }); onClose(); }
  function resetToDefault() { setDraft({ ...DEFAULT_AVATAR_COLORS }); }
  function applyPreset(id: string) {
    const p = AVATAR_PRESETS.find((p) => p.id === id);
    if (p) setDraft({ ...p.colors });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Customize avatar colors">
      <div ref={modalRef} className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-sm font-bold text-foreground">Customize Colors</span>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close color customization" className="rounded-full p-1.5 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-0 overflow-hidden max-h-[80vh] overflow-y-auto">
          <div className="w-40 shrink-0 flex flex-col gap-4 p-4 bg-muted/20 border-r border-border/40">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold text-center">Preview</div>
            <div className="space-y-3">
              <BikeSvg frame={draft.frame} wheel={draft.wheel} accent={draft.accent} />
              <div className="px-4"><JerseySvg kit={draft.kit} accent={draft.accent} /></div>
            </div>
            <div className="space-y-1.5">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Presets</div>
              {AVATAR_PRESETS.map((preset) => (
                <button key={preset.id} onClick={() => applyPreset(preset.id)} aria-label={`Apply ${preset.name} preset`} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <div className="flex gap-0.5 shrink-0">
                    {[preset.colors.kit, preset.colors.frame, preset.colors.accent].map((c, i) => (
                      <div key={i} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  <span className="text-[10px] text-foreground truncate">{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 p-4 space-y-3">
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">Color Roles</div>
            {AVATAR_COLOR_ROLES.map((role) => (
              <div key={role.key} className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-md ring-1 ring-inset ring-black/15 shrink-0" style={{ backgroundColor: draft[role.key] }} />
                <label htmlFor={`color-role-${role.key}`} className="w-16 text-xs text-foreground font-medium shrink-0 cursor-pointer">{role.label}</label>
                <input
                  id={`color-role-${role.key}`}
                  type="color"
                  value={draft[role.key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [role.key]: e.target.value }))}
                  className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`${role.label} color`}
                />
                <span className="text-[10px] text-muted-foreground font-mono uppercase num flex-1 min-w-0">{draft[role.key].toUpperCase()}</span>
                <button onClick={() => setDraft((d) => ({ ...d, [role.key]: DEFAULT_AVATAR_COLORS[role.key] }))} aria-label={`Reset ${role.label} to default`} className="shrink-0 rounded p-0.5 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" title={`Reset ${role.label}`}>
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-border/60 bg-muted/10">
          <button onClick={resetToDefault} aria-label="Reset all colors to default" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-1">
            <RotateCcw className="h-3 w-3" />
            Reset all
          </button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} aria-label="Cancel color changes">Cancel</Button>
            <Button variant="default" size="sm" onClick={save} aria-label="Save avatar colors">Save colors</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter / sort pure functions (also exported for tests)
// ---------------------------------------------------------------------------

export type GarageSort = SortMode;

export function filterItems(
  items: GearItem[],
  query: string,
  subCategory: string,
  sort: SortMode,
  userLevel: number,
): GearItem[] {
  let result = items;

  // Sub-category filter
  if (subCategory !== 'all') {
    result = result.filter((g) => g.subCategory === subCategory);
  }

  // Search
  const q = query.trim().toLowerCase();
  if (q) {
    result = result.filter((g) => g.name.toLowerCase().includes(q));
  }

  // Sort
  if (sort === 'name') {
    result = [...result].sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === 'locked-last') {
    result = [...result].sort((a, b) => {
      const aLocked = a.unlockLevel > userLevel ? 1 : 0;
      const bLocked = b.unlockLevel > userLevel ? 1 : 0;
      if (aLocked !== bLocked) return aLocked - bLocked;
      return a.unlockLevel - b.unlockLevel;
    });
  } else {
    // default: unlock level ascending
    result = [...result].sort((a, b) => a.unlockLevel - b.unlockLevel);
  }

  return result;
}

/** Convert a HELMETS HelmetItem to a synthetic GearItem for unified display. */
export function helmetToGearItem(h: HelmetItem): GearItem {
  return {
    id: h.id,
    name: h.name,
    kind: 'helmet',
    unlockLevel: h.unlockLevel,
    colors: {
      frame: h.defaultColor,
      wheel: h.defaultColor,
      kit: h.defaultColor,
      skin: '#d8a877',
      helmet: h.defaultColor,
      accent: h.accentColor,
    },
    subCategory: undefined,
    description: undefined,
  };
}

// ---------------------------------------------------------------------------
// Main Garage component
// ---------------------------------------------------------------------------

export function Garage() {
  const xp          = useProfileStore((s) => s.profile?.xp ?? 0);
  const avatar      = useSettingsStore((s) => s.avatar);
  const helmetId    = useSettingsStore((s) => s.helmetId);
  const bikeId      = useSettingsStore((s) => s.bikeId);
  const kitId       = useSettingsStore((s) => s.kitId);
  const glassesId   = useSettingsStore((s) => s.glassesId);
  const shoesId     = useSettingsStore((s) => s.shoesId);
  const bottleId    = useSettingsStore((s) => s.bottleId);
  const setBikeId   = useSettingsStore((s) => s.setBikeId);
  const setKitId    = useSettingsStore((s) => s.setKitId);
  const setHelmetId = useSettingsStore((s) => s.setHelmetId);
  const setGlassesId = useSettingsStore((s) => s.setGlassesId);
  const setShoesId  = useSettingsStore((s) => s.setShoesId);
  const setBottleId = useSettingsStore((s) => s.setBottleId);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const { level, into, needed, pct } = xpProgressInLevel(xp);

  // Tab state
  const [activeKind, setActiveKind] = useState<GearKind>('bike');
  // Per-tab filter state (persisted across tab switches via maps)
  const [queryMap, setQueryMap]       = useState<Partial<Record<GearKind, string>>>({});
  const [subCatMap, setSubCatMap]     = useState<Partial<Record<GearKind, string>>>({});
  const [sortMap, setSortMap]         = useState<Partial<Record<GearKind, SortMode>>>({});

  const [showColorModal, setShowColorModal] = useState(false);
  const [detailItem, setDetailItem]         = useState<GearItem | null>(null);

  // Convenience accessors for active tab filters
  const query    = queryMap[activeKind]  ?? '';
  const subCat   = subCatMap[activeKind] ?? 'all';
  const sortMode = sortMap[activeKind]   ?? 'default';

  function setQuery(v: string)    { setQueryMap((m) => ({ ...m, [activeKind]: v })); }
  function setSubCat(v: string)   { setSubCatMap((m) => ({ ...m, [activeKind]: v })); }
  function setSortMode(v: SortMode) { setSortMap((m) => ({ ...m, [activeKind]: v })); }

  // Build full GearItem list for the active tab (helmets normalised to GearItem)
  const rawItems: GearItem[] = useMemo(() => {
    if (activeKind === 'helmet') {
      return HELMETS.map(helmetToGearItem);
    }
    return GEAR_CATALOG.filter((g) => g.kind === activeKind);
  }, [activeKind]);

  // Sub-category chips for active tab
  const subCategories: string[] = useMemo(() => {
    if (activeKind === 'helmet') {
      // derive from the converted items (HELMETS may have subCategory via GEAR_CATALOG)
      const fromCatalog = GEAR_CATALOG
        .filter((g) => g.kind === 'helmet' && g.subCategory)
        .map((g) => g.subCategory as string);
      return [...new Set(fromCatalog)].sort();
    }
    return subCategoriesFor(activeKind);
  }, [activeKind]);

  // Filtered + sorted items
  const displayItems: GearItem[] = useMemo(
    () => filterItems(rawItems, query, subCat, sortMode, level),
    [rawItems, query, subCat, sortMode, level],
  );

  // Equipped item lookup per kind
  const equippedItems: Record<GearKind, GearItem | undefined> = useMemo(() => {
    const find = (kind: GearKind, id: string) =>
      id ? GEAR_CATALOG.find((g) => g.kind === kind && g.id === id) : undefined;
    return {
      bike:    find('bike',    bikeId),
      helmet:  HELMETS.find((h) => h.id === helmetId) ? helmetToGearItem(HELMETS.find((h) => h.id === helmetId)!) : undefined,
      kit:     find('kit',     kitId),
      glasses: find('glasses', glassesId),
      shoes:   find('shoes',   shoesId),
      bottle:  find('bottle',  bottleId),
    };
  }, [bikeId, helmetId, kitId, glassesId, shoesId, bottleId]);

  // Check whether a GearItem is currently equipped
  const isEquipped = useCallback((item: GearItem): boolean => {
    switch (item.kind) {
      case 'bike':    return item.id === bikeId;
      case 'helmet':  return item.id === helmetId;
      case 'kit':     return item.id === kitId;
      case 'glasses': return item.id === glassesId;
      case 'shoes':   return item.id === shoesId;
      case 'bottle':  return item.id === bottleId;
      default:        return false;
    }
  }, [bikeId, helmetId, kitId, glassesId, shoesId, bottleId]);

  // Equip an item by kind
  const equipItem = useCallback((item: GearItem) => {
    switch (item.kind) {
      case 'bike':    setBikeId(item.id);    setSettings({ avatar: item.colors }); break;
      case 'helmet':  setHelmetId(item.id);  break;
      case 'kit':     setKitId(item.id);     setSettings({ avatar: { ...avatar, kit: item.colors.kit, accent: item.colors.accent } }); break;
      case 'glasses': setGlassesId(item.id); break;
      case 'shoes':   setShoesId(item.id);   break;
      case 'bottle':  setBottleId(item.id);  break;
    }
  }, [avatar, setBikeId, setHelmetId, setKitId, setGlassesId, setShoesId, setBottleId, setSettings]);

  // Count unlocked in each category (for tab badges)
  const unlockedCounts = useMemo(() => {
    const counts: Partial<Record<GearKind, number>> = {};
    for (const cat of CATEGORY_CONFIG) {
      counts[cat.kind] = cat.kind === 'helmet'
        ? HELMETS.filter((h) => h.unlockLevel <= level).length
        : GEAR_CATALOG.filter((g) => g.kind === cat.kind && g.unlockLevel <= level).length;
    }
    return counts;
  }, [level]);

  const totalCounts: Partial<Record<GearKind, number>> = useMemo(() => {
    const counts: Partial<Record<GearKind, number>> = {};
    for (const cat of CATEGORY_CONFIG) {
      counts[cat.kind] = cat.kind === 'helmet'
        ? HELMETS.length
        : GEAR_CATALOG.filter((g) => g.kind === cat.kind).length;
    }
    return counts;
  }, []);

  const showEarnMore = GEAR_CATALOG.filter((g) => g.unlockLevel <= level).length <= 1;

  // Detail modal item metadata
  const detailUnlocked = detailItem ? detailItem.unlockLevel <= level : false;
  const detailEquipped = detailItem ? isEquipped(detailItem) : false;

  return (
    <>
      <Section icon={<Bike className="h-4 w-4" />} title="Gear Garage">
        <div className="space-y-4">

          {/* ── Level + XP progress ── */}
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

          {/* ── Currently-equipped strip ── */}
          <EquippedStrip
            equippedItems={equippedItems}
            helmetColor={avatar.helmet}
            onCustomize={() => setShowColorModal(true)}
          />

          {/* ── Earn XP hero (when near-empty loadout) ── */}
          {showEarnMore && (
            <div className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-4 text-center space-y-1.5">
              <Sparkles className="h-6 w-6 text-primary/50 mx-auto" aria-hidden="true" />
              <div className="text-xs font-semibold text-foreground">Unlock your garage</div>
              <div className="text-[11px] text-muted-foreground leading-relaxed max-w-xs mx-auto">
                Complete rides to earn XP and unlock premium bikes, kits, helmets, and more.
                Each kilometer earns 10 XP — finishing a workout adds 250 XP.
              </div>
              <div className="inline-flex items-center gap-1 text-[11px] text-primary font-medium">
                <ChevronRight className="h-3 w-3" />
                {(needed - into).toLocaleString()} XP to Level {level + 1}
              </div>
            </div>
          )}

          {/* ── Category tabs ── */}
          <div
            className="flex gap-1 rounded-xl bg-muted/30 p-1 overflow-x-auto"
            role="tablist"
            aria-label="Gear categories"
          >
            {CATEGORY_CONFIG.map((cat) => (
              <button
                key={cat.kind}
                role="tab"
                aria-selected={activeKind === cat.kind}
                aria-label={`Show ${cat.label}`}
                onClick={() => setActiveKind(cat.kind)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shrink-0',
                  activeKind === cat.kind
                    ? 'bg-card text-primary shadow-sm ring-1 ring-inset ring-border/60'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                <span aria-hidden="true">{cat.icon}</span>
                <span className="hidden sm:inline">{cat.label}</span>
                <span className="rounded-full bg-muted/60 px-1 py-0.5 text-[9px] num ml-0.5">
                  {unlockedCounts[cat.kind]}/{totalCounts[cat.kind]}
                </span>
              </button>
            ))}
          </div>

          {/* ── Search + sub-category chips + sort ── */}
          <div className="space-y-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${CATEGORY_CONFIG.find((c) => c.kind === activeKind)?.label ?? 'items'}…`}
                aria-label="Search gear by name"
                className="w-full rounded-lg border border-border bg-muted/30 pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            {/* Sub-category chips + sort (on same row when chips are few) */}
            <div className="flex items-center gap-2">
              {/* Sub-category chips */}
              {subCategories.length > 0 && (
                <div className="flex gap-1 flex-wrap flex-1 min-w-0">
                  <button
                    onClick={() => setSubCat('all')}
                    aria-pressed={subCat === 'all'}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      subCat === 'all'
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border text-muted-foreground hover:text-foreground hover:border-primary/40',
                    )}
                  >
                    All
                  </button>
                  {subCategories.map((sc) => (
                    <button
                      key={sc}
                      onClick={() => setSubCat(sc)}
                      aria-pressed={subCat === sc}
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        subCat === sc
                          ? 'bg-primary text-primary-foreground'
                          : 'border border-border text-muted-foreground hover:text-foreground hover:border-primary/40',
                      )}
                    >
                      {sc.replace(/-/g, ' ')}
                    </button>
                  ))}
                </div>
              )}

              {/* Sort selector */}
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                aria-label="Sort gear"
                className="shrink-0 rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
              >
                <option value="default">Level</option>
                <option value="name">Name</option>
                <option value="locked-last">Unlocked first</option>
              </select>
            </div>
          </div>

          {/* ── Gear grid ── */}
          {displayItems.length > 0 ? (
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
              role="list"
              aria-label={`${CATEGORY_CONFIG.find((c) => c.kind === activeKind)?.label ?? 'Gear'} collection`}
            >
              {displayItems.map((item) => (
                <div key={item.id} role="listitem">
                  <GearCard
                    item={item}
                    unlocked={item.unlockLevel <= level}
                    equipped={isEquipped(item)}
                    xp={xp}
                    helmetColor={avatar.helmet}
                    onEquip={() => equipItem(item)}
                    onOpenDetail={() => setDetailItem(item)}
                  />
                </div>
              ))}
            </div>
          ) : (
            /* ── Empty state ── */
            <div className="rounded-xl border border-dashed border-border/50 bg-muted/10 py-10 text-center space-y-2">
              <Search className="h-8 w-8 text-muted-foreground/30 mx-auto" aria-hidden="true" />
              <div className="text-sm font-semibold text-foreground">No items found</div>
              <div className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                Try a different search or clear the filters.
              </div>
              <button
                onClick={() => { setQuery(''); setSubCat('all'); }}
                className="text-[11px] text-primary font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              >
                Clear filters
              </button>
            </div>
          )}

        </div>
      </Section>

      {/* ── Item detail modal ── */}
      {detailItem && (
        <GearDetailModal
          item={detailItem}
          unlocked={detailUnlocked}
          equipped={detailEquipped}
          xp={xp}
          helmetColor={avatar.helmet}
          onEquip={() => equipItem(detailItem)}
          onClose={() => setDetailItem(null)}
        />
      )}

      {/* ── Color customization modal ── */}
      {showColorModal && (
        <ColorModal onClose={() => setShowColorModal(false)} />
      )}
    </>
  );
}
