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
import type { BikeShape, KitPattern, KitAccent, ShoeStyle } from '@/lib/avatar';

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
   * Derived from the equipped bike GearItem.shape field.
   * Falls back to 'roadAllRounder' when no bike is equipped.
   */
  bikeShape: BikeShape;
  /**
   * Kit colour pattern forwarded to createAvatar({ kitPattern }).
   * Derived from the kit GearItem.subCategory.
   * Falls back to 'solid' when no kit is equipped.
   */
  kitPattern: KitPattern;
  /**
   * Optional accent colours for multi-colour kit patterns.
   * Forwarded from kit GearItem.accentColors.
   */
  kitAccent: KitAccent | undefined;
  /**
   * Shoe geometry style forwarded to createAvatar({ shoeStyle }).
   * Derived from the shoes GearItem.shape field.
   * Falls back to 'roadClip' when no shoes are equipped.
   */
  shoeStyle: ShoeStyle;
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

  // bikeShape — derive from the equipped bike's shape field (Wave 38.B).
  const bikeShape = deriveBikeShape(equipped.bike);

  // kitPattern + kitAccent — derive from the equipped kit's subCategory.
  const kitPattern = deriveKitPattern(equipped.kit);
  const kitAccent  = equipped.kit?.accentColors
    ? { primary: equipped.kit.accentColors.primary,
        secondary: equipped.kit.accentColors.secondary,
        tertiary: equipped.kit.accentColors.tertiary }
    : undefined;

  // shoeStyle — derive from the equipped shoes' shape field.
  const shoeStyle = deriveShoeStyle(equipped.shoes);

  return {
    colors,
    helmetStyle,
    hasGlasses: equipped.glasses !== null,
    hasBottle:  equipped.bottle  !== null,
    bikeShape,
    kitPattern,
    kitAccent,
    shoeStyle,
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Map a bike GearItem to a BikeShape via its shape field.
 * Falls back to keyword scan of id, then 'roadAllRounder'.
 */
function deriveBikeShape(bike: GearItem | null): BikeShape {
  if (!bike) return 'roadAllRounder';
  const shape = bike.shape?.toLowerCase() ?? '';
  const shapeMap: Record<string, BikeShape> = {
    allrounder:  'roadAllRounder',
    climber:     'roadClimber',
    aero:        'roadAero',
    tt:          'tt',
    gravel:      'gravel',
    fixie:       'fixie',
    mtbhardtail: 'mtbHardtail',
    mtbfullsus:  'mtbFullSus',
    ebike:       'ebike',
    vintage:     'vintage',
  };
  if (shapeMap[shape]) return shapeMap[shape];
  // Fallback: keyword scan of id.
  const id = bike.id.toLowerCase();
  if (id.includes('gravel') || id.includes('trail')) return 'gravel';
  if (id.includes('aero'))   return 'roadAero';
  if (id.includes('tt'))     return 'tt';
  if (id.includes('mtb') || id.includes('hardtail')) return 'mtbHardtail';
  if (id.includes('fixie'))  return 'fixie';
  if (id.includes('vintage') || id.includes('steel')) return 'vintage';
  if (id.includes('ebike') || id.includes('e-bike'))  return 'ebike';
  return 'roadAllRounder';
}

/**
 * Map a kit GearItem's subCategory to a KitPattern.
 * Falls back to 'solid'.
 */
function deriveKitPattern(kit: GearItem | null): KitPattern {
  if (!kit) return 'solid';
  const sub = (kit.subCategory ?? '').toLowerCase();
  if (sub === 'kom')              return 'polka';
  if (sub === 'world-champion')   return 'rainbow';
  if (sub === 'leader')           return 'yellowLeader';
  if (sub === 'sprinter')         return 'sprinterGreen';
  if (sub === 'vintage')          return 'stripes';
  if (sub === 'team-replica')     return 'teamReplica';
  // Fluoro kits: id contains 'fluoro'
  if (kit.id.toLowerCase().includes('fluoro')) return 'fluoro';
  return 'solid';
}

/**
 * Map a shoes GearItem's shape field to a ShoeStyle.
 * Falls back to 'roadClip'.
 */
function deriveShoeStyle(shoes: GearItem | null): ShoeStyle {
  if (!shoes) return 'roadClip';
  const shape = shoes.shape?.toLowerCase() ?? '';
  if (shape === 'gravelshoe')   return 'gravel';
  if (shape === 'mtbshoe')      return 'mtbClip';
  if (shape === 'vintage')      return 'vintage';
  const id = shoes.id.toLowerCase();
  if (id.includes('fluoro'))    return 'fluoro';
  if (id.includes('gravel'))    return 'gravel';
  if (id.includes('mtb'))       return 'mtbClip';
  if (id.includes('vintage') || id.includes('leather')) return 'vintage';
  return 'roadClip';
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
