/**
 * gearByCategory — helpers for filtering the GEAR_CATALOG by kind / subCategory.
 *
 * Import these instead of reaching into GEAR_CATALOG directly so consumers
 * don't need to repeat the filter logic and stay in sync with catalog changes.
 */

import { GEAR_CATALOG, type GearItem, type GearKind } from '@/lib/gear';

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

/** All items of a given kind, optionally filtered to a subCategory. */
export function itemsOfKind(kind: GearKind, subCategory?: string): GearItem[] {
  return GEAR_CATALOG.filter(
    (g) => g.kind === kind && (subCategory === undefined || g.subCategory === subCategory),
  );
}

/** Look up a single item by id. Returns null if not found. */
export function itemForId(id: string): GearItem | null {
  return GEAR_CATALOG.find((g) => g.id === id) ?? null;
}

/**
 * All items with unlockLevel <= `level`.
 * Pass `kind` to narrow to a single category.
 */
export function itemsUnlockedAt(level: number, kind?: GearKind): GearItem[] {
  return GEAR_CATALOG.filter(
    (g) => g.unlockLevel <= level && (kind === undefined || g.kind === kind),
  );
}

// ---------------------------------------------------------------------------
// Per-category convenience wrappers
// ---------------------------------------------------------------------------

/** Bikes, optionally filtered by subCategory ('aero', 'climber', 'gravel', etc.). */
export function bikesOf(subCategory?: string): GearItem[] {
  return itemsOfKind('bike', subCategory);
}

/** Helmets, optionally filtered by subCategory ('aero-tt', 'road-aero', 'mtb-fullface', etc.). */
export function helmetsOf(subCategory?: string): GearItem[] {
  return itemsOfKind('helmet', subCategory);
}

/** Kits / jerseys, optionally filtered by subCategory. */
export function kitsOf(subCategory?: string): GearItem[] {
  return itemsOfKind('kit', subCategory);
}

/** Glasses, optionally filtered by subCategory. */
export function glassesOf(subCategory?: string): GearItem[] {
  return itemsOfKind('glasses', subCategory);
}

/** Shoes, optionally filtered by subCategory. */
export function shoesOf(subCategory?: string): GearItem[] {
  return itemsOfKind('shoes', subCategory);
}

/** Bottles, optionally filtered by subCategory. */
export function bottlesOf(subCategory?: string): GearItem[] {
  return itemsOfKind('bottle', subCategory);
}

/** All sub-category strings present in the catalog for the given kind. */
export function subCategoriesFor(kind: GearKind): string[] {
  return [
    ...new Set(
      GEAR_CATALOG.filter((g) => g.kind === kind && g.subCategory !== undefined).map(
        (g) => g.subCategory as string,
      ),
    ),
  ].sort();
}
