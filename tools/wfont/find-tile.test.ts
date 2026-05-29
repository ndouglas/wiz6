import { describe, expect, it } from 'vitest';
import { searchForPattern } from './find-tile.js';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function loadFont(name: string) {
  const path = join(REPO_ROOT, 'extracted', 'fonts', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('searchForPattern', () => {
  it('finds wfont3 char 0x5f for the underscore-bar pattern', () => {
    const fonts = { wfont3: loadFont('wfont3') };
    const matches = searchForPattern(
      fonts,
      '00000000;88888888;88888888;88888888;88888888;88888888;88888888;00000000',
    );
    expect(matches).toContainEqual({ font: 'wfont3', char: 0x5f });
  });

  it('wildcards match any value', () => {
    const fonts = { wfont3: loadFont('wfont3') };
    // Pattern that matches ANY glyph (all wildcards)
    const matches = searchForPattern(
      fonts,
      '????????;????????;????????;????????;????????;????????;????????;????????',
    );
    expect(matches.length).toBeGreaterThan(50);
  });

  it('returns empty when no glyph matches', () => {
    const fonts = { wfont3: loadFont('wfont3') };
    // Pattern of all 0xf — unlikely to match any actual glyph
    const matches = searchForPattern(
      fonts,
      'ffffffff;ffffffff;ffffffff;ffffffff;ffffffff;ffffffff;ffffffff;ffffffff',
    );
    expect(matches).toEqual([]);
  });
});
