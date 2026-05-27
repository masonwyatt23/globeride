/**
 * QuickstartSection unit tests — pure vitest, node environment (no DOM).
 *
 * Validates the QUICKSTART_STEPS data contract exported from QuickstartSection
 * without mounting React. Pattern mirrors FeatureGrid.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { QUICKSTART_STEPS } from './QuickstartSection';

describe('QuickstartSection: data contract', () => {
  it('has exactly 4 steps', () => {
    expect(QUICKSTART_STEPS).toHaveLength(4);
  });

  it('steps are numbered 1 through 4 in order', () => {
    const numbers = QUICKSTART_STEPS.map(s => s.n);
    expect(numbers).toEqual([1, 2, 3, 4]);
  });

  it('every step has a non-empty title and description', () => {
    for (const step of QUICKSTART_STEPS) {
      expect(step.title.trim().length, `title empty in step ${step.n}`).toBeGreaterThan(0);
      expect(step.description.trim().length, `description empty in step ${step.n}`).toBeGreaterThan(0);
    }
  });

  it('step 1 mentions GPX or route', () => {
    const s = QUICKSTART_STEPS[0];
    const combined = (s.title + ' ' + s.description).toLowerCase();
    expect(combined).toMatch(/gpx|route/);
  });

  it('step 2 mentions trainer or bluetooth', () => {
    const s = QUICKSTART_STEPS[1];
    const combined = (s.title + ' ' + s.description).toLowerCase();
    expect(combined).toMatch(/trainer|bluetooth|connect/);
  });

  it('step 4 mentions ride or strava or fit', () => {
    const s = QUICKSTART_STEPS[3];
    const combined = (s.title + ' ' + s.description).toLowerCase();
    expect(combined).toMatch(/ride|strava|\.fit|fit/i);
  });

  it('every step has an Illustration function', () => {
    for (const step of QUICKSTART_STEPS) {
      expect(typeof step.Illustration).toBe('function');
    }
  });
});
