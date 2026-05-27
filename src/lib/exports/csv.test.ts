import { describe, it, expect } from 'vitest';
import { encodeCsv } from '@/lib/exports/csv';

describe('encodeCsv', () => {
  it('returns empty string for empty input', () => {
    expect(encodeCsv([])).toBe('');
  });

  it('encodes a single row with header', () => {
    const result = encodeCsv([{ name: 'Alice', age: 30 }]);
    const lines = result.split('\r\n');
    expect(lines[0]).toBe('name,age');
    expect(lines[1]).toBe('Alice,30');
  });

  it('uses CRLF line endings (RFC-4180)', () => {
    const result = encodeCsv([{ a: 1 }, { a: 2 }]);
    expect(result).toContain('\r\n');
  });

  it('quotes fields containing commas', () => {
    const result = encodeCsv([{ city: 'London, UK' }]);
    expect(result).toContain('"London, UK"');
  });

  it('quotes fields containing double-quotes and escapes them', () => {
    const result = encodeCsv([{ note: 'He said "hello"' }]);
    expect(result).toContain('"He said ""hello"""');
  });

  it('quotes fields containing newlines', () => {
    const result = encodeCsv([{ text: 'line1\nline2' }]);
    expect(result).toContain('"line1\nline2"');
  });

  it('produces empty cell for null value', () => {
    const result = encodeCsv([{ a: null, b: 'x' }]);
    const dataLine = result.split('\r\n')[1];
    expect(dataLine).toBe(',x');
  });

  it('produces empty cell for undefined value', () => {
    const result = encodeCsv([{ a: undefined, b: 'x' }]);
    const dataLine = result.split('\r\n')[1];
    expect(dataLine).toBe(',x');
  });

  it('guards against CSV injection for = prefix', () => {
    const result = encodeCsv([{ formula: '=SUM(A1:A10)' }]);
    const dataLine = result.split('\r\n')[1];
    expect(dataLine).toContain("'=SUM(A1:A10)");
  });

  it('guards against CSV injection for + prefix', () => {
    const result = encodeCsv([{ v: '+cmd|calc' }]);
    const dataLine = result.split('\r\n')[1];
    expect(dataLine).toContain("'+cmd|calc");
  });

  it('guards against CSV injection for - prefix', () => {
    const result = encodeCsv([{ v: '-2+3' }]);
    const dataLine = result.split('\r\n')[1];
    expect(dataLine).toContain("'-2+3");
  });

  it('guards against CSV injection for @ prefix', () => {
    const result = encodeCsv([{ v: '@SUM(1)' }]);
    const dataLine = result.split('\r\n')[1];
    expect(dataLine).toContain("'@SUM(1)");
  });

  it('does not inject prefix for safe strings', () => {
    const result = encodeCsv([{ v: 'hello world' }]);
    expect(result).not.toContain("'hello");
  });

  it('preserves column order from first row keys', () => {
    const result = encodeCsv([{ z: 1, a: 2, m: 3 }]);
    const header = result.split('\r\n')[0];
    expect(header).toBe('z,a,m');
  });

  it('handles multiple rows correctly', () => {
    const rows = [
      { name: 'Alice', score: 95 },
      { name: 'Bob',   score: 87 },
      { name: 'Carol', score: 100 },
    ];
    const result = encodeCsv(rows);
    const lines = result.split('\r\n');
    expect(lines).toHaveLength(4); // header + 3 rows
    expect(lines[2]).toBe('Bob,87');
  });

  it('uses empty string for missing key in subsequent rows', () => {
    const rows = [
      { a: 1, b: 2 },
      { a: 3 } as Record<string, unknown>, // b is missing
    ];
    const result = encodeCsv(rows);
    const dataLine = result.split('\r\n')[2];
    expect(dataLine).toBe('3,');
  });
});
