// Per-save DGROUP base resolution.
//
// Wiz6 keeps its runtime state in a single 16-bit DOS data segment ("DGROUP").
// Every DGROUP-relative offset documented in `docs/re/` (game_state at 0x363a,
// sound table at 0x3344, party at 0x43e8, etc.) is implicitly anchored to
// whatever physical address DGROUP happens to live at when the save was taken.
//
// That physical anchor varies per save state — DOS loader placement isn't
// deterministic across CONFIG.SYS / device-driver variations — so we resolve
// it at runtime by anchoring on a filename-table substring that lives only
// in wroot.exe's DGROUP.
//
// The anchor: "SOUND00.SND\0SOUND00.SND\0CREDITS.PIC\0" — a 36-byte sequence
// formed by the two SOUND00.SND copies (template at 0x513A + working buffer
// at 0x5146 that the preload mutates per slot) followed by CREDITS.PIC at
// 0x5152. This sequence is unique enough to refuse single SOUND00.SND
// matches that show up in stale DOS disk-buffer remnants (the failure mode
// the original single-anchor implementation hit on `tools/dosbox/save/1.sav`).
//
// The first byte of the anchor sits at DGROUP 0x513A; subtract to get base.
// Results are cached per save path so we only pay the lookup once.

import { SaveStateBridge } from './debugger-console.js';

/** DGROUP offset of the SOUND00.SND filename template (start of the anchor). */
export const SOUND_TEMPLATE_DGROUP_OFFSET = 0x513a;

/**
 * ASCII hex of "SOUND00.SND\0SOUND00.SND\0CREDITS.PIC\0" — 36 bytes.
 *
 * This is the SOUND00.SND template + working-buffer pair followed by the
 * CREDITS.PIC filename in the wroot.exe filename table. The combination is
 * unique enough to indicate wroot's DGROUP and not a stale disk-buffer match.
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
