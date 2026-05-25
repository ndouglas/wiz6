import type { RgbTuple } from '../schemas/palette.js';
import { VGA_DEFAULT_DAC } from './vga-default-dac.js';

/**
 * Apply an EGA Attribute Controller palette over the VGA DAC to produce
 * the 16 final RGB triples that the framebuffer's 4-bit color attributes
 * (0..15) actually display as.
 *
 * Wizardry VI's two engine palettes — wiz6-main (wroot file 0x2043) and
 * wiz6-dungeon (wroot file 0x2054) — are 16-byte AC tables, NOT direct
 * RGB triples. They were originally shipped as RGB by 6-bit-expanding each
 * AC byte, which is a category error: an AC byte is a DAC index, not a
 * color descriptor. The fix is to chain AC[i] -> DAC[AC[i]].
 *
 * See docs/re/findings/menu-cursor-render-path.json and
 * docs/re/findings/state4-runtime-palette.json for the full RE story.
 */
export function applyAcPalette(
  ac: readonly number[],
  dac: readonly RgbTuple[] = VGA_DEFAULT_DAC,
): RgbTuple[] {
  if (ac.length !== 16) {
    throw new Error(`AC palette must have 16 entries, got ${ac.length}`);
  }
  return ac.map((idx) => {
    const rgb = dac[idx];
    if (!rgb) {
      throw new Error(`AC byte 0x${idx.toString(16)} indexes outside DAC (length ${dac.length})`);
    }
    return [rgb[0], rgb[1], rgb[2]];
  });
}
