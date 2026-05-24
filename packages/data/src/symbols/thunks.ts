/**
 * The "thunk-delta law" for cross-overlay calls in Wiz6.
 *
 * Every overlay reaches wroot.exe-exported functions through a fixed-address
 * BSS function-pointer thunk. The thunk address (as the overlay's decompile
 * shows it — e.g. `call [0xbbb6]`) maps to the wroot file offset by:
 *
 *     wroot_file_offset = thunk_address - WROOT_THUNK_DELTA
 *
 * Verified across winit.ovr, wmaze.ovr, wbase.ovr per CLAUDE.md. Examples:
 *
 *   0xbbb6 - 0xBA9C = 0x11a   → ui_window_create
 *   0xe0df - 0xBA9C = 0x2643  → kbd_check_with_filter
 *   0xee85 - 0xBA9C = 0x33e9  → huffman_load_and_decompress
 */

export const WROOT_THUNK_DELTA = 0xba9c;

/**
 * Resolve an overlay's `call [thunk_addr]` site to the wroot file offset of
 * the target function. Returns the offset; pair with a SymbolIndex to find
 * the name.
 */
export function resolveThunkToWrootOffset(thunkAddress: number): number {
  return thunkAddress - WROOT_THUNK_DELTA;
}

/**
 * The inverse: given a wroot function file offset, return the thunk address
 * that overlays would use to call it. Used when laying out a synthetic thunk
 * table for testing / cross-referencing.
 */
export function wrootOffsetToThunkAddress(wrootOffset: number): number {
  return wrootOffset + WROOT_THUNK_DELTA;
}
