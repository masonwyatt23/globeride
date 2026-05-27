import { describe, it, expect } from 'vitest';
import {
  formatSpeed,
  formatPower,
  formatDurShort,
  formatDurMin,
  formatDurSec,
  formatSec,
  formatTimeShort,
  formatDate,
  formatDateShort,
} from '@/lib/format';

describe('formatSpeed', () => {
  it('converts 0 m/s to 0.0 km/h', () => {
    expect(formatSpeed(0)).toBe('0.0 km/h');
  });

  it('converts 10 m/s to 36.0 km/h', () => {
    expect(formatSpeed(10)).toBe('36.0 km/h');
  });

  it('rounds to one decimal', () => {
    expect(formatSpeed(5.555)).toBe('20.0 km/h');
  });
});

describe('formatPower', () => {
  it('formats positive watts', () => {
    expect(formatPower(250)).toBe('250 W');
  });

  it('returns em-dash for 0', () => {
    expect(formatPower(0)).toBe('—');
  });

  it('returns em-dash for negative', () => {
    expect(formatPower(-10)).toBe('—');
  });
});

describe('formatDurShort', () => {
  it('shows only seconds when < 60', () => {
    expect(formatDurShort(45)).toBe('45s');
  });

  it('shows only minutes when divisible', () => {
    expect(formatDurShort(120)).toBe('2m');
  });

  it('shows minutes and seconds', () => {
    expect(formatDurShort(270)).toBe('4m 30s');
  });

  it('handles 0', () => {
    expect(formatDurShort(0)).toBe('0s');
  });
});

describe('formatDurMin', () => {
  it('shows minutes only when < 1 hour', () => {
    expect(formatDurMin(2700)).toBe('45 min');
  });

  it('shows hours and minutes', () => {
    expect(formatDurMin(5400)).toBe('1h 30m');
  });

  it('handles 0', () => {
    expect(formatDurMin(0)).toBe('0 min');
  });
});

describe('formatDurSec', () => {
  it('shows minutes when no seconds remainder', () => {
    expect(formatDurSec(1800)).toBe('30m');
  });

  it('shows minutes and seconds', () => {
    expect(formatDurSec(1810)).toBe('30m 10s');
  });

  it('shows hours and minutes (ignores sub-minute)', () => {
    expect(formatDurSec(3690)).toBe('1h 1m');
  });
});

describe('formatSec', () => {
  it('formats 0 as 0:00', () => {
    expect(formatSec(0)).toBe('0:00');
  });

  it('formats 90 seconds as 1:30', () => {
    expect(formatSec(90)).toBe('1:30');
  });

  it('clamps negative values to 0:00', () => {
    expect(formatSec(-5)).toBe('0:00');
  });

  it('pads single-digit seconds', () => {
    expect(formatSec(65)).toBe('1:05');
  });
});

describe('formatTimeShort', () => {
  it('shows m:ss for < 1 hour', () => {
    expect(formatTimeShort(90)).toBe('1:30');
  });

  it('shows h:mm for >= 1 hour', () => {
    expect(formatTimeShort(3660)).toBe('1:01');
  });

  it('handles 0', () => {
    expect(formatTimeShort(0)).toBe('0:00');
  });
});

describe('formatDate', () => {
  it('returns em-dash for null', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('returns em-dash for 0', () => {
    expect(formatDate(0)).toBe('—');
  });

  it('returns em-dash for undefined', () => {
    expect(formatDate(undefined)).toBe('—');
  });

  it('returns a non-empty string for a valid timestamp', () => {
    const result = formatDate(Date.UTC(2025, 0, 15));
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('—');
  });
});

describe('formatDateShort', () => {
  it('returns a non-empty string for a valid timestamp', () => {
    const result = formatDateShort(Date.UTC(2025, 0, 15));
    expect(result.length).toBeGreaterThan(0);
  });
});
