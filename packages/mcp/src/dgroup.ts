// Per-save DGROUP base resolution.
//
// Wiz6 keeps its runtime state in a single 16-bit DOS data segment ("DGROUP").
// Every DGROUP-relative offset documented in `docs/re/` (game_state at 0x363a,
// sound table at 0x3344, party at 0x43e8, etc.) is implicitly anchored to
// whatever physical address DGROUP happens to live at when the save was taken.
//
// That physical anchor varies per save state — DOS loader placement isn't
// deterministic across CONFIG.SYS / device-driver variations — so we resolve
// it at runtime by anchoring on a stable wroot DGROUP-resident string table.
//
// **The anchor**: the wroot overlay-name + bootstrap-file string table
// starting at DGROUP 0x1AEE. Specifically the 30-byte sequence
//
//     "DISK.HDR\0MSG.DBS\0SCENARIO.DBS\0"
//
// This is at a fixed DGROUP offset because wroot's outer dispatcher reads
// it directly — overlay loads can't overwrite it. Verified byte-for-byte
// identical in autodrive intro saves (game_state=1) AND user-captured
// main-menu saves (game_state=4), at the same physical offset across both.
//
// The earlier implementation anchored on SOUND00.SND at DGROUP 0x4FF8 (which
// the deep-dive findings document as the SOUND template). That offset turned
// out to be ~0x1518 bytes off the true DGROUP base because the deep-dive's
// "DGROUP 0xXXXX" notation didn't actually correspond to DS:XXXX — and even
// if it had, the SOUND template gets rewritten by wbase.ovr's filename table
// once main menu loads. The overlay-name table at 0x1AEE doesn't.
//
// Results are cached per save path.

import { SaveStateBridge } from './debugger-console.js';

/** DGROUP offset of the DISK.HDR string at the start of the anchor. */
export const DISK_HDR_DGROUP_OFFSET = 0x1aee;

/**
 * ASCII hex of "DISK.HDR\0MSG.DBS\0SCENARIO.DBS\0" — 30 bytes.
 *
 * Three consecutive NUL-terminated filenames from wroot's static file-name
 * table. The combination is unique enough to indicate wroot's DGROUP and
 * stable across all game states (the dispatcher needs to keep reading it).
 */
export const DGROUP_ANCHOR_HEX =
  '44 49 53 4b 2e 48 44 52 00 ' +
  '4d 53 47 2e 44 42 53 00 ' +
  '53 43 45 4e 41 52 49 4f 2e 44 42 53 00';

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
      `could not locate wroot.exe DGROUP in ${savePath}: the 30-byte overlay-name ` +
        'table anchor (DISK.HDR + MSG.DBS + SCENARIO.DBS) is missing. The save ' +
        'was probably taken outside a running wroot.exe (DOS prompt or stale ' +
        'buffer from a previous wroot session).',
    );
  }
  const base = phys - DISK_HDR_DGROUP_OFFSET;
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
