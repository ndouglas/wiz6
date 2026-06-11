import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs'; import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url'; import { dirname, resolve } from 'node:path';
import { composeReviewPicker } from '../../src/pages/game/compose-review-picker.js';
import { REVIEW_STRIP } from '@wiz6/data';
const here = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(here, '../../../../tools/parity/fixtures/engine');
const SLOTS = ['THESUS', 'LYSANDR', null, 'TEMPEST', null, null];
function loadStrip(name: string): Uint8Array {
  const full = new Uint8Array(gunzipSync(readFileSync(resolve(FIX, `review-who-${name}.idx.gz`))));
  const { x, y, w, h } = REVIEW_STRIP; const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + (x + c)]!;
  return out;
}
const cases = [ { name: 'exit', cursor: -1 }, { name: 'm0', cursor: 0 }, { name: 'm1', cursor: 1 }, { name: 'm2', cursor: 3 } ];
describe('REVIEW WHO? picker parity', () => {
  it.each(cases)('renders $name byte-exact', ({ name, cursor }) => {
    const ours = composeReviewPicker(SLOTS, cursor);
    const eng = loadStrip(name);
    let diff = 0, first = -1; for (let i = 0; i < ours.length; i++) if (ours[i] !== eng[i]) { diff++; if (first < 0) first = i; }
    expect(diff, `${name}: ${diff} px differ, first idx ${first} (x${first % REVIEW_STRIP.w},y${Math.floor(first / REVIEW_STRIP.w)})`).toBe(0);
  });
});
