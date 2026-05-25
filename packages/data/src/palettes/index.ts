import type { Palette } from '../schemas/palette.js';
import { EGA_DEFAULT } from './ega-default.js';
import { WIZ6_MAIN, WIZ6_MAIN_AC } from './wiz6-main.js';
import { WIZ6_DUNGEON, WIZ6_DUNGEON_AC } from './wiz6-dungeon.js';
import { VGA_DEFAULT_DAC } from './vga-default-dac.js';
import { applyAcPalette } from './ac-to-rgb.js';

/**
 * Single source of truth for all named EGA palettes used by Wizardry VI
 * renderers. Each entry has full RE provenance in its `provenance:` field.
 * Keyed by the palette's `name` field; `PALETTE_CATALOG[name].name === name`
 * is invariant (enforced by tests).
 *
 * **Active usage:** the live VGA DAC is BIOS default in every captured save
 * (entries 0..23 cover the 16 unique EGA colors, with 8..15 duplicated at
 * 16..23). The live AC is `wiz6-main` (verified across saves 1, 2, 5, 10, 13
 * via Vga-blob byte match). Each `Palette.colors` array is the chained
 * AC -> DAC result — the final RGB triples the framebuffer's 4-bit color
 * attributes 0..15 actually display as. See
 * `docs/re/findings/menu-cursor-render-path.json` for the RE chain and
 * `docs/re/palette-discovery.md` for the original (now-superseded) catalog
 * narrative.
 */
export const PALETTE_CATALOG: Record<string, Palette> = {
  [EGA_DEFAULT.name]: EGA_DEFAULT,
  [WIZ6_MAIN.name]: WIZ6_MAIN,
  [WIZ6_DUNGEON.name]: WIZ6_DUNGEON,
};

/** String-literal union of all catalog keys for type-safe lookup. */
export type PaletteName = keyof typeof PALETTE_CATALOG;

export {
  EGA_DEFAULT,
  WIZ6_MAIN,
  WIZ6_MAIN_AC,
  WIZ6_DUNGEON,
  WIZ6_DUNGEON_AC,
  VGA_DEFAULT_DAC,
  applyAcPalette,
};
