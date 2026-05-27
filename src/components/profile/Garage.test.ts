/**
 * Garage.test.ts — Wave 38.A filter/sort logic + unlock/lock split tests.
 *
 * Pure function tests — no React rendering required.
 * Tests filterItems() and helmetToGearItem() exported from Garage.tsx.
 */

import { describe, it, expect } from 'vitest';
import { filterItems, helmetToGearItem } from './Garage';
import { GEAR_CATALOG, HELMETS, type GearItem } from '@/lib/gear';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bikes(): GearItem[] {
  return GEAR_CATALOG.filter((g) => g.kind === 'bike');
}

// ---------------------------------------------------------------------------
// filterItems — search
// ---------------------------------------------------------------------------

describe('filterItems — search', () => {
  it('returns all items when query is empty', () => {
    const all = bikes();
    expect(filterItems(all, '', 'all', 'default', 50)).toHaveLength(all.length);
  });

  it('filters by substring (case-insensitive)', () => {
    const result = filterItems(bikes(), 'aero', 'all', 'default', 50);
    expect(result.length).toBeGreaterThan(0);
    for (const item of result) {
      expect(item.name.toLowerCase()).toContain('aero');
    }
  });

  it('returns empty array when query matches nothing', () => {
    const result = filterItems(bikes(), 'zzzznotarealname', 'all', 'default', 50);
    expect(result).toHaveLength(0);
  });

  it('trims whitespace from query before matching', () => {
    const trimmed = filterItems(bikes(), '  midnight  ', 'all', 'default', 50);
    const exact   = filterItems(bikes(), 'midnight', 'all', 'default', 50);
    expect(trimmed).toHaveLength(exact.length);
  });
});

// ---------------------------------------------------------------------------
// filterItems — sub-category
// ---------------------------------------------------------------------------

describe('filterItems — subCategory', () => {
  it('"all" sub-category returns every item', () => {
    const all = bikes();
    expect(filterItems(all, '', 'all', 'default', 50)).toHaveLength(all.length);
  });

  it('filters to only the given subCategory', () => {
    const result = filterItems(bikes(), '', 'aero', 'default', 50);
    expect(result.length).toBeGreaterThan(0);
    for (const item of result) {
      expect(item.subCategory).toBe('aero');
    }
  });

  it('returns empty array for a subCategory that has no items', () => {
    const result = filterItems(bikes(), '', 'this-sub-does-not-exist', 'default', 50);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterItems — sort
// ---------------------------------------------------------------------------

describe('filterItems — sort', () => {
  it('default sort orders by unlockLevel ascending', () => {
    const result = filterItems(bikes(), '', 'all', 'default', 50);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].unlockLevel).toBeGreaterThanOrEqual(result[i - 1].unlockLevel);
    }
  });

  it('name sort orders alphabetically', () => {
    const result = filterItems(bikes(), '', 'all', 'name', 50);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].name.localeCompare(result[i - 1].name)).toBeGreaterThanOrEqual(0);
    }
  });

  it('locked-last puts all unlocked items before locked ones at level 5', () => {
    const result = filterItems(bikes(), '', 'all', 'locked-last', 5);
    let seenLocked = false;
    for (const item of result) {
      const locked = item.unlockLevel > 5;
      if (!locked && seenLocked) {
        // Found an unlocked item after a locked one — fail
        expect(false).toBe(true);
      }
      if (locked) seenLocked = true;
    }
  });
});

// ---------------------------------------------------------------------------
// filterItems — unlock/lock split
// ---------------------------------------------------------------------------

describe('filterItems — unlock/lock split', () => {
  it('at level 1 only unlockLevel <= 1 items are accessible', () => {
    const all = GEAR_CATALOG.filter((g) => g.kind === 'bike');
    const atOne = filterItems(all, '', 'all', 'default', 1);
    // All catalog items are returned; caller checks unlockLevel <= level for display
    // But the filter itself doesn't hide locked items — it merely sorts them
    const unlockedInResult = atOne.filter((g) => g.unlockLevel <= 1);
    expect(unlockedInResult.length).toBeGreaterThan(0);
  });

  it('locked items are still present in results (UI handles greying)', () => {
    const all = GEAR_CATALOG.filter((g) => g.kind === 'bike');
    const result = filterItems(all, '', 'all', 'default', 1);
    const lockedItems = result.filter((g) => g.unlockLevel > 1);
    expect(lockedItems.length).toBeGreaterThan(0);
  });

  it('at level 50 every item in the catalog passes through', () => {
    const all = GEAR_CATALOG.filter((g) => g.kind === 'bike');
    expect(filterItems(all, '', 'all', 'default', 50)).toHaveLength(all.length);
  });
});

// ---------------------------------------------------------------------------
// helmetToGearItem
// ---------------------------------------------------------------------------

describe('helmetToGearItem', () => {
  it('converts a HelmetItem to a GearItem with kind === "helmet"', () => {
    const h = HELMETS[0];
    const g = helmetToGearItem(h);
    expect(g.kind).toBe('helmet');
    expect(g.id).toBe(h.id);
    expect(g.name).toBe(h.name);
    expect(g.unlockLevel).toBe(h.unlockLevel);
  });

  it('sets colors.helmet to defaultColor', () => {
    const h = HELMETS[0];
    const g = helmetToGearItem(h);
    expect(g.colors.helmet).toBe(h.defaultColor);
  });

  it('sets colors.accent to accentColor', () => {
    const h = HELMETS[0];
    const g = helmetToGearItem(h);
    expect(g.colors.accent).toBe(h.accentColor);
  });

  it('all converted helmets have valid hex colors', () => {
    const hexRe = /^#[0-9a-fA-F]{3,8}$/;
    for (const h of HELMETS) {
      const g = helmetToGearItem(h);
      expect(hexRe.test(g.colors.helmet)).toBe(true);
      expect(hexRe.test(g.colors.accent)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Combined search + subCategory
// ---------------------------------------------------------------------------

describe('filterItems — combined filters', () => {
  it('search + subCategory both apply', () => {
    const all = bikes();
    // Search for "aero" within the "aero" subCategory — should match at least one
    const result = filterItems(all, 'aero', 'aero', 'default', 50);
    expect(result.length).toBeGreaterThan(0);
    for (const item of result) {
      expect(item.subCategory).toBe('aero');
      expect(item.name.toLowerCase()).toContain('aero');
    }
  });

  it('subCategory filter + name sort stays sorted', () => {
    const all = bikes();
    const result = filterItems(all, '', 'gravel', 'name', 50);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].name.localeCompare(result[i - 1].name)).toBeGreaterThanOrEqual(0);
      expect(result[i].subCategory).toBe('gravel');
    }
  });
});
