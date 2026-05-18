/**
 * Unit tests for AI workout JSON validation and repair.
 * Pure — no network, no React, no stores.
 */

import { describe, it, expect } from 'vitest';
import { extractJSON, validateAndRepairWorkout } from '@/lib/ai/validate';

// ---------------------------------------------------------------------------
// extractJSON
// ---------------------------------------------------------------------------

describe('extractJSON', () => {
  it('strips markdown code fences', () => {
    const raw = '```json\n{"name":"Test"}\n```';
    expect(extractJSON(raw)).toBe('{"name":"Test"}');
  });

  it('strips plain code fences', () => {
    const raw = '```\n{"name":"Test"}\n```';
    expect(extractJSON(raw)).toBe('{"name":"Test"}');
  });

  it('extracts first {} block from surrounding text', () => {
    const raw = 'Here is the workout:\n{"name":"Test","segments":[]}  \n\nDone.';
    const out = extractJSON(raw);
    expect(out).toContain('"name":"Test"');
  });

  it('returns the string unchanged when no fences and no braces context needed', () => {
    const raw = '{"name":"Test"}';
    expect(extractJSON(raw)).toBe('{"name":"Test"}');
  });
});

// ---------------------------------------------------------------------------
// Helpers to build valid workout JSON
// ---------------------------------------------------------------------------

function minimalWorkout(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: 'Sweet Spot 45',
    description: 'Classic sweet spot effort',
    segments: [
      { kind: 'warmup', durationSec: 600, target: { type: 'rampPct', startPct: 0.5, endPct: 0.75 }, label: '10 min warm-up' },
      { kind: 'steady', durationSec: 1800, target: { type: 'ftpPct', value: 0.88 }, label: '30 min @ 88% FTP' },
      { kind: 'cooldown', durationSec: 300, target: { type: 'ftpPct', value: 0.5 }, label: '5 min cool-down' },
    ],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('validateAndRepairWorkout — happy path', () => {
  it('accepts a well-formed workout', () => {
    const result = validateAndRepairWorkout(minimalWorkout());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workout.name).toBe('Sweet Spot 45');
    expect(result.workout.segments).toHaveLength(3);
    expect(result.workout.source).toBe('ai');
    expect(result.workout.id).toBeTruthy();
    expect(result.workout.createdAt).toBeGreaterThan(0);
  });

  it('preserves ftpPct values that are already fractions', () => {
    const result = validateAndRepairWorkout(minimalWorkout());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const steady = result.workout.segments[1];
    expect(steady.target.type).toBe('ftpPct');
    if (steady.target.type === 'ftpPct') {
      expect(steady.target.value).toBeCloseTo(0.88);
    }
  });

  it('assigns ids to segments that are missing them', () => {
    const result = validateAndRepairWorkout(minimalWorkout());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const seg of result.workout.segments) {
      expect(typeof seg.id).toBe('string');
      expect(seg.id.length).toBeGreaterThan(0);
    }
  });

  it('preserves existing segment ids', () => {
    const data = JSON.parse(minimalWorkout());
    data.segments[0].id = 'my-custom-id';
    const result = validateAndRepairWorkout(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workout.segments[0].id).toBe('my-custom-id');
  });
});

// ---------------------------------------------------------------------------
// % FTP repair (whole percentage → fraction)
// ---------------------------------------------------------------------------

describe('validateAndRepairWorkout — ftpPct repair', () => {
  it('divides whole-percentage values by 100', () => {
    const data = {
      name: 'Threshold',
      segments: [
        { kind: 'interval', durationSec: 1200, target: { type: 'ftpPct', value: 95 } },
      ],
    };
    const result = validateAndRepairWorkout(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tgt = result.workout.segments[0].target;
    if (tgt.type === 'ftpPct') {
      expect(tgt.value).toBeCloseTo(0.95);
    }
  });

  it('does not alter already-fractional values', () => {
    const data = {
      name: 'Z2',
      segments: [
        { kind: 'steady', durationSec: 3600, target: { type: 'ftpPct', value: 0.65 } },
      ],
    };
    const result = validateAndRepairWorkout(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tgt = result.workout.segments[0].target;
    if (tgt.type === 'ftpPct') {
      expect(tgt.value).toBeCloseTo(0.65);
    }
  });
});

// ---------------------------------------------------------------------------
// Duration repair (minutes → seconds)
// ---------------------------------------------------------------------------

describe('validateAndRepairWorkout — duration repair', () => {
  it('converts minutes to seconds when all durations look like minutes (≤ 120)', () => {
    const data = {
      name: 'Intervals',
      segments: [
        { kind: 'warmup', durationSec: 10, target: { type: 'ftpPct', value: 0.5 } },
        { kind: 'interval', durationSec: 5, target: { type: 'ftpPct', value: 1.05 } },
        { kind: 'cooldown', durationSec: 5, target: { type: 'ftpPct', value: 0.5 } },
      ],
    };
    const result = validateAndRepairWorkout(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workout.segments[0].durationSec).toBe(600);
    expect(result.workout.segments[1].durationSec).toBe(300);
    expect(result.workout.segments[2].durationSec).toBe(300);
  });

  it('keeps durations in seconds when max > 120', () => {
    const data = {
      name: 'Long Ride',
      segments: [
        { kind: 'steady', durationSec: 3600, target: { type: 'ftpPct', value: 0.65 } },
      ],
    };
    const result = validateAndRepairWorkout(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workout.segments[0].durationSec).toBe(3600);
  });
});

// ---------------------------------------------------------------------------
// rampPct alternate key names
// ---------------------------------------------------------------------------

describe('validateAndRepairWorkout — rampPct repair', () => {
  it('handles start/end keys instead of startPct/endPct', () => {
    const data = {
      name: 'Ramp Test',
      segments: [
        { kind: 'ramp', durationSec: 600, target: { type: 'rampPct', start: 0.5, end: 1.0 } },
      ],
    };
    const result = validateAndRepairWorkout(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tgt = result.workout.segments[0].target;
    expect(tgt.type).toBe('rampPct');
    if (tgt.type === 'rampPct') {
      expect(tgt.startPct).toBeCloseTo(0.5);
      expect(tgt.endPct).toBeCloseTo(1.0);
    }
  });

  it('repairs rampPct percentages (e.g. start:50, end:100)', () => {
    const data = {
      name: 'Ramp',
      segments: [
        { kind: 'ramp', durationSec: 600, target: { type: 'rampPct', startPct: 50, endPct: 100 } },
      ],
    };
    const result = validateAndRepairWorkout(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tgt = result.workout.segments[0].target;
    if (tgt.type === 'rampPct') {
      expect(tgt.startPct).toBeCloseTo(0.5);
      expect(tgt.endPct).toBeCloseTo(1.0);
    }
  });
});

// ---------------------------------------------------------------------------
// Wrapper key unwrapping
// ---------------------------------------------------------------------------

describe('validateAndRepairWorkout — wrapper key unwrap', () => {
  it('unwraps { "workout": { ... } }', () => {
    const inner = JSON.parse(minimalWorkout());
    const wrapped = JSON.stringify({ workout: inner });
    const result = validateAndRepairWorkout(wrapped);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workout.name).toBe('Sweet Spot 45');
  });

  it('unwraps { "result": { ... } }', () => {
    const inner = JSON.parse(minimalWorkout());
    const wrapped = JSON.stringify({ result: inner });
    const result = validateAndRepairWorkout(wrapped);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workout.name).toBe('Sweet Spot 45');
  });
});

// ---------------------------------------------------------------------------
// Missing / invalid fields
// ---------------------------------------------------------------------------

describe('validateAndRepairWorkout — missing fields', () => {
  it('fills in a default name when missing', () => {
    const data = {
      segments: [
        { kind: 'steady', durationSec: 1800, target: { type: 'ftpPct', value: 0.75 } },
      ],
    };
    const result = validateAndRepairWorkout(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workout.name).toBe('AI Workout');
  });

  it('returns error for completely invalid JSON', () => {
    const result = validateAndRepairWorkout('this is not json at all }{');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => /parse/i.test(e))).toBe(true);
  });

  it('returns error when segments array is empty', () => {
    const result = validateAndRepairWorkout(JSON.stringify({ name: 'Empty', segments: [] }));
    expect(result.ok).toBe(false);
  });

  it('falls back to ftpPct:0.6 for unknown target types', () => {
    const data = {
      name: 'Weird',
      segments: [
        { kind: 'steady', durationSec: 600, target: { type: 'turbo_boost', power: 300 } },
      ],
    };
    const result = validateAndRepairWorkout(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tgt = result.workout.segments[0].target;
    expect(tgt.type).toBe('ftpPct');
  });

  it('infers ftpPct type from target with a value field but missing type', () => {
    const data = {
      name: 'Inferred',
      segments: [
        { kind: 'steady', durationSec: 600, target: { value: 0.8 } },
      ],
    };
    const result = validateAndRepairWorkout(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workout.segments[0].target.type).toBe('ftpPct');
  });
});

// ---------------------------------------------------------------------------
// Markdown-fenced output
// ---------------------------------------------------------------------------

describe('validateAndRepairWorkout — markdown fences', () => {
  it('parses JSON wrapped in ```json fences', () => {
    const inner = minimalWorkout();
    const fenced = `Here is your workout:\n\`\`\`json\n${inner}\n\`\`\`\nEnjoy!`;
    const result = validateAndRepairWorkout(fenced);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workout.name).toBe('Sweet Spot 45');
  });
});

// ---------------------------------------------------------------------------
// Watts target
// ---------------------------------------------------------------------------

describe('validateAndRepairWorkout — watts target', () => {
  it('preserves absolute watt values', () => {
    const data = {
      name: 'Watt-based',
      segments: [
        { kind: 'interval', durationSec: 300, target: { type: 'watts', watts: 280 } },
      ],
    };
    const result = validateAndRepairWorkout(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tgt = result.workout.segments[0].target;
    if (tgt.type === 'watts') {
      expect(tgt.watts).toBe(280);
    }
  });
});
