/**
 * avatarFromGear — pure wiring layer between equipped gear IDs and createAvatar() params.
 *
 * Wave 37.E: resolves the user's equipped gear IDs (from settingsStore) into the
 * avatar creation parameters that 37.A's expanded createAvatar() signature expects.
 *
 * This module is deliberately Cesium-free and side-effect-free so it can be
 * unit-tested without a browser or WebGL context.
 */

import { GEAR_CATALOG, HELMETS, type GearItem, type HelmetItem } from '@/lib/gear';
import { type AvatarColors, DEFAULT_AVATAR_COLORS } from '@/lib/avatarConfig';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EquippedGear {
  bike: GearItem | null;
  kit: GearItem | null;
  helmet: HelmetItem | null;
  /** glasses, shoes, bottle — catalog entries if 37.C adds them; null otherwise. */
  glasses: GearItem | null;
  shoes: GearItem | null;
  bottle: GearItem | null;
}

/**
 * The avatar params derived from equipped gear. These map 1-to-1 onto the
 * extended `createAvatar()` signature that Wave 37.A adds.
 *
 * Until 37.A lands, callers should spread these safely into createAvatar()
 * — unknown keys are ignored by the current implementation.
 */
export interface AvatarGearParams {
  /** Merged AvatarColors: kit/helmet colors from gear override the base colors. */
  colors: AvatarColors;
  /**
   * Helmet shape identifier forwarded to createAvatar({ helmetStyle }).
   * Matches HelmetItem.id values: 'helmet-starter' | 'helmet-aero' | 'helmet-road' | 'helmet-pro'.
   * Falls back to 'helmet-starter' when no helmet is equipped.
   */
  helmetStyle: string;
  /** True when a glasses GearItem is equipped (forwarded to createAvatar({ hasGlasses })). */
  hasGlasses: boolean;
  /** True when a bottle GearItem is equipped (forwarded to createAvatar({ hasBottle })). */
  hasBottle: boolean;
  /**
   * Bike frame shape identifier forwarded to createAvatar({ bikeShape }).
   * Derived from the equipped bike GearItem kind + id.
   * Falls back to 'road' when no bike is equipped.
   */
  bikeShape: string;
}

// ---------------------------------------------------------------------------
// Gear ID fields we need from RiderSettings (avoid importing the full store
// type to keep this module dependency-light).
// ---------------------------------------------------------------------------

export interface GearIdFields {
  bikeId: string;
  kitId: string;
  helmetId: string;
  glassesId: string;
  shoesId: string;
  bottleId: string;
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

/**
 * Look up each equipped gear ID in the catalogs and return the matched items
 * (or null when the ID is unknown / not found).
 *
 * Pure function — no side effects, no allocations beyond the result object.
 */
export function resolveEquippedGear(ids: GearIdFields): EquippedGear {
  const bike    = GEAR_CATALOG.find((g) => g.kind === 'bike'    && g.id === ids.bikeId)    ?? null;
  const kit     = GEAR_CATALOG.find((g) => g.kind === 'kit'     && g.id === ids.kitId)     ?? null;
  // Cast to string before comparing kinds that 37.C hasn't added to GearKind yet.
  const glasses = GEAR_CATALOG.find((g) => (g.kind as string) === 'glasses' && g.id === ids.glassesId) ?? null;
  const shoes   = GEAR_CATALOG.find((g) => (g.kind as string) === 'shoes'   && g.id === ids.shoesId)   ?? null;
  const bottle  = GEAR_CATALOG.find((g) => (g.kind as string) === 'bottle'  && g.id === ids.bottleId)  ?? null;
  const helmet  = HELMETS.find((h) => h.id === ids.helmetId) ?? null;

  return { bike, kit, helmet, glasses, shoes, bottle };
}

/**
 * Derive avatar creation params from resolved gear items and the rider's base
 * avatar colors (from settingsStore.avatar).
 *
 * Color priority (highest wins):
 *   1. Kit item colors for jersey/accent fields (kit.colors.kit, kit.colors.accent)
 *   2. Bike item colors for frame/wheel fields (bike.colors.frame, bike.colors.wheel)
 *   3. Helmet item defaultColor for the helmet field
 *   4. Base colors from settingsStore.avatar for anything not overridden
 *
 * Pure function — safe to call every frame.
 */
export function avatarParamsFromGear(
  equipped: EquippedGear,
  baseColors: AvatarColors,
): AvatarGearParams {
  // Start from the rider's manually-customized base colors.
  const colors: AvatarColors = { ...baseColors };

  // Kit overrides jersey + accent.
  if (equipped.kit) {
    colors.kit    = equipped.kit.colors.kit;
    colors.accent = equipped.kit.colors.accent;
  }

  // Bike overrides frame + wheel.
  if (equipped.bike) {
    colors.frame = equipped.bike.colors.frame;
    colors.wheel = equipped.bike.colors.wheel;
  }

  // Helmet overrides helmet color field.
  if (equipped.helmet) {
    colors.helmet = equipped.helmet.defaultColor;
  }

  // helmetStyle — forward the HelmetItem.id so 37.A can vary geometry.
  const helmetStyle = equipped.helmet?.id ?? 'helmet-starter';

  // bikeShape — derive from the equipped bike's id; falls back to 'road'.
  // 37.A maps these strings to geometry variants (road / gravel / aero / tt).
  const bikeShape = deriveBikeShape(equipped.bike);

  return {
    colors,
    helmetStyle,
    hasGlasses: equipped.glasses !== null,
    hasBottle:  equipped.bottle  !== null,
    bikeShape,
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Map a bike GearItem to a geometry shape string.
 * Convention: check id substrings for known shape keywords; fall back to 'road'.
 */
function deriveBikeShape(bike: GearItem | null): string {
  if (!bike) return 'road';
  const id = bike.id.toLowerCase();
  if (id.includes('gravel') || id.includes('trail')) return 'gravel';
  if (id.includes('aero'))  return 'aero';
  if (id.includes('tt'))    return 'tt';
  return 'road';
}

// ---------------------------------------------------------------------------
// Convenience: resolve + derive in one call (used by CesiumViewer).
// ---------------------------------------------------------------------------

/**
 * One-shot helper — resolve gear IDs and produce avatar params.
 * Equivalent to `avatarParamsFromGear(resolveEquippedGear(ids), baseColors)`.
 */
export function avatarParamsForSettings(
  ids: GearIdFields,
  baseColors: AvatarColors = DEFAULT_AVATAR_COLORS,
): AvatarGearParams {
  return avatarParamsFromGear(resolveEquippedGear(ids), baseColors);
}
