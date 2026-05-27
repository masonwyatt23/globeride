/**
 * RidersSection unit tests — pure vitest, node environment (no DOM).
 *
 * Validates the RIDER_CARDS data contract exported from RidersSection
 * without mounting React. Pattern mirrors FeatureGrid.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { RIDER_CARDS } from './RidersSection';

describe('RidersSection: data contract', () => {
  it('has exactly 3 rider scenario cards', () => {
    expect(RIDER_CARDS).toHaveLength(3);
  });

  it('every card has a non-empty id, heading, and body', () => {
    for (const card of RIDER_CARDS) {
      expect(card.id.trim().length, `id empty: ${JSON.stringify(card)}`).toBeGreaterThan(0);
      expect(card.heading.trim().length, `heading empty: ${card.id}`).toBeGreaterThan(0);
      expect(card.body.trim().length, `body empty: ${card.id}`).toBeGreaterThan(0);
    }
  });

  it('no two cards share the same id', () => {
    const ids = RIDER_CARDS.map(c => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('Tour de France card exists and mentions gradient or terrain', () => {
    const card = RIDER_CARDS.find(c => c.id === 'tour-de-france');
    expect(card).toBeDefined();
    const combined = (card!.heading + ' ' + card!.body).toLowerCase();
    expect(combined).toMatch(/gradient|terrain|stage|peloton/);
  });

  it('Mont Ventoux card exists and mentions terrain or cesium or sunset', () => {
    const card = RIDER_CARDS.find(c => c.id === 'mont-ventoux');
    expect(card).toBeDefined();
    const combined = (card!.heading + ' ' + card!.body).toLowerCase();
    expect(combined).toMatch(/cesium|terrain|sunset|limestone/);
  });

  it('friday peloton card exists and mentions WebRTC or P2P', () => {
    const card = RIDER_CARDS.find(c => c.id === 'friday-peloton');
    expect(card).toBeDefined();
    const combined = (card!.heading + ' ' + card!.body).toLowerCase();
    expect(combined).toMatch(/webrtc|p2p|mesh/);
  });

  it('every card has a Scene function and valid sceneTitleId', () => {
    for (const card of RIDER_CARDS) {
      expect(typeof card.Scene).toBe('function');
      expect(card.sceneTitleId.trim().length).toBeGreaterThan(0);
    }
  });

  it('no card body contains first-person quote syntax (no fake testimonials)', () => {
    for (const card of RIDER_CARDS) {
      // Should not contain quoted speech that looks like a testimonial
      expect(card.body).not.toMatch(/^["""]/);
      expect(card.body).not.toMatch(/["""]\s*$/);
    }
  });
});
