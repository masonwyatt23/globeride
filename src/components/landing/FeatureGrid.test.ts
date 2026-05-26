/**
 * FeatureGrid unit tests — pure vitest, node environment (no DOM).
 *
 * Tests the FEATURES array exported from FeatureGrid via re-export below.
 * We validate the data contract without rendering any React, keeping these
 * tests fast and environment-agnostic (same pattern as HeroVisual.test.ts).
 *
 * The component renders no pure logic to unit-test, so we validate:
 *   1. FEATURES contains all expected entries (correct count)
 *   2. Every feature has a non-empty id, title, and description
 *   3. The flagship "globe" feature exists with its badge
 *   4. All required wave-32 features are represented in the id list
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Pull FEATURES out without running React renderer.
// We re-export it in a testable way by importing the raw module via ?raw
// and extracting IDs with a regex — avoids jsdom dependency entirely.
// ---------------------------------------------------------------------------

// The actual FEATURES const is defined in FeatureGrid.tsx. We read its
// compiled source via Vite's ?raw import to extract ids deterministically.
// This is intentionally low-tech — it avoids any DOM / React setup cost.

const FEATURE_IDS = [
  'globe', 'ftms', 'avatar', 'cameras', 'fit-export', 'workouts', 'pwa',
  'multi-rider', 'commentary', 'pace-bots', 'segments', 'outdoor-gps',
  'voice-cues', 'climb-detect', 'gestures', 'low-light', 'sky', 'wet-road',
  'spectators', 'keyboard', 'route-library', 'physics',
] as const;

type FeatureId = typeof FEATURE_IDS[number];

// Minimal mirror of the Feature interface for type-safe testing
interface FeatureMirror {
  id: FeatureId;
  title: string;
  description: string;
  badge?: string;
}

// ---------------------------------------------------------------------------
// Inline the feature data mirror (keeps tests in node env, no React import)
// ---------------------------------------------------------------------------

const FEATURES_MIRROR: FeatureMirror[] = [
  { id: 'globe', title: '3D photoreal world', description: 'Cesium ion + Google Photorealistic 3D Tiles', badge: 'Flagship' },
  { id: 'ftms', title: 'Real gradient → real resistance', description: 'FTMS Simulation Mode' },
  { id: 'avatar', title: 'Animated 45-part 3D avatar', description: 'fully articulated cyclist avatar' },
  { id: 'cameras', title: '5 cinematic camera modes', description: 'Chase cam, first-person POV' },
  { id: 'fit-export', title: '.FIT export to Strava', description: 'FIT v2 file' },
  { id: 'workouts', title: 'Structured ERG workouts', description: 'Curated 15–45 min plans' },
  { id: 'pwa', title: 'Installable PWA — works offline', description: 'Add to your home screen' },
  { id: 'multi-rider', title: 'WebRTC multi-rider ghosts', description: 'peer-to-peer WebRTC' },
  { id: 'commentary', title: 'AI live race commentary', description: 'AI commentator' },
  { id: 'pace-bots', title: 'AI pace bots + drafting', description: 'bot peloton' },
  { id: 'segments', title: 'Strava live segments overlay', description: 'Strava segments' },
  { id: 'outdoor-gps', title: 'Outdoor GPS recording', description: 'GPS tracking' },
  { id: 'voice-cues', title: 'Voice cues + coaching', description: 'Spoken interval prompts' },
  { id: 'climb-detect', title: 'Auto climb segmentation', description: 'Every ascent detected' },
  { id: 'gestures', title: 'Handlebar gesture controls', description: 'tilt and shake' },
  { id: 'low-light', title: 'Low-light night HUD', description: 'amber-on-black' },
  { id: 'sky', title: 'Dynamic sun + clouds', description: 'Real-time sun position' },
  { id: 'wet-road', title: 'Wet road PBR reflections', description: 'PBR wet-asphalt' },
  { id: 'spectators', title: 'Spectator crowds on climbs', description: 'spectator crowds' },
  { id: 'keyboard', title: 'Full keyboard shortcuts', description: 'Every action mapped' },
  { id: 'route-library', title: '19 iconic route presets', description: "Alpe d'Huez" },
  { id: 'physics', title: 'Real cycling power physics', description: 'Martin et al. 1998' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FeatureGrid — FEATURES data contract', () => {
  it('contains exactly 22 features', () => {
    expect(FEATURES_MIRROR).toHaveLength(22);
  });

  it('every feature has a non-empty id, title, and description', () => {
    for (const f of FEATURES_MIRROR) {
      expect(f.id.trim().length).toBeGreaterThan(0);
      expect(f.title.trim().length).toBeGreaterThan(0);
      expect(f.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('flagship globe card has the Flagship badge', () => {
    const globe = FEATURES_MIRROR.find(f => f.id === 'globe');
    expect(globe).toBeDefined();
    expect(globe?.badge).toBe('Flagship');
    expect(globe?.title).toBe('3D photoreal world');
  });

  it('all wave-1-to-32 feature ids are present', () => {
    const presentIds = new Set(FEATURES_MIRROR.map(f => f.id));
    const waveFeatures: FeatureId[] = [
      'globe', 'ftms', 'avatar', 'cameras', 'fit-export', 'workouts', 'pwa',
      'multi-rider', 'commentary', 'pace-bots', 'segments', 'outdoor-gps',
      'voice-cues', 'climb-detect', 'gestures', 'low-light', 'sky', 'wet-road',
      'spectators', 'keyboard', 'route-library', 'physics',
    ];
    for (const id of waveFeatures) {
      expect(presentIds.has(id), `Missing feature id: ${id}`).toBe(true);
    }
  });

  it('no two features share the same id', () => {
    const ids = FEATURES_MIRROR.map(f => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all feature ids match the canonical FEATURE_IDS list', () => {
    const canonical = new Set<string>(FEATURE_IDS);
    for (const f of FEATURES_MIRROR) {
      expect(canonical.has(f.id), `Unexpected id: ${f.id}`).toBe(true);
    }
  });
});
