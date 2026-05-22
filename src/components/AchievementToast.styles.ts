/**
 * Tier-specific visual styles for AchievementToast cards.
 * Kept in a separate file so the main component stays lean.
 */
import type { AchievementTier } from '@/lib/achievements';

interface ToastTierStyle {
  border:      string;
  stripe:      string;
  iconBg:      string;
  iconRing:    string;
  trophyColor: string;
}

export const TIER_LABEL_STYLES: Record<AchievementTier, ToastTierStyle> = {
  bronze: {
    border:      'border-amber-600/40',
    stripe:      'bg-gradient-to-r from-amber-600 to-amber-500',
    iconBg:      'bg-amber-600/10',
    iconRing:    'ring-amber-600/30',
    trophyColor: 'text-amber-500 dark:text-amber-400',
  },
  silver: {
    border:      'border-slate-400/40',
    stripe:      'bg-gradient-to-r from-slate-400 to-slate-300',
    iconBg:      'bg-slate-400/10',
    iconRing:    'ring-slate-400/30',
    trophyColor: 'text-slate-400 dark:text-slate-300',
  },
  gold: {
    border:      'border-yellow-400/50',
    stripe:      'bg-gradient-to-r from-yellow-400 to-amber-300',
    iconBg:      'bg-yellow-400/10',
    iconRing:    'ring-yellow-400/30',
    trophyColor: 'text-yellow-400 dark:text-yellow-300',
  },
  platinum: {
    border:      'border-cyan-400/50',
    stripe:      'bg-gradient-to-r from-primary to-accent',
    iconBg:      'bg-cyan-400/10',
    iconRing:    'ring-cyan-400/30',
    trophyColor: 'text-cyan-400 dark:text-cyan-300',
  },
};
