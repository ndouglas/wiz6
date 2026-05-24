// Per-save DGROUP base resolution.
//
// Wiz6 keeps its runtime state in a single 16-bit DOS data segment ("DGROUP").
// Every DGROUP-relative offset documented in `docs/re/` (game_state at 0x363a,
// sound table at 0x3344, party at 0x43e8, etc.) is implicitly anchored to
// whatever physical address DGROUP happens to live at when the save was taken.
//
// That physical anchor varies per save state — DOS loader placement isn't
// deterministic across CONFIG.SYS / device-driver variations — so we resolve
// it at runtime by anchoring on the filename-table region in wroot's DGROUP.
//
// Empirically verified against autodriven save 3.sav (game_state=1, intro):
// the SOUND00.SND filename TEMPLATE that winit_preload_sounds mutates per
// slot sits at DGROUP 0x4FF8, NOT 0x513A as I initially read out of the
// deep-dive findings. With base = phys(first SOUND00.SND) - 0x4FF8, the
// game_state at +0x363A reads 1, 0, etc. — all sensible values from the
// CLAUDE.md state-machine table.
//
// IMPORTANT: this anchor is only present during winit state 0/1/2. Once
// wbase.ovr (main menu, state 4) or later overlays load, the filename-table
// region at 0x4FF8+ gets REWRITTEN with whatever filenames the current
// overlay needs. So the anchor disappears post-intro even though wroot is
// still loaded. Detecting wroot across all game states needs a different,
// state-invariant anchor — tracked as a follow-up.
//
// The 36-byte multi-string variant ("SOUND00.SND\0SOUND00.SND\0CREDITS.PIC\0")
// is used to reject false positives — single SOUND00.SND matches can show
// up in stale DOS disk-buffer remnants (the original single-anchor impl hit
// this on `tools/dosbox/save/1.sav`).
//
// Results are cached per save path.

import { SaveStateBridge } from './debugger-console.js';

/** DGROUP offset of the SOUND00.SND filename template (start of the anchor). */
export const SOUND_TEMPLATE_DGROUP_OFFSET = 0x4ff8;

/**
 * ASCII hex of "SOUND00.SND\0SOUND00.SND\0CREDITS.PIC\0" — 36 bytes.
 *
 * The SOUND00.SND template at DGROUP 0x4FF8 is followed by a duplicate copy
 * at 0x5004 (winit's per-slot working buffer, post-preload still reads as
 * "SOUND00.SND" because slot 0 was last), then CREDITS.PIC at 0x5010. The
 * 36-byte combo is unique enough to indicate wroot's DGROUP and not a stale
 * disk-buffer match.
 */
export const DGROUP_ANCHOR_HEX =
  '53 4f 55 4e 44 30 30 2e 53 4e 44 00 ' +
  '53 4f 55 4e 44 30 30 2e 53 4e 44 00 ' +
  '43 52 45 44 49 54 53 2e 50 49 43 00';

const dgroupCache = new Map<string, number>();

/**
 * Locate the DGROUP physical base for the given save state.
 *
 * Anchors on the 36-byte DGROUP_ANCHOR_HEX sequence. Throws with a clear
 * diagnostic if the anchor isn't found — usually means the save was taken
 * outside a running wroot.exe (DOS prompt, between overlay reloads, etc.).
 *
 * Results are cached by `savePath`.
 */
export function resolveDgroupBase(bridge: SaveStateBridge, savePath: string): number {
  const cached = dgroupCache.get(savePath);
  if (cached !== undefined) return cached;
  const phys = bridge.findPattern(DGROUP_ANCHOR_HEX);
  if (phys < 0) {
    throw new Error(
      `could not locate wroot.exe DGROUP in ${savePath}: the 36-byte filename-table ` +
        'anchor (SOUND00.SND × 2 + CREDITS.PIC) is missing. The save was probably ' +
        'taken outside a running wroot.exe (DOS prompt, between overlay reloads, or ' +
        'a stale disk-buffer remnant from a previous wroot session).',
    );
  }
  const base = phys - SOUND_TEMPLATE_DGROUP_OFFSET;
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
