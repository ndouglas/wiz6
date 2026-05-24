// Per-save DGROUP base resolution.
//
// Wiz6 keeps its runtime state in a single 16-bit DOS data segment ("DGROUP").
// Every DGROUP-relative offset documented in `docs/re/` (game_state at 0x363a,
// sound table at 0x3344, party at 0x43e8, etc.) is implicitly anchored to
// whatever physical address DGROUP happens to live at when the save was taken.
//
// That physical anchor varies per save state — DOS loader placement isn't
// deterministic across CONFIG.SYS / device-driver variations — so we resolve
// it at runtime by triangulating from two known string templates:
//
//   - DGROUP 0x513A : "SOUND00.SND\0" — slot-filename template
//   - DGROUP 0x5146 : "TITLEPAG.EGA\0" — vmode-dispatched title-page string
//
// They sit 12 bytes apart in DGROUP. If both are present at the matching
// relative distance in the save's physical memory, we have high confidence
// wroot.exe is loaded and DGROUP is at (sound_phys - 0x513A). If only one is
// present (e.g. SOUND00.SND in a stale DOS disk buffer from a previous
// session, no wroot loaded), refuse — returning a fake DGROUP base would
// make every downstream read return garbage.
//
// Results are cached per save path so we only pay the lookup once.

import { SaveStateBridge } from './debugger-console.js';

/** DGROUP offset of the SOUND00.SND filename template. */
export const SOUND_TEMPLATE_DGROUP_OFFSET = 0x513a;
/** DGROUP offset of the TITLEPAG.EGA string. */
export const TITLEPAG_DGROUP_OFFSET = 0x5146;

/** ASCII hex of "SOUND00.SND\0" — 12-byte anchor pattern. */
export const SOUND_TEMPLATE_HEX = '53 4f 55 4e 44 30 30 2e 53 4e 44 00';
/** ASCII hex of "TITLEPAG.EGA\0" — 13-byte corroborating anchor. */
export const TITLEPAG_HEX = '54 49 54 4c 45 50 41 47 2e 45 47 41 00';

const dgroupCache = new Map<string, number>();

/**
 * Locate the DGROUP physical base for the given save state.
 *
 * Requires both anchor strings to be present at the documented relative
 * distance. Throws with a clear diagnostic if either is missing, which
 * usually means the save was taken outside a running wroot.exe (DOS prompt,
 * earlier game, etc.).
 *
 * Results are cached by `savePath`.
 */
export function resolveDgroupBase(bridge: SaveStateBridge, savePath: string): number {
  const cached = dgroupCache.get(savePath);
  if (cached !== undefined) return cached;
  const soundPhys = bridge.findPattern(SOUND_TEMPLATE_HEX);
  const titlePhys = bridge.findPattern(TITLEPAG_HEX);
  if (soundPhys < 0 || titlePhys < 0) {
    const missing: string[] = [];
    if (soundPhys < 0) missing.push('SOUND00.SND');
    if (titlePhys < 0) missing.push('TITLEPAG.EGA');
    throw new Error(
      `could not locate wroot.exe DGROUP in ${savePath}: ${missing.join(' + ')} ` +
        'anchor(s) missing. The save was probably taken outside a running ' +
        'wroot.exe (DOS prompt, between overlay reloads, or a stale buffer).',
    );
  }
  const expectedDelta = TITLEPAG_DGROUP_OFFSET - SOUND_TEMPLATE_DGROUP_OFFSET;
  const actualDelta = titlePhys - soundPhys;
  if (actualDelta !== expectedDelta) {
    throw new Error(
      `DGROUP anchor mismatch in ${savePath}: SOUND00.SND at phys 0x${soundPhys.toString(
        16,
      )}, TITLEPAG.EGA at phys 0x${titlePhys.toString(16)} (delta ${actualDelta}, ` +
        `expected ${expectedDelta}). The two strings aren't from the same wroot.exe ` +
        'DGROUP — one is likely a stale buffer match.',
    );
  }
  const base = soundPhys - SOUND_TEMPLATE_DGROUP_OFFSET;
  dgroupCache.set(savePath, base);
  return base;
}

/** Convert a DGROUP-relative offset to a physical-memory offset for `savePath`. */
export function dgroupOffsetToPhysical(
  bridge: SaveStateBridge,
  savePath: string,
  dgroupOffset: number,
): number {
  return resolveDgroupBase(bridge, savePath) + dgroupOffset;
}

/** Clear the cache. Test-only. */
export function _clearDgroupCacheForTests(): void {
  dgroupCache.clear();
}
