/**
 * gen-fixture.ts — Generate committed parity fixtures from DOSBox-X save states.
 *
 * Decodes a DOSBox-X save state to:
 *   1. `tools/parity/fixtures/engine/<name>.idx.gz`  — gzipped EGA index array
 *      (320×200 = 64000 bytes, each byte is a 4-bit palette index 0–15).
 *      Palette-independent. Compresses to ~1–3 KB (mostly 0/8).
 *   2. `tools/parity/fixtures/engine/<name>.png`     — PNG for human viewing/diff.
 *      (~5–10 KB).
 *
 * Once generated, these fixtures are committed. Tests load the .idx.gz, apply
 * the wiz6-main AC→DAC palette, and compare against our renderer. No .sav file
 * is needed at test time.
 *
 * Usage:
 *   pnpm tsx tools/parity/gen-fixture.ts --save <path|N> --name <fixture-name>
 *
 * Examples:
 *   pnpm tsx tools/parity/gen-fixture.ts --save 2 --name character-menu-empty
 *   pnpm tsx tools/parity/gen-fixture.ts --save 1 --name character-menu-partial
 *   pnpm tsx tools/parity/gen-fixture.ts --save 3 --name character-menu-full
 *
 * Fixtures are written to tools/parity/fixtures/engine/ relative to the repo root.
 * Run from the repo root (or any subdirectory — paths are resolved from __dirname).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { readVgaBlob } from '../../packages/mcp/src/vga-palette.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import {
  decodeVgaIndices,
  indicesToRgba,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
} from './decode-screen.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, 'fixtures', 'engine');

// ─── Resolve save path ────────────────────────────────────────────────────────

function resolveSavePath(arg: string): string {
  if (/^\d+$/.test(arg)) {
    return resolve(__dirname, '..', 'dosbox', 'save', `${arg}.sav`);
  }
  return resolve(arg);
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const saveArgIdx = args.indexOf('--save');
const nameArgIdx = args.indexOf('--name');

if (saveArgIdx < 0 || saveArgIdx + 1 >= args.length || nameArgIdx < 0 || nameArgIdx + 1 >= args.length) {
  console.error('usage: pnpm tsx tools/parity/gen-fixture.ts --save <path|N> --name <fixture-name>');
  console.error('');
  console.error('examples:');
  console.error('  pnpm tsx tools/parity/gen-fixture.ts --save 2 --name character-menu-empty');
  console.error('  pnpm tsx tools/parity/gen-fixture.ts --save 1 --name character-menu-partial');
  console.error('  pnpm tsx tools/parity/gen-fixture.ts --save 3 --name character-menu-full');
  process.exit(1);
}

const savePath = resolveSavePath(args[saveArgIdx + 1]!);
const fixtureName = args[nameArgIdx + 1]!;

// ─── Decode ───────────────────────────────────────────────────────────────────

console.log(`Reading save: ${savePath}`);
const blob = readVgaBlob(savePath);
const indices = decodeVgaIndices(blob);
const rgba = indicesToRgba(indices);

// ─── Write fixtures ───────────────────────────────────────────────────────────

mkdirSync(FIXTURES_DIR, { recursive: true });

// 1. Gzipped index array
const idxGzPath = join(FIXTURES_DIR, `${fixtureName}.idx.gz`);
const compressed = gzipSync(indices);
writeFileSync(idxGzPath, compressed);

// 2. PNG for human viewing
const pngPath = join(FIXTURES_DIR, `${fixtureName}.png`);
const png = encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba);
writeFileSync(pngPath, png);

// ─── Report ───────────────────────────────────────────────────────────────────

console.log(`Fixture "${fixtureName}" generated:`);
console.log(`  idx.gz: ${idxGzPath}  (${compressed.length} bytes)`);
console.log(`  png:    ${pngPath}  (${png.length} bytes)`);
console.log('');
console.log('Commit these files to lock in the engine ground truth:');
console.log(`  git add ${idxGzPath} ${pngPath}`);

// Sanity check: decompress and verify round-trip
import { gunzipSync } from 'node:zlib';
const recovered = gunzipSync(compressed);
let mismatch = 0;
for (let i = 0; i < indices.length; i++) {
  if (recovered[i] !== indices[i]) mismatch++;
}
if (mismatch > 0) {
  console.error(`ERROR: gzip round-trip failed — ${mismatch} bytes differ`);
  process.exit(1);
}
console.log(`Gzip round-trip: OK (${indices.length} bytes)`);
