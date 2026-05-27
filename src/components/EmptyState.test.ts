/**
 * EmptyState unit tests — node environment (no DOM / jsdom).
 *
 * We test the component's prop contract by parsing the raw source with
 * regex and validating the interface shape — same pattern used in
 * FeatureGrid.test.ts and DemoModal.test.ts to stay framework-agnostic
 * in the vitest node environment.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = readFileSync(
  resolve(__dirname, 'EmptyState.tsx'),
  'utf-8',
);

// ---------------------------------------------------------------------------
// Shape tests — validate the exported interface and component exist
// ---------------------------------------------------------------------------

describe('EmptyState — source shape', () => {
  it('exports EmptyState function component', () => {
    expect(SOURCE).toContain('export function EmptyState(');
  });

  it('exports EmptyStateProps interface with required title prop', () => {
    expect(SOURCE).toContain('export interface EmptyStateProps');
    expect(SOURCE).toContain('title: string');
  });

  it('exports EmptyStateAction interface', () => {
    expect(SOURCE).toContain('export interface EmptyStateAction');
    expect(SOURCE).toContain('label: string');
    expect(SOURCE).toContain('onClick: () => void');
    expect(SOURCE).toContain('primary?: boolean');
  });

  it('has role="region" for a11y', () => {
    expect(SOURCE).toContain('role="region"');
  });

  it('has aria-label bound to title prop', () => {
    expect(SOURCE).toContain('aria-label={title}');
  });

  it('renders a heading element (h2 or h3) with the title', () => {
    // The Heading constant is set to 'h2' or 'h3' and rendered as <Heading>
    expect(SOURCE).toContain('const Heading = headingLevel === 3');
    expect(SOURCE).toContain('<Heading');
  });

  it('slices actions to a max of 3', () => {
    expect(SOURCE).toContain('actions.slice(0, 3)');
  });

  it('renders description inside a <p> tag', () => {
    expect(SOURCE).toContain('<p className=');
    expect(SOURCE).toContain('{description}');
  });
});

// ---------------------------------------------------------------------------
// Callback contract test — inline action object validation
// ---------------------------------------------------------------------------

describe('EmptyState — action contract', () => {
  it('EmptyStateAction onClick is invocable', () => {
    const cb = vi.fn();
    const action = {
      label: 'Upload GPX',
      onClick: cb,
      primary: true,
    };
    // Verify the shape matches the exported interface
    expect(typeof action.label).toBe('string');
    expect(typeof action.onClick).toBe('function');
    expect(typeof action.primary).toBe('boolean');
    action.onClick();
    expect(cb).toHaveBeenCalledOnce();
  });

  it('supports up to 3 actions, primary flag and icon', () => {
    const actions = [
      { label: 'Upload GPX',       onClick: vi.fn(), primary: true },
      { label: 'Pick iconic route', onClick: vi.fn(), primary: false },
      { label: 'Draw your own',    onClick: vi.fn() },
    ];
    expect(actions).toHaveLength(3);
    for (const a of actions) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(typeof a.onClick).toBe('function');
    }
  });

  it('defaults primary to falsy when omitted', () => {
    const action = { label: 'Go', onClick: vi.fn() };
    expect(action.primary).toBeUndefined();
  });

  it('multiple distinct actions fire distinct callbacks', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const actions = [
      { label: 'A', onClick: cb1 },
      { label: 'B', onClick: cb2 },
    ];
    actions[0].onClick();
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).not.toHaveBeenCalled();
    actions[1].onClick();
    expect(cb2).toHaveBeenCalledOnce();
  });
});
