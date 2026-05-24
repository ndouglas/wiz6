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

/**
 * Candidate DGROUP offsets for the DISK.HDR anchor string. Different
 * overlays appear to give the same physical DISK.HDR location different
 * DGROUP-relative offsets — overlays each have their own data segment,
 * and the program's effective DGROUP shifts depending on which overlay
 * is loaded. Validated empirically by saving at known game states and
 * checking game_state at DGROUP+0x363A for each candidate; the right
 * base is the one that yields a value in LEGAL_GAME_STATES.
 *
 * Known contexts:
 *   - 0x1AEE: wbase.ovr (state 4 main menu, state 7 cleanup, state 0x18 config)
 *   - 0x05D6: winit.ovr (state 0/1/2/8) AND wmaze.ovr (state 5/6/0x17)
 *
 * The two candidates differ by exactly 0x1518 — the same phantom shift
 * we've seen elsewhere when comparing offsets across overlay contexts.
 * Add more as new overlays get exercised.
 */
export const DISK_HDR_DGROUP_CANDIDATES = [0x05d6, 0x1aee] as const;

/**
 * Legal game_state values from CLAUDE.md's state-machine table. Used to
 * validate which DGROUP candidate is correct for a given save.
 */
const LEGAL_GAME_STATES = new Set([
  0, 1, 2, 4, 5, 6, 7, 8, 0xa, 0xb, 0xc, 0xd, 0xe, 0xf,
  0x11, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
]);

/** DGROUP offset of the game_state global. */
const GAME_STATE_DGROUP_OFFSET = 0x363a;

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
  // Try each candidate DGROUP offset; pick the one giving a legal game_state.
  const tried: Array<{ base: number; gs: number }> = [];
  for (const candidateOff of DISK_HDR_DGROUP_CANDIDATES) {
    const base = phys - candidateOff;
    if (base < 0) continue;
    const gsPhys = base + GAME_STATE_DGROUP_OFFSET;
    const gsBytes = bridge.readPhysical(gsPhys, 2);
    const gs = gsBytes[0]! | (gsBytes[1]! << 8);
    tried.push({ base, gs });
    if (LEGAL_GAME_STATES.has(gs)) {
      dgroupCache.set(savePath, base);
      return base;
    }
  }
  throw new Error(
    `wroot.exe DGROUP anchor located in ${savePath} but no candidate offset ` +
      `gave a legal game_state. Tried: ${tried
        .map((t) => `base=0x${t.base.toString(16)} → gs=0x${t.gs.toString(16)}`)
        .join('; ')}. ` +
      'The save is probably from an overlay context not yet in DISK_HDR_DGROUP_CANDIDATES.',
  );
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
