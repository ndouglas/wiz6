import type { RgbTuple } from '../schemas/palette.js';

/**
 * VGA DAC default RGB table as programmed by BIOS when entering EGA mode 0Dh.
 *
 * The framebuffer in mode 0Dh stores a 4-bit color attribute (0..15) per
 * pixel. That attribute is mapped through the Attribute Controller (AC)
 * palette registers to a 6-bit DAC index, then through the DAC to a 6-bit
 * RGB triple, then expanded to 8-bit RGB for display. Wizardry VI re-
 * programs the AC palette (via INT 10h AX=1002h) at startup; the DAC stays
 * at this BIOS default in every save state we've captured.
 *
 * Entries 0..7 hold the "dim" 8 colors; entries 8..15 hold the "bright" 8
 * colors. Entries 16..23 are a verbatim duplicate of 8..15 (a quirk of how
 * the BIOS sets up VGA-emulating-EGA — see save-state DAC dumps via the
 * `dosbox_read_palette_registers` MCP tool). Entries 24..255 are zero in
 * the BIOS default and are never indexed by wiz6's AC palettes.
 *
 * Values here are the 8-bit RGB expansion of the 6-bit DAC values via
 * `v8 = (v6 << 2) | (v6 >> 4)`.
 *
 * Provenance: dumped from save-state Vga blob via `mcp__wiz6__dosbox_read_palette_registers`,
 * cross-checked against the IBM EGA/VGA BIOS palette spec.
 */
export const VGA_DEFAULT_DAC: readonly RgbTuple[] = [
  // 0..7 — dim 8 colors (CGA-compatible low-intensity palette)
  [0, 0, 0],
  [0, 0, 170],
  [0, 170, 0],
  [0, 170, 170],
  [170, 0, 0],
  [170, 0, 170],
  [170, 85, 0],
  [170, 170, 170],
  // 8..15 — bright 8 colors
  [85, 85, 85],
  [85, 85, 255],
  [85, 255, 85],
  [85, 255, 255],
  [255, 85, 85],
  [255, 85, 255],
  [255, 255, 85],
  [255, 255, 255],
  // 16..23 — bright 8 colors again (BIOS-programmed duplicate)
  [85, 85, 85],
  [85, 85, 255],
  [85, 255, 85],
  [85, 255, 255],
  [255, 85, 85],
  [255, 85, 255],
  [255, 255, 85],
  [255, 255, 255],
];
