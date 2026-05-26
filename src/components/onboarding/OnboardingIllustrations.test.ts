/**
 * OnboardingIllustrations unit tests — node environment, no DOM/React.
 *
 * Validates the illustration exports and their metadata contracts by reading
 * the source file as raw text — same lightweight pattern used in
 * FeatureGrid.test.ts and HeroVisual.test.ts. Avoids jsdom entirely.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Read the illustration source as raw text so we can inspect it without
// importing React (no jsdom needed, keeps tests fast in node env).
// ---------------------------------------------------------------------------

const SRC_PATH = resolve(
  __dirname,
  'OnboardingIllustrations.tsx',
);

const src = readFileSync(SRC_PATH, 'utf-8');

// ---------------------------------------------------------------------------
// Expected exports — one per onboarding concept step
// ---------------------------------------------------------------------------

const EXPECTED_EXPORTS = [
  'RealEarthScene',
  'TrainerScene',
  'PelotonScene',
  'CoachScene',
  'CompanionScene',
] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OnboardingIllustrations — exports contract', () => {
  it('exports exactly the five expected scene components', () => {
    for (const name of EXPECTED_EXPORTS) {
      expect(src, `Missing export: ${name}`).toContain(`export function ${name}`);
    }
  });

  it('every scene component contains a <title> element for accessibility', () => {
    // Each function should have at least one <title> tag
    const functionBlocks = src.split('export function ').slice(1);
    expect(functionBlocks).toHaveLength(EXPECTED_EXPORTS.length);

    for (let i = 0; i < functionBlocks.length; i++) {
      const block = functionBlocks[i];
      expect(block, `${EXPECTED_EXPORTS[i]} missing <title>`).toContain('<title>');
    }
  });

  it('every scene uses the brand aqua accent color #22d3ee', () => {
    // All five illustrations should reference the Wave 33 brand aqua
    const functionBlocks = src.split('export function ').slice(1);
    for (let i = 0; i < functionBlocks.length; i++) {
      const block = functionBlocks[i];
      expect(block, `${EXPECTED_EXPORTS[i]} missing #22d3ee`).toContain('#22d3ee');
    }
  });
});
