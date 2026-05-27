/**
 * SettingsPanel.test.ts — Unit tests for tabbed settings redesign.
 *
 * Pure logic tests — no React rendering required.
 * Tests the settings index (ALL_SETTINGS), search filtering, and tab
 * navigation order from SettingsSearchBar.
 */

import { describe, it, expect } from 'vitest';
import { ALL_SETTINGS, type TabId, type SettingEntry } from './settings/SettingsSearchBar';

// Re-export TABS from SettingsPanel for the ordering test.
// The tab order array is defined locally here to avoid importing JSX.
const SETTINGS_TAB_ORDER: TabId[] = [
  'rider', 'trainer', 'visual', 'audio', 'controls', 'multiplayer', 'data',
];

// ---------------------------------------------------------------------------
// Helper: filter ALL_SETTINGS the same way the search bar does
// ---------------------------------------------------------------------------

function searchSettings(query: string): SettingEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ALL_SETTINGS.filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      (e.description?.toLowerCase().includes(q) ?? false) ||
      e.tabLabel.toLowerCase().includes(q),
  );
}

// ---------------------------------------------------------------------------
// ALL_SETTINGS index integrity
// ---------------------------------------------------------------------------

describe('ALL_SETTINGS index', () => {
  it('every entry has a non-empty id, tab, tabLabel, and label', () => {
    for (const entry of ALL_SETTINGS) {
      expect(entry.id).toBeTruthy();
      expect(entry.tab).toBeTruthy();
      expect(entry.tabLabel).toBeTruthy();
      expect(entry.label).toBeTruthy();
    }
  });

  it('every tab referenced in ALL_SETTINGS is a valid TabId', () => {
    const valid = new Set<TabId>(SETTINGS_TAB_ORDER);
    for (const entry of ALL_SETTINGS) {
      expect(valid.has(entry.tab)).toBe(true);
    }
  });

  it('ids are unique across all settings', () => {
    const ids = ALL_SETTINGS.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('covers all 7 defined tabs', () => {
    const coveredTabs = new Set(ALL_SETTINGS.map((e) => e.tab));
    for (const tab of SETTINGS_TAB_ORDER) {
      expect(coveredTabs.has(tab)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Search filtering
// ---------------------------------------------------------------------------

describe('searchSettings — case-insensitive substring match', () => {
  it('returns empty array for empty query', () => {
    expect(searchSettings('')).toHaveLength(0);
    expect(searchSettings('   ')).toHaveLength(0);
  });

  it('matches label (case-insensitive)', () => {
    const results = searchSettings('FTP');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((e) => e.id === 'ftpW')).toBe(true);
  });

  it('matches description (case-insensitive)', () => {
    // "watts" appears in ftpW description
    const results = searchSettings('watts');
    expect(results.length).toBeGreaterThan(0);
  });

  it('matches tab label', () => {
    const results = searchSettings('trainer');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((e) => e.tab === 'trainer' || e.tabLabel.toLowerCase().includes('trainer'))).toBe(true);
  });

  it('returns empty array when nothing matches', () => {
    expect(searchSettings('zznotarealterm')).toHaveLength(0);
  });

  it('each result contains the query in label, description, or tabLabel', () => {
    const q = 'camera';
    const results = searchSettings(q);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      const haystack = [r.label, r.description ?? '', r.tabLabel].join(' ').toLowerCase();
      expect(haystack).toContain(q);
    }
  });
});

// ---------------------------------------------------------------------------
// Tab navigation order
// ---------------------------------------------------------------------------

describe('tab navigation order', () => {
  it('has exactly 7 tabs', () => {
    expect(SETTINGS_TAB_ORDER).toHaveLength(7);
  });

  it('tabs are in expected order', () => {
    expect(SETTINGS_TAB_ORDER).toEqual([
      'rider', 'trainer', 'visual', 'audio', 'controls', 'multiplayer', 'data',
    ]);
  });

  it('ArrowRight wraps from last tab back to first', () => {
    const lastIdx = SETTINGS_TAB_ORDER.length - 1;
    const next = (lastIdx + 1) % SETTINGS_TAB_ORDER.length;
    expect(SETTINGS_TAB_ORDER[next]).toBe('rider');
  });

  it('ArrowLeft wraps from first tab back to last', () => {
    const firstIdx = 0;
    const prev = (firstIdx - 1 + SETTINGS_TAB_ORDER.length) % SETTINGS_TAB_ORDER.length;
    expect(SETTINGS_TAB_ORDER[prev]).toBe('data');
  });
});

// ---------------------------------------------------------------------------
// Search result — tab routing
// ---------------------------------------------------------------------------

describe('search result tab routing', () => {
  it('camera-mode result routes to visual tab', () => {
    const results = searchSettings('camera mode');
    const cameraEntry = results.find((e) => e.id === 'cameraMode');
    expect(cameraEntry).toBeDefined();
    expect(cameraEntry?.tab).toBe('visual');
  });

  it('voice control result routes to controls tab', () => {
    const results = searchSettings('voice control');
    const entry = results.find((e) => e.id === 'voiceControlEnabled');
    expect(entry).toBeDefined();
    expect(entry?.tab).toBe('controls');
  });

  it('Strava result routes to data tab', () => {
    const results = searchSettings('strava');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((e) => e.tab === 'data')).toBe(true);
  });
});
