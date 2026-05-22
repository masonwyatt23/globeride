/**
 * Gear catalog — avatar looks unlocked through XP progression.
 *
 * Each item maps to an AvatarColors preset that, when "equipped", is written
 * into settingsStore's avatar field so CesiumViewer picks it up immediately.
 *
 * Levels span 1–20 giving meaningful rewards throughout the progression curve.
 */

import type { AvatarColors } from '@/lib/avatarConfig';

export type GearKind = 'bike' | 'kit';

export interface GearItem {
  id: string;
  name: string;
  kind: GearKind;
  unlockLevel: number;
  colors: AvatarColors;
}

export const GEAR_CATALOG: GearItem[] = [
  // ── Level 1 ─────────────────────────────────────────────────────────────
  {
    id: 'starter-kit',
    name: 'Starter Kit',
    kind: 'kit',
    unlockLevel: 1,
    colors: { frame: '#e2e8f0', wheel: '#0b1220', kit: '#22d3ee', skin: '#d8a877', helmet: '#0ea5e9', accent: '#f59e0b' },
  },
  // ── Level 2 ─────────────────────────────────────────────────────────────
  {
    id: 'midnight-road',
    name: 'Midnight Road',
    kind: 'bike',
    unlockLevel: 2,
    colors: { frame: '#0f172a', wheel: '#1e293b', kit: '#22d3ee', skin: '#d8a877', helmet: '#0284c7', accent: '#38bdf8' },
  },
  // ── Level 3 ─────────────────────────────────────────────────────────────
  {
    id: 'sunset-racer',
    name: 'Sunset Racer',
    kind: 'kit',
    unlockLevel: 3,
    colors: { frame: '#1e293b', wheel: '#0b1220', kit: '#f97316', skin: '#d8a877', helmet: '#fbbf24', accent: '#ef4444' },
  },
  // ── Level 4 ─────────────────────────────────────────────────────────────
  {
    id: 'trail-gravel',
    name: 'Trail Gravel',
    kind: 'bike',
    unlockLevel: 4,
    colors: { frame: '#3f6212', wheel: '#1a2e05', kit: '#84cc16', skin: '#d8a877', helmet: '#65a30d', accent: '#fde047' },
  },
  // ── Level 5 ─────────────────────────────────────────────────────────────
  {
    id: 'stealth-carbon',
    name: 'Stealth Carbon',
    kind: 'bike',
    unlockLevel: 5,
    colors: { frame: '#1c1c1e', wheel: '#000000', kit: '#1e293b', skin: '#d8a877', helmet: '#334155', accent: '#e2e8f0' },
  },
  // ── Level 6 ─────────────────────────────────────────────────────────────
  {
    id: 'royal-sprint',
    name: 'Royal Sprint',
    kind: 'kit',
    unlockLevel: 6,
    colors: { frame: '#e2e8f0', wheel: '#0b1220', kit: '#6366f1', skin: '#d8a877', helmet: '#4f46e5', accent: '#f472b6' },
  },
  // ── Level 7 ─────────────────────────────────────────────────────────────
  {
    id: 'arctic-white',
    name: 'Arctic White',
    kind: 'bike',
    unlockLevel: 7,
    colors: { frame: '#f8fafc', wheel: '#94a3b8', kit: '#e2e8f0', skin: '#d8a877', helmet: '#cbd5e1', accent: '#22d3ee' },
  },
  // ── Level 8 ─────────────────────────────────────────────────────────────
  {
    id: 'volcano-kit',
    name: 'Volcano',
    kind: 'kit',
    unlockLevel: 8,
    colors: { frame: '#292524', wheel: '#1c1917', kit: '#dc2626', skin: '#d8a877', helmet: '#991b1b', accent: '#f97316' },
  },
  // ── Level 10 ────────────────────────────────────────────────────────────
  {
    id: 'cobalt-aero',
    name: 'Cobalt Aero',
    kind: 'bike',
    unlockLevel: 10,
    colors: { frame: '#1e3a5f', wheel: '#0f2746', kit: '#3b82f6', skin: '#d8a877', helmet: '#1d4ed8', accent: '#93c5fd' },
  },
  // ── Level 12 ────────────────────────────────────────────────────────────
  {
    id: 'neon-sprint',
    name: 'Neon Sprint',
    kind: 'kit',
    unlockLevel: 12,
    colors: { frame: '#0d0d0d', wheel: '#050505', kit: '#a3e635', skin: '#d8a877', helmet: '#4ade80', accent: '#facc15' },
  },
  // ── Level 14 ────────────────────────────────────────────────────────────
  {
    id: 'rose-gold',
    name: 'Rose Gold',
    kind: 'bike',
    unlockLevel: 14,
    colors: { frame: '#be9f8a', wheel: '#6b4c38', kit: '#fda4af', skin: '#d8a877', helmet: '#e879a8', accent: '#fcd34d' },
  },
  // ── Level 16 ────────────────────────────────────────────────────────────
  {
    id: 'deep-space',
    name: 'Deep Space',
    kind: 'kit',
    unlockLevel: 16,
    colors: { frame: '#0a0a1a', wheel: '#04040d', kit: '#7c3aed', skin: '#d8a877', helmet: '#5b21b6', accent: '#818cf8' },
  },
  // ── Level 18 ────────────────────────────────────────────────────────────
  {
    id: 'chrome-whip',
    name: 'Chrome Whip',
    kind: 'bike',
    unlockLevel: 18,
    colors: { frame: '#d1d5db', wheel: '#9ca3af', kit: '#f3f4f6', skin: '#d8a877', helmet: '#e5e7eb', accent: '#22d3ee' },
  },
  // ── Level 20 ────────────────────────────────────────────────────────────
  {
    id: 'legend-gold',
    name: 'Legend',
    kind: 'kit',
    unlockLevel: 20,
    colors: { frame: '#78350f', wheel: '#451a03', kit: '#f59e0b', skin: '#d8a877', helmet: '#d97706', accent: '#fef3c7' },
  },
];

/** All gear items unlocked at or below `level`. */
export function unlockedGear(level: number): GearItem[] {
  return GEAR_CATALOG.filter((g) => g.unlockLevel <= level);
}

/** Whether a specific gear item is unlocked for the given level. */
export function isUnlocked(gearId: string, level: number): boolean {
  const item = GEAR_CATALOG.find((g) => g.id === gearId);
  return item ? item.unlockLevel <= level : false;
}
