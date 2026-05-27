/**
 * Tests for src/lib/security/sanitize.ts
 * Mock-free, pure-function tests — no React, no browser APIs required.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeForLabel, sanitizeForFilename, isSafeUrl } from './sanitize';

// ---------------------------------------------------------------------------
// sanitizeForLabel
// ---------------------------------------------------------------------------

describe('sanitizeForLabel', () => {
  it('passes through a plain ASCII string unchanged', () => {
    expect(sanitizeForLabel('Alpe d\'Huez')).toBe("Alpe d'Huez");
  });

  it('strips null bytes', () => {
    expect(sanitizeForLabel('route\x00name')).toBe('route name');
  });

  it('strips newlines and tabs', () => {
    expect(sanitizeForLabel('route\nname\there')).toBe('route name here');
  });

  it('strips C1 control characters (0x80–0x9F)', () => {
    // \x85 is NEL (Next Line), a C1 control char
    expect(sanitizeForLabel('route\x85name')).toBe('route name');
  });

  it('collapses multiple whitespace to single space', () => {
    expect(sanitizeForLabel('a   b    c')).toBe('a b c');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeForLabel('  hello world  ')).toBe('hello world');
  });

  it('truncates to maxLen and appends ellipsis', () => {
    const long = 'A'.repeat(100);
    const result = sanitizeForLabel(long, 80);
    expect(result.length).toBe(80);
    expect(result.endsWith('…')).toBe(true);
  });

  it('does not truncate when string is exactly maxLen', () => {
    const exact = 'B'.repeat(80);
    expect(sanitizeForLabel(exact, 80)).toBe(exact);
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeForLabel('')).toBe('');
  });

  it('respects custom maxLen', () => {
    const result = sanitizeForLabel('Hello World', 5);
    expect(result.length).toBe(5);
    expect(result).toBe('Hell…');
  });
});

// ---------------------------------------------------------------------------
// sanitizeForFilename
// ---------------------------------------------------------------------------

describe('sanitizeForFilename', () => {
  it('passes through a safe filename unchanged', () => {
    expect(sanitizeForFilename('my-route-2024')).toBe('my-route-2024');
  });

  it('replaces forbidden filesystem characters with underscores', () => {
    expect(sanitizeForFilename('route/name\\here:now')).toBe('route_name_here_now');
  });

  it('replaces ? * " < > | with underscores', () => {
    expect(sanitizeForFilename('bad?file*name"here')).toBe('bad_file_name_here');
  });

  it('collapses consecutive underscores', () => {
    expect(sanitizeForFilename('a//b\\\\c')).toBe('a_b_c');
  });

  it('truncates to maxLen', () => {
    const long = 'x'.repeat(100);
    expect(sanitizeForFilename(long, 64).length).toBe(64);
  });

  it('returns "export" for empty input', () => {
    expect(sanitizeForFilename('')).toBe('export');
  });

  it('returns "export" when result after cleaning is empty', () => {
    // All illegal chars stripped → empty → fallback
    expect(sanitizeForFilename('//\\\\**')).toBe('export');
  });
});

// ---------------------------------------------------------------------------
// isSafeUrl
// ---------------------------------------------------------------------------

describe('isSafeUrl', () => {
  it('accepts a plain https URL', () => {
    expect(isSafeUrl('https://www.strava.com/oauth/authorize')).toBe(true);
  });

  it('accepts a plain http URL', () => {
    expect(isSafeUrl('http://localhost:5173')).toBe(true);
  });

  it('rejects javascript: protocol', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isSafeUrl('data:text/html,<h1>xss</h1>')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isSafeUrl('')).toBe(false);
  });

  it('rejects a URL containing control characters', () => {
    expect(isSafeUrl('https://example.com/\x00evil')).toBe(false);
  });

  it('rejects unparseable strings', () => {
    expect(isSafeUrl('not a url at all')).toBe(false);
  });
});
