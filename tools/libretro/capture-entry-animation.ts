/**
 * capture-entry-animation.ts — Stage 1 of the animated-entry port. Drives the
 * CANONICAL (uncracked test-fixtures) START-NEW-GAME entry and densely captures
 * the two viewport animations as commit-ready frames:
 *   - DOOR slide-apart: every frame for ~120 frames after the magicword submit
 *     (the post-magicword transition, gs=65535 → 5).
 *   - GATE (portcullis) open: every frame while crossing gy 120→121.
 * Saves /tmp/anim-<door|gate>-NNN.png (inspect) + .idx.gz (COMPOSED_PALETTE
 * indices, commit-ready full 320×200). Mouse parked off-screen so the cursor
 * sprite doesn't pollute frames. Select frames afterward, copy chosen .idx.gz to
 * tools/parity/fixtures/engine/newgame-anim-*.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { COMPOSED_PALETTE, SCREEN_WIDTH, SCREEN_HEIGHT } from '../parity/decode-screen.js';
import { readFileSync, writeFileSync, cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';

const GS = 0x363a, GYO = 0x4fa2;
function u16(b: Uint8Array, o: number) { return (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8); }
async function gy(c: HostClient) { return u16(await c.read((await c.anchor()) + GYO, 2), 0); }
async function gsv(c: HostClient) { return u16(await c.read((await c.anchor()) + GS, 2), 0); }

const rgbToIdx = new Map<number, number>();
COMPOSED_PALETTE.forEach(([r, g, b], i) => rgbToIdx.set((r << 16) | (g << 8) | b, i));
function rgbaToIndices(rgba: Uint8Array): Uint8Array {
  const idx = new Uint8Array(SCREEN_WIDTH * SCREEN_HEIGHT);
  for (let p = 0; p < idx.length; p++) {
    const i = rgbToIdx.get((rgba[p * 4]! << 16) | (rgba[p * 4 + 1]! << 8) | rgba[p * 4 + 2]!);
    idx[p] = i === undefined ? 0 : i;
  }
  return idx;
}
async function park(c: HostClient) { await c.mouse(-4000, -4000); await c.step(1); await c.mouse(-4000, -4000); await c.step(1); }
async function save(c: HostClient, tag: string) {
  const p = `/tmp/anim-${tag}.rgba`; await c.fb(p);
  const rgba = readFileSync(p);
  writeFileSync(`/tmp/anim-${tag}.png`, encodePngRgba(SCREEN_WIDTH, SCREEN_HEIGHT, rgba));
  writeFileSync(`/tmp/anim-${tag}.idx.gz`, gzipSync(rgbaToIndices(rgba)));
}

async function main() {
  // CRACKED image: the door-slide is a SUCCESS-path animation (the uncracked
  // lenient-fail path pre-opens the doors). je->jmp @ wbase 0x1192 = always-success,
  // so a single submit ENTER triggers the slide — matching the user's experience.
  const dir = mkdtempSync(join(tmpdir(), 'wiz6-cracked-'));
  cpSync('test-fixtures/original', dir, { recursive: true });
  const ovr = join(dir, 'wbase.ovr'); const b = readFileSync(ovr); b[0x1192] = 0xeb; writeFileSync(ovr, b);

  const c = new HostClient({ source: dir });
  try {
    await c.step(3000);
    await c.key('enter', 'tap'); await c.step(800);
    for (let i = 0; i < 6; i++) { await c.key('enter', 'tap'); await c.step(150); await c.key('enter', 'tap'); await c.step(150); for (let k = 0; k < 4; k++) await c.key('up', 'tap'); await c.step(80); }
    await c.key('down', 'tap'); await c.key('down', 'tap'); await c.step(120);
    await c.key('enter', 'tap'); await c.step(120);   // START NEW GAME → magicword prompt

    // DOOR window: submit the (cracked) magicword and capture EVERY frame from the
    // submit through the slide (the slide plays over the first ~25 frames — capture
    // densely so we can include the fully-closed + earliest-opening frames).
    await c.key('enter', 'tap');                       // submit empty → cracked success → DOOR SLIDE
    for (let f = 0; f < 60; f++) {
      await park(c);
      await save(c, `door-${String(f).padStart(3, '0')}-gs${await gsv(c)}-gy${await gy(c)}`);
      await c.step(1);
    }
    console.log(`door window done, gy=${await gy(c)} gs=${await gsv(c)}`);

    // Auto-push (cracked) reaches gy118 (FIRST gate) then gy120 (SECOND gate).
    // Capture EVERY frame while gy∈{118,120} (the gate-open dwells) with periodic
    // ENTER to keep the auto-push advancing. gate1 = gy118, gate2 = gy120.
    let n118 = 0, n120 = 0, lastEnter = 0;
    for (let f = 0; f < 3000; f++) {
      const g = await gy(c);
      if (g === 118 && n118 < 130) { await park(c); await save(c, `gate1-${String(n118).padStart(3, '0')}`); n118++; }
      else if (g === 120 && n120 < 130) { await park(c); await save(c, `gate2-${String(n120).padStart(3, '0')}`); n120++; }
      if (f - lastEnter >= 100) { await c.key('enter', 'tap'); lastEnter = f; }
      await c.step(1);
      if (g >= 121) break;
    }
    console.log(`gate windows done: gate1(gy118)=${n118} gate2(gy120)=${n120}, gy=${await gy(c)}`);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
