/**
 * gear.test.ts — Wave 37.C catalog shape + helper tests.
 *
 * Covers:
 *  - Per-category minimum counts (bikes 50+, helmets 30+, kits 20+, etc.)
 *  - Every item has a unique id
 *  - Every item has unlockLevel >= 1
 *  - Backward-compat id smoke tests
 *  - HELMETS legacy export resolves by id
 *  - itemsUnlockedAt(1) == starter tier only; itemsUnlockedAt(50) == ALL
 *  - Helper functions
 */

import { describe, it, expect } from 'vitest';

import {
  GEAR_CATALOG,
  HELMETS,
  isUnlocked,
  unlockedGear,
  type GearKind,
} from '@/lib/gear';

import {
  itemForId,
  itemsUnlockedAt,
  bikesOf,
  helmetsOf,
  kitsOf,
  glassesOf,
  shoesOf,
  bottlesOf,
  subCategoriesFor,
} from '@/lib/gear/gearByCategory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countByKind(kind: GearKind) {
  return GEAR_CATALOG.filter((g) => g.kind === kind).length;
}

// ---------------------------------------------------------------------------
// Per-category count assertions
// ---------------------------------------------------------------------------

describe('GEAR_CATALOG minimum counts', () => {
  it('has 50+ bikes', () => {
    expect(countByKind('bike')).toBeGreaterThanOrEqual(50);
  });

  it('has 30+ helmets', () => {
    expect(countByKind('helmet')).toBeGreaterThanOrEqual(30);
  });

  it('has 20+ kits', () => {
    expect(countByKind('kit')).toBeGreaterThanOrEqual(20);
  });

  it('has 10+ glasses', () => {
    expect(countByKind('glasses')).toBeGreaterThanOrEqual(10);
  });

  it('has 5+ shoes', () => {
    expect(countByKind('shoes')).toBeGreaterThanOrEqual(5);
  });

  it('has 5+ bottles', () => {
    expect(countByKind('bottle')).toBeGreaterThanOrEqual(5);
  });

  it('has 120+ items total', () => {
    expect(GEAR_CATALOG.length).toBeGreaterThanOrEqual(120);
  });
});

// ---------------------------------------------------------------------------
// Structural integrity
// ---------------------------------------------------------------------------

describe('GEAR_CATALOG structural integrity', () => {
  it('every item has a unique id', () => {
    const ids = GEAR_CATALOG.map((g) => g.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('every item has unlockLevel >= 1', () => {
    const bad = GEAR_CATALOG.filter((g) => g.unlockLevel < 1);
    expect(bad).toHaveLength(0);
  });

  it('every item has a non-empty name', () => {
    const bad = GEAR_CATALOG.filter((g) => !g.name || g.name.trim() === '');
    expect(bad).toHaveLength(0);
  });

  it('every item has valid AvatarColors (6 hex fields)', () => {
    const hexRe = /^#[0-9a-fA-F]{3,8}$/;
    const bad = GEAR_CATALOG.filter((g) => {
      const c = g.colors;
      return ![c.frame, c.wheel, c.kit, c.skin, c.helmet, c.accent].every((v) =>
        hexRe.test(v),
      );
    });
    expect(bad).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Backward-compat smoke tests
// ---------------------------------------------------------------------------

describe('backward-compat ids', () => {
  it('helmet-starter resolves', () => {
    expect(itemForId('helmet-starter')).not.toBeNull();
  });

  it('helmet-aero resolves', () => {
    expect(itemForId('helmet-aero')).not.toBeNull();
  });

  it('helmet-road resolves', () => {
    expect(itemForId('helmet-road')).not.toBeNull();
  });

  it('helmet-pro resolves', () => {
    expect(itemForId('helmet-pro')).not.toBeNull();
  });

  it('starter-kit resolves', () => {
    expect(itemForId('starter-kit')).not.toBeNull();
  });

  it('midnight-road resolves', () => {
    expect(itemForId('midnight-road')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Legacy HELMETS export
// ---------------------------------------------------------------------------

describe('legacy HELMETS export', () => {
  it('HELMETS contains at least 30 entries', () => {
    expect(HELMETS.length).toBeGreaterThanOrEqual(30);
  });

  it('HELMETS entries all have defaultColor and accentColor', () => {
    const hexRe = /^#[0-9a-fA-F]{3,8}$/;
    const bad = HELMETS.filter(
      (h) => !hexRe.test(h.defaultColor) || !hexRe.test(h.accentColor),
    );
    expect(bad).toHaveLength(0);
  });

  it('HELMETS ids match GEAR_CATALOG helmet ids', () => {
    const catalogIds = new Set(
      GEAR_CATALOG.filter((g) => g.kind === 'helmet').map((g) => g.id),
    );
    const helmetIds = HELMETS.map((h) => h.id);
    for (const id of helmetIds) {
      expect(catalogIds.has(id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Unlock level helpers
// ---------------------------------------------------------------------------

describe('itemsUnlockedAt', () => {
  it('itemsUnlockedAt(1) returns only items with unlockLevel === 1', () => {
    const items = itemsUnlockedAt(1);
    expect(items.every((g) => g.unlockLevel <= 1)).toBe(true);
    // There should be at least one starter item per major category
    const kinds = new Set(items.map((g) => g.kind));
    expect(kinds.has('bike')).toBe(true);
    expect(kinds.has('kit')).toBe(true);
    expect(kinds.has('helmet')).toBe(true);
  });

  it('itemsUnlockedAt(50) returns ALL items', () => {
    const all = itemsUnlockedAt(50);
    expect(all.length).toBe(GEAR_CATALOG.length);
  });

  it('itemsUnlockedAt(10) is a strict subset of itemsUnlockedAt(50)', () => {
    const at10 = itemsUnlockedAt(10);
    const at50 = itemsUnlockedAt(50);
    expect(at10.length).toBeLessThan(at50.length);
    for (const item of at10) {
      expect(at50.some((g) => g.id === item.id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Legacy unlockedGear / isUnlocked helpers
// ---------------------------------------------------------------------------

describe('legacy helpers', () => {
  it('unlockedGear returns the same result as itemsUnlockedAt', () => {
    expect(unlockedGear(15).length).toBe(itemsUnlockedAt(15).length);
  });

  it('isUnlocked returns true for known id at sufficient level', () => {
    expect(isUnlocked('helmet-starter', 1)).toBe(true);
  });

  it('isUnlocked returns false for unknown id', () => {
    expect(isUnlocked('does-not-exist', 99)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Per-category helpers
// ---------------------------------------------------------------------------

describe('category helpers', () => {
  it('bikesOf() returns all bikes', () => {
    expect(bikesOf().length).toBe(countByKind('bike'));
  });

  it('bikesOf("aero") returns only aero bikes', () => {
    const aero = bikesOf('aero');
    expect(aero.length).toBeGreaterThan(0);
    expect(aero.every((g) => g.subCategory === 'aero')).toBe(true);
  });

  it('helmetsOf() returns all helmets', () => {
    expect(helmetsOf().length).toBe(countByKind('helmet'));
  });

  it('kitsOf() returns all kits', () => {
    expect(kitsOf().length).toBe(countByKind('kit'));
  });

  it('glassesOf() returns all glasses', () => {
    expect(glassesOf().length).toBe(countByKind('glasses'));
  });

  it('shoesOf() returns all shoes', () => {
    expect(shoesOf().length).toBe(countByKind('shoes'));
  });

  it('bottlesOf() returns all bottles', () => {
    expect(bottlesOf().length).toBe(countByKind('bottle'));
  });

  it('itemForId returns null for unknown id', () => {
    expect(itemForId('not-a-real-item')).toBeNull();
  });

  it('subCategoriesFor("bike") includes aero, climber, gravel', () => {
    const subs = subCategoriesFor('bike');
    expect(subs).toContain('aero');
    expect(subs).toContain('climber');
    expect(subs).toContain('gravel');
  });
});
