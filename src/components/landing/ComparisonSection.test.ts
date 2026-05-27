/**
 * ComparisonSection unit tests — pure vitest, node environment (no DOM).
 *
 * Validates the COMPARISON_ROWS data contract exported from ComparisonSection
 * without mounting React. Pattern mirrors FeatureGrid.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { COMPARISON_ROWS } from './ComparisonSection';

describe('ComparisonSection: data contract', () => {
  it('has at least 8 comparison rows', () => {
    expect(COMPARISON_ROWS.length).toBeGreaterThanOrEqual(8);
  });

  it('every row has a non-empty axis, globeride, and zwift value', () => {
    for (const row of COMPARISON_ROWS) {
      expect(row.axis.trim().length, `axis empty in row: ${JSON.stringify(row)}`).toBeGreaterThan(0);
      expect(row.globeride.trim().length, `globeride empty in row: ${JSON.stringify(row)}`).toBeGreaterThan(0);
      expect(row.zwift.trim().length, `zwift empty in row: ${JSON.stringify(row)}`).toBeGreaterThan(0);
    }
  });

  it('pricing row exists and shows $0 for GlobeRide', () => {
    const pricing = COMPARISON_ROWS.find(r => r.axis.toLowerCase().includes('pricing'));
    expect(pricing).toBeDefined();
    expect(pricing!.globeride).toMatch(/\$0/);
  });

  it('pricing row shows a paid amount for Zwift', () => {
    const pricing = COMPARISON_ROWS.find(r => r.axis.toLowerCase().includes('pricing'));
    expect(pricing!.zwift).toMatch(/\$/);
  });

  it('offline row exists and GlobeRide lists PWA', () => {
    const offline = COMPARISON_ROWS.find(r => r.axis.toLowerCase().includes('offline'));
    expect(offline).toBeDefined();
    expect(offline!.globeride.toLowerCase()).toMatch(/pwa|offline/);
  });

  it('source code row exists and GlobeRide is MIT', () => {
    const src = COMPARISON_ROWS.find(r => r.axis.toLowerCase().includes('source'));
    expect(src).toBeDefined();
    expect(src!.globeride.toLowerCase()).toMatch(/mit|open/);
  });

  it('no two rows share the same axis label', () => {
    const axes = COMPARISON_ROWS.map(r => r.axis.toLowerCase());
    const unique = new Set(axes);
    expect(unique.size).toBe(axes.length);
  });
});
