import { describe, expect, it } from 'vitest';
import { formatTable } from '../../src/lib/format.js';

describe('formatTable', () => {
  it('renders a header row followed by rows, column-aligned', () => {
    const out = formatTable(
      ['name', 'class', 'level'],
      [
        ['RAT', '1', '5'],
        ['ZOMBIE', '2', '10'],
        ['PIT FIEND', '3', '12'],
      ],
    );
    const lines = out.split('\n');
    expect(lines[0]).toMatch(/name\s+class\s+level/);
    expect(lines.some((l) => /RAT\s+1\s+5/.test(l))).toBe(true);
    expect(lines.some((l) => /PIT FIEND\s+3\s+12/.test(l))).toBe(true);
  });

  it('handles empty rows', () => {
    const out = formatTable(['name'], []);
    expect(out).toMatch(/name/);
  });

  it('left-pads numeric columns to right-align', () => {
    const out = formatTable(
      ['n'],
      [['1'], ['10'], ['100']],
      { numeric: [true] },
    );
    const lines = out.split('\n').slice(1, 4);
    // Each line ends with the number; all should be the same length
    expect(lines[0]!.length).toBe(lines[1]!.length);
    expect(lines[1]!.length).toBe(lines[2]!.length);
  });
});
