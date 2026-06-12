import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs'; import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url'; import { dirname, resolve } from 'node:path';
import { composeReviewPicker } from '../../src/pages/game/compose-review-picker.js';
import { DOOR_WHO, REVIEW_STRIP } from '@wiz6/data';
const here = dirname(fileURLToPath(import.meta.url));
const FIX = resolve(here, '../../../../tools/parity/fixtures/engine');
const SLOTS = ['THESUS', 'LYSANDR', null, 'TEMPEST', null, null];
function loadStrip(name: string): Uint8Array {
  const full = new Uint8Array(gunzipSync(readFileSync(resolve(FIX, `${name}.idx.gz`))));
  const { x, y, w, h } = REVIEW_STRIP; const out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out[r * w + c] = full[(y + r) * 320 + (x + c)]!;
  return out;
}
describe('WHO WILL TRY? door picker parity', () => {
  it('renders exit cursor byte-exact', () => {
    const ours = composeReviewPicker(SLOTS, -1, DOOR_WHO);
    const eng = loadStrip('maze-door-who');
    let diff = 0, first = -1; for (let i = 0; i < ours.length; i++) if (ours[i] !== eng[i]) { diff++; if (first < 0) first = i; }
    expect(diff, `door-who: ${diff} px differ, first idx ${first} (x${first % REVIEW_STRIP.w},y${Math.floor(first / REVIEW_STRIP.w)})`).toBe(0);
  });
});
