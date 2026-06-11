import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { composeOptionsStrip } from '../../src/pages/game/compose-options-strip.js';
import { OPTIONS_STRIP, OPTIONS_COMMANDS } from '@wiz6/data';

const here = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(here, '../../../../tools/parity/fixtures/engine');
const SCREEN_W = 320;

function loadStrip(name: string): Uint8Array {
  const full = new Uint8Array(gunzipSync(readFileSync(resolve(FIX, `options-menu-${name}.idx.gz`))));
  const { x, y, w, h } = OPTIONS_STRIP;
  const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * SCREEN_W + (x + c)]!;
  return out;
}
function diff(a: Uint8Array, b: Uint8Array): { n: number; first: string } {
  let n = 0, first = 'none';
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { n++; if (first === 'none') first = `idx ${i} (x${i % OPTIONS_STRIP.w},y${Math.floor(i / OPTIONS_STRIP.w)}): ours=${a[i]} eng=${b[i]}`; }
  return { n, first };
}

describe('options strip parity', () => {
  it.each(OPTIONS_COMMANDS.map((cmd, i) => ({ cmd, i })))('renders cursor-on-$cmd byte-exact', ({ cmd, i }) => {
    const ours = composeOptionsStrip(i);
    const eng = loadStrip(cmd);
    expect(ours.length).toBe(eng.length);
    const d = diff(ours, eng);
    expect(d.n, `${cmd}: ${d.n}/${ours.length} px differ; first ${d.first}`).toBe(0);
  });
});
