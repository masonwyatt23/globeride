import { describe, it, expect } from 'vitest';
import { cn, clamp, lerp, formatDuration, formatDistance, msToKmh, haversine, shortId } from '@/lib/utils';

describe('clamp', () => {
  it('returns value when inside range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('clamps when min === max', () => {
    expect(clamp(7, 5, 5)).toBe(5);
  });
});

describe('lerp', () => {
  it('returns a at t=0', () => {
    expect(lerp(0, 100, 0)).toBe(0);
  });

  it('returns b at t=1', () => {
    expect(lerp(0, 100, 1)).toBe(100);
  });

  it('returns midpoint at t=0.5', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  it('extrapolates when t > 1', () => {
    expect(lerp(0, 10, 2)).toBe(20);
  });
});

describe('formatDuration', () => {
  it('formats 0 as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('formats 90 seconds as 1:30', () => {
    expect(formatDuration(90)).toBe('1:30');
  });

  it('formats 3661 seconds as 1:01:01', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('clamps negative to 0:00', () => {
    expect(formatDuration(-10)).toBe('0:00');
  });

  it('pads single-digit minutes and seconds', () => {
    expect(formatDuration(65)).toBe('1:05');
  });
});

describe('formatDistance', () => {
  it('formats short distances in meters', () => {
    const result = formatDistance(500);
    expect(result).toContain('500');
  });

  it('formats long distances in km', () => {
    const result = formatDistance(5000);
    expect(result).toMatch(/5(\.\d+)?\s*km/);
  });
});

describe('msToKmh', () => {
  it('converts 0 m/s to 0 km/h', () => {
    expect(msToKmh(0)).toBe(0);
  });

  it('converts 10 m/s to 36 km/h', () => {
    expect(msToKmh(10)).toBe(36);
  });
});

describe('haversine', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversine(51.5, 0, 51.5, 0)).toBe(0);
  });

  it('computes roughly correct distance for known pairs', () => {
    // London (51.5074, -0.1278) to Paris (48.8566, 2.3522) ≈ 341–344 km
    const dist = haversine(51.5074, -0.1278, 48.8566, 2.3522);
    expect(dist).toBeGreaterThan(340_000);
    expect(dist).toBeLessThan(345_000);
  });

  it('is symmetric', () => {
    const a = haversine(10, 20, 30, 40);
    const b = haversine(30, 40, 10, 20);
    expect(a).toBeCloseTo(b, 0);
  });
});

describe('shortId', () => {
  it('returns a non-empty string', () => {
    expect(typeof shortId()).toBe('string');
    expect(shortId().length).toBeGreaterThan(0);
  });

  it('returns distinct values on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, shortId));
    expect(ids.size).toBeGreaterThan(15);
  });
});

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('deduplicates conflicting Tailwind classes (last wins)', () => {
    // twMerge ensures p-2 beats p-4 when p-4 comes last
    const result = cn('p-2', 'p-4');
    expect(result).toBe('p-4');
    expect(result).not.toContain('p-2');
  });

  it('handles undefined and falsy values', () => {
    expect(cn('foo', undefined, false, 'bar')).toBe('foo bar');
  });
});
