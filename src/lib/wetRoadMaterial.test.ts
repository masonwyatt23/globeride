import { describe, it, expect } from 'vitest';
import { shouldUseWetMaterial } from '@/lib/wetRoadMaterial';

// ---------------------------------------------------------------------------
// shouldUseWetMaterial
// ---------------------------------------------------------------------------

describe('shouldUseWetMaterial', () => {
  // ---- rain moods — must return true ----

  it('returns true for fjord-rain', () => {
    expect(shouldUseWetMaterial('fjord-rain')).toBe(true);
  });

  it('returns true for alpine-storm', () => {
    expect(shouldUseWetMaterial('alpine-storm')).toBe(true);
  });

  // ---- non-rain moods — must return false ----

  it('returns false for clear-noon', () => {
    expect(shouldUseWetMaterial('clear-noon')).toBe(false);
  });

  it('returns false for golden-hour', () => {
    expect(shouldUseWetMaterial('golden-hour')).toBe(false);
  });

  it('returns false for overcast (overcast is cloudy but not precipitating)', () => {
    expect(shouldUseWetMaterial('overcast')).toBe(false);
  });

  it('returns false for mediterranean-mist (mist, not rain)', () => {
    expect(shouldUseWetMaterial('mediterranean-mist')).toBe(false);
  });

  it('returns false for dusk-cool', () => {
    expect(shouldUseWetMaterial('dusk-cool')).toBe(false);
  });

  it('returns false for clear-afternoon', () => {
    expect(shouldUseWetMaterial('clear-afternoon')).toBe(false);
  });

  it('returns false for an unknown/empty string', () => {
    expect(shouldUseWetMaterial('')).toBe(false);
  });

  it('returns false for a completely unknown mood id', () => {
    expect(shouldUseWetMaterial('volcano-eruption')).toBe(false);
  });
});
