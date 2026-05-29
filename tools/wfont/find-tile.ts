#!/usr/bin/env -S pnpm tsx
/**
 * find-tile — search wfonts for a glyph matching an 8×8 pixel pattern.
 *
 * Usage:
 *   pnpm tsx tools/wfont/find-tile.ts --pattern '00000000;88888888;...'
 *
 * Pattern syntax: 8 rows separated by ';', each row 8 hex chars (0..f).
 * '?' = wildcard, matches any palette index.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGlyph, encodePattern, gridMatchesPattern } from './glyph-decode.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const FONTS_DIR = join(REPO_ROOT, 'extracted', 'fonts');
const FONT_NAMES = ['wfont0', 'wfont1', 'wfont2', 'wfont3', 'wfont4'];

export interface Match {
  font: string;
  char: number;
}

export function searchForPattern(
  fonts: Record<string, { glyphs: number[][] }>,
  patternStr: string,
): Match[] {
  const pattern = encodePattern(patternStr);
  const matches: Match[] = [];
  for (const [name, font] of Object.entries(fonts)) {
    for (let code = 0; code < font.glyphs.length; code++) {
      const bytes = font.glyphs[code];
      if (!bytes || bytes.length !== 32) continue;
      const grid = decodeGlyph(bytes);
      if (gridMatchesPattern(grid, pattern)) {
        matches.push({ font: name, char: code });
      }
    }
  }
  return matches;
}

function loadAllFonts(): Record<string, { glyphs: number[][] }> {
  const out: Record<string, { glyphs: number[][] }> = {};
  for (const name of FONT_NAMES) {
    const path = join(FONTS_DIR, `${name}.json`);
    if (existsSync(path)) {
      out[name] = JSON.parse(readFileSync(path, 'utf-8'));
    }
  }
  return out;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const patternIdx = args.indexOf('--pattern');
  if (patternIdx < 0 || patternIdx + 1 >= args.length) {
    console.error('usage: pnpm tsx tools/wfont/find-tile.ts --pattern \'<8x8 grid>\'');
    console.error('example: --pattern \'00000000;88888888;88888888;88888888;88888888;88888888;88888888;00000000\'');
    process.exit(1);
  }
  const matches = searchForPattern(loadAllFonts(), args[patternIdx + 1]!);
  if (matches.length === 0) {
    console.log('no matches');
  } else {
    for (const m of matches) {
      console.log(`${m.font} char 0x${m.char.toString(16).padStart(2, '0')} (${m.char})`);
    }
  }
}
