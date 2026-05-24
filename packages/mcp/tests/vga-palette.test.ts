import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  findDacOffset,
  parseVgaPaletteFromBlob,
  parseVgaPaletteFromSave,
  readVgaBlob,
} from '../src/vga-palette.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SAVE_STATE = join(REPO_ROOT, 'tools', 'dosbox', 'save', '1.sav');
const haveSave = existsSync(SAVE_STATE);

describe('vga-palette — signature DAC detection', () => {
  it('findDacOffset returns -1 on an empty / non-DAC blob', () => {
    expect(findDacOffset(new Uint8Array(1024))).toBe(-1);
  });

  it('parseVgaPaletteFromBlob returns null when no DAC is present', () => {
    expect(parseVgaPaletteFromBlob(new Uint8Array(1024))).toBeNull();
  });

  it('finds a synthetic DAC behind a non-zero guard region', () => {
    // Build a 768-byte DAC with EGA-default first 16 entries. Surround it
    // with bytes > 0x3F so the signature scan can't false-positive on the
    // wrapper's zero-init region (any leading run of zeros could "look like"
    // entry 0 of a candidate DAC starting one byte earlier).
    const ega: Array<[number, number, number]> = [
      [0, 0, 0], [0, 0, 42], [0, 42, 0], [0, 42, 42],
      [42, 0, 0], [42, 0, 42], [42, 21, 0], [42, 42, 42],
      [21, 21, 21], [21, 21, 63], [21, 63, 21], [21, 63, 63],
      [63, 21, 21], [63, 21, 63], [63, 63, 21], [63, 63, 63],
    ];
    const wrapper = new Uint8Array(2000).fill(0xff);
    for (let i = 0; i < 16; i++) {
      wrapper[800 + i * 3] = ega[i]![0];
      wrapper[800 + i * 3 + 1] = ega[i]![1];
      wrapper[800 + i * 3 + 2] = ega[i]![2];
    }
    for (let i = 48; i < 768; i++) wrapper[800 + i] = (i * 7) & 0x3f;
    const offset = findDacOffset(wrapper);
    expect(offset).toBe(800);
  });
});

describe.skipIf(!haveSave)('vga-palette — against tools/dosbox/save/1.sav', () => {
  it('extracts a 256-entry DAC', () => {
    const state = parseVgaPaletteFromSave(SAVE_STATE);
    expect(state).not.toBeNull();
    expect(state?.dac).toHaveLength(256);
    // Sample first 16 entries: at boot (game_state=0), the DAC should hold
    // the BIOS default EGA-compatible palette.
    // Entry 0 = black, 15 = white, 4 = red (42,0,0 in 6-bit).
    const e0 = state!.dac[0]!;
    const e15 = state!.dac[15]!;
    const e4 = state!.dac[4]!;
    expect(e0).toEqual([0, 0, 0]);
    expect(e15).toEqual([63, 63, 63]);
    expect(e4).toEqual([42, 0, 0]);
  });

  it('preserves the standard VGA pattern where entries 16-31 mirror 0-15 high-intensity variants', () => {
    // The 256-entry DAC default has the EGA 16 colors in entries 0-15, then
    // entries 16-23 = the high-intensity half of that set (gray, light blue,
    // ..., white). This is a stable VGA boot-time pattern and a useful
    // sanity check that the DAC was located correctly.
    const state = parseVgaPaletteFromSave(SAVE_STATE);
    expect(state).not.toBeNull();
    // Entry 16 should be the same as entry 8 (gray).
    expect(state!.dac[16]).toEqual(state!.dac[8]);
    // Entry 23 should be the same as entry 15 (white).
    expect(state!.dac[23]).toEqual(state!.dac[15]);
  });

  it('reads the Vga blob without exploding', () => {
    const blob = readVgaBlob(SAVE_STATE);
    expect(blob.length).toBeGreaterThan(100_000);
  });
});
