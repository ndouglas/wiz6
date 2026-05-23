import type { Palette } from '../schemas/palette.js';
import { EGA_DEFAULT } from './ega-default.js';
import { WIZ6_MAIN } from './wiz6-main.js';
import { WIZ6_DUNGEON } from './wiz6-dungeon.js';

/**
 * Single source of truth for all named EGA palettes used by Wizardry VI
 * renderers. Each entry has full RE provenance in its `provenance:` field.
 * Keyed by the palette's `name` field; `PALETTE_CATALOG[name].name === name`
 * is invariant (enforced by tests).
 *
 * **Active usage in current asset-render path:** only `ega-default`. The two
 * engine-loaded palettes (`wiz6-main` at wroot 0x209B, `wiz6-dungeon` at
 * 0x2105) are RE-confirmed via `INT 10h AX=1002h` calls in `wroot.exe` but
 * are not exercised by the gameplay states we currently render — the
 * EGA hardware is at BIOS default when sprites and screens draw. Both
 * palettes remain in the catalog for future use; the gameplay state(s) in
 * which they activate are tracked as `#Q-F` in `TODO.md`. See
 * `docs/re/palette-discovery.md` for the full RE picture.
 */
export const PALETTE_CATALOG: Record<string, Palette> = {
  [EGA_DEFAULT.name]: EGA_DEFAULT,
  [WIZ6_MAIN.name]: WIZ6_MAIN,
  [WIZ6_DUNGEON.name]: WIZ6_DUNGEON,
};

/** String-literal union of all catalog keys for type-safe lookup. */
export type PaletteName = keyof typeof PALETTE_CATALOG;

export { EGA_DEFAULT, WIZ6_MAIN, WIZ6_DUNGEON };
