/**
 * gen-fixture-libretro.ts — Generate committed parity fixtures from the LIVE
 * dosbox-pure harness (replacing gen-fixture.ts's DOSBox-X save-state path).
 *
 * The harness hands us post-palette RGBA; the committed fixture format is a
 * gzipped 4-bit palette-INDEX array. Stage 2 proved dosbox-pure renders the
 * exact WIZ6_MAIN 16-colour output, so RGB->index is a lossless 16-entry inverse
 * lookup. We verify that (every pixel maps to a palette entry) + round-trip
 * (indicesToRgba(idx) === captured RGBA) on every generation.
 *
 * Usage:
 *   pnpm tsx tools/parity/gen-fixture-libretro.ts --name <fix> [--boot 3000] \
 *      [--keys enter,down,enter] [--settle 1200]
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { COMPOSED_PALETTE, indicesToRgba, SCREEN_WIDTH, SCREEN_HEIGHT } from './decode-screen.js';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, 'fixtures', 'engine');
const TMP = '/tmp/wiz6-libretro';

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

// RGB -> palette index (exact match against the 16 composed-palette entries).
const rgbToIdx = new Map<number, number>();
COMPOSED_PALETTE.forEach(([r, g, b], i) => rgbToIdx.set((r << 16) | (g << 8) | b, i));

function rgbaToIndices(rgba: Uint8Array): Uint8Array {
  const idx = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
  for (let p = 0; p < idx.length; p++) {
    const key = (rgba[p * 4]! << 16) | (rgba[p * 4 + 1]! << 8) | rgba[p * 4 + 2]!;
    const i = rgbToIdx.get(key);
    if (i === undefined) {
      throw new Error(`pixel ${p} colour #${key.toString(16)} not in WIZ6_MAIN palette ` +
        `(framebuffer is not the expected 16-colour output — divergence?)`);
    }
    idx[p] = i;
  }
  return idx;
}

async function main() {
  const name = arg('name');
  if (!name) throw new Error('--name required');
  const boot = parseInt(arg('boot', '3000')!, 10);
  const settle = parseInt(arg('settle', '0')!, 10);
  const keys = (arg('keys') ?? '').split(',').map((k) => k.trim()).filter(Boolean);

  mkdirSync(TMP, { recursive: true });
  mkdirSync(FIXTURES_DIR, { recursive: true });
  const h = new HostClient();
  await h.step(boot);
  for (const k of keys) { await h.key(k, 'tap'); await h.step(400); }
  if (settle) await h.step(settle);
  const { w, hgt } = await h.fb(`${TMP}/genfix.rgba`).then((r) => ({ w: r.w, hgt: r.h }));
  h.close();
  if (w !== SCREEN_WIDTH || hgt !== SCREEN_HEIGHT) {
    throw new Error(`frame ${w}x${hgt} != ${SCREEN_WIDTH}x${SCREEN_HEIGHT}`);
  }

  const rgba = new Uint8Array(readFileSync(`${TMP}/genfix.rgba`));
  const idx = rgbaToIndices(rgba);

  // round-trip self-check: decoding the indices must reproduce the captured RGBA.
  const back = indicesToRgba(idx);
  let diff = 0;
  for (let i = 0; i < rgba.length; i++) if (rgba[i] !== back[i]) diff++;
  if (diff) throw new Error(`round-trip mismatch: ${diff} bytes`);

  writeFileSync(join(FIXTURES_DIR, `${name}.idx.gz`), gzipSync(idx));
  writeFileSync(join(FIXTURES_DIR, `${name}.png`), encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
  console.log(`wrote ${name}.idx.gz + .png (palette-clean, round-trip exact)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
