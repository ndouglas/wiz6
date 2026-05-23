import type { Palette } from '../schemas/palette.js';
import { EGA_DEFAULT } from './ega-default.js';
import { WIZ6_MAIN } from './wiz6-main.js';
import { WIZ6_DUNGEON } from './wiz6-dungeon.js';

/**
 * Single source of truth for all named EGA palettes used by Wizardry VI
 * renderers. Each entry has full RE provenance in its `provenance:` field.
 * Keyed by the palette's `name` field; `PALETTE_CATALOG[name].name === name`
 * is invariant (enforced by tests).
 */
export const PALETTE_CATALOG: Record<string, Palette> = {
  [EGA_DEFAULT.name]: EGA_DEFAULT,
  [WIZ6_MAIN.name]: WIZ6_MAIN,
  [WIZ6_DUNGEON.name]: WIZ6_DUNGEON,
};

/** String-literal union of all catalog keys for type-safe lookup. */
export type PaletteName = keyof typeof PALETTE_CATALOG;

export { EGA_DEFAULT, WIZ6_MAIN, WIZ6_DUNGEON };
