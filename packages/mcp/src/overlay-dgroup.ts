// Per-overlay DGROUP detection via predicate scan.
//
// Wiz6 has 10 overlays (winit, wbase, wmaze, wmele, wmnpc, wpcvw, wpcmk,
// wpops, wtrea, wmexe, wdopt) and each one has its OWN data segment
// allocated by the DOS loader. Overlay code reads from its own DGROUP at
// runtime, NOT from wroot.dgroup. The two often hold different variables
// (game_state is mirrored in both, but menu_window, FUN_0732 X/Y tables,
// etc. live only in the overlay's own DGROUP).
//
// We can't anchor on a static string the way we do for wroot.dgroup —
// overlay data segments are mostly BSS, with little verbatim content.
// Instead we do a PREDICATE SCAN: every 16-byte-aligned base in memory
// is tested against multiple known-DGROUP byte constraints; the unique
// base satisfying all of them is the overlay's DGROUP.
//
// Empirically this converges to a single candidate for state-4 saves
// (where the menu is active) — verified across saves 1, 8, 9, 10, 11,
// 12, 13. Other states need their own predicate set; only `wbase` is
// implemented for now. Add helpers as we tackle other overlays.

import { SaveStateBridge } from './debugger-console.js';
import { resolveDgroupBase } from './dgroup.js';

/** DGROUP offset of the global game_state word. Same in every DGROUP
 *  (wroot's, wbase's, etc.) — they mirror it. */
const GAME_STATE_OFFSET = 0x363a;

/** DGROUP offset of the frame_parity word (set by wbase's input poll). */
const FRAME_PARITY_OFFSET = 0x3646;

/** DGROUP offset of the 10-tick poll counter (incremented + mod 10 each
 *  input poll iteration in wbase). */
const POLL_COUNTER_OFFSET = 0x5060;

/** DGROUP offset of wbase's menu window handle (allocated when game_state
 *  enters wbase's set: 4 = main menu, 0x18 = config submenu). */
const WBASE_MENU_WINDOW_OFFSET = 0x4fbc;

/**
 * Scan the save's Memory blob for the wbase overlay's DGROUP base.
 *
 * Requires game_state to be in wbase's handled set (currently 4 = main
 * menu); throws otherwise. Caches result per save path.
 *
 * Algorithm: walk every 16-byte-aligned base, test:
 *   1. (*0x363A) == current game_state (from wroot.dgroup)
 *   2. (*0x3646) ∈ {0, 1}      — frame_parity is a single bit
 *   3. (*0x5060) < 10           — poll counter is mod 10
 *   4. (*0x4fbc) != 0            — menu window is allocated in state 4
 *   5. base != wroot.dgroup base — avoid the obvious self-match
 *   6. base >= 0x10000            — skip DOS PSP / BIOS area noise
 *
 * Empirically converges to exactly ONE candidate for state-4 saves.
 */
const wbaseDgroupCache = new Map<string, number>();

const WBASE_GAME_STATES = new Set([0x04, 0x07, 0x0e, 0x18]);

export function resolveWbaseDgroupBase(bridge: SaveStateBridge, savePath: string): number {
  const cached = wbaseDgroupCache.get(savePath);
  if (cached !== undefined) return cached;

  const wrootDg = resolveDgroupBase(bridge, savePath);
  const gsBytes = bridge.readPhysical(wrootDg + GAME_STATE_OFFSET, 2);
  const gameState = gsBytes[0]! | (gsBytes[1]! << 8);
  if (!WBASE_GAME_STATES.has(gameState)) {
    throw new Error(
      `wbase.dgroup detection requires the engine to be in a wbase-handled state ` +
        `(4=menu, 7=cleanup, 0xe=combat-end, 0x18=config); current state is ` +
        `0x${gameState.toString(16)}. The wbase overlay isn't active in this save.`,
    );
  }

  // Fast path: scan in one read (avoid issuing thousands of subprocess
  // reads). Pull a wide-enough window of memory to cover plausible DOS
  // memory range and scan in-process.
  const SCAN_START = 0x10000;
  const SCAN_END = 0xc0000; // 768 KB — covers conventional DOS memory
  const block = bridge.readPhysical(SCAN_START, SCAN_END - SCAN_START);

  const matches: number[] = [];
  // We need to read 5 offsets within each candidate (0x363A, 0x363B,
  // 0x3646, 0x3647, 0x5060, 0x5061, 0x4fbc, 0x4fbd). The widest offset
  // is 0x5061, so we stop SCAN_END - 0x5062 to avoid out-of-range reads.
  for (let off = 0; off + 0x5062 < block.length; off += 16) {
    const gs = block[off + GAME_STATE_OFFSET]! | (block[off + GAME_STATE_OFFSET + 1]! << 8);
    if (gs !== gameState) continue;
    const fp = block[off + FRAME_PARITY_OFFSET]! | (block[off + FRAME_PARITY_OFFSET + 1]! << 8);
    if (fp > 1) continue;
    const poll = block[off + POLL_COUNTER_OFFSET]! | (block[off + POLL_COUNTER_OFFSET + 1]! << 8);
    if (poll >= 10) continue;
    const mw = block[off + WBASE_MENU_WINDOW_OFFSET]! | (block[off + WBASE_MENU_WINDOW_OFFSET + 1]! << 8);
    if (mw === 0) continue;
    const base = SCAN_START + off;
    if (base === wrootDg) continue;
    matches.push(base);
  }

  if (matches.length === 0) {
    throw new Error(
      `wbase.dgroup not found in ${savePath}. Predicate scan returned no candidates. ` +
        `Either wbase hasn't fully initialized, or the predicate set needs to be ` +
        `loosened. wroot.dgroup is at 0x${wrootDg.toString(16)}, game_state=0x${gameState.toString(16)}.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `wbase.dgroup detection is ambiguous in ${savePath}: ` +
        `${matches.length} candidates passed the predicates ` +
        `(${matches.map((m) => `0x${m.toString(16)}`).join(', ')}). ` +
        `Tighten the predicate set in overlay-dgroup.ts.`,
    );
  }
  const base = matches[0]!;
  wbaseDgroupCache.set(savePath, base);
  return base;
}

/** Clear caches. Test-only. */
export function _clearOverlayDgroupCachesForTests(): void {
  wbaseDgroupCache.clear();
}
