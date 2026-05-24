/**
 * Typed address spaces for Wiz6's DOSBox-X save-state memory.
 *
 * The save's `Memory` blob holds a flat physical-address view of emulated
 * RAM. But the engine's runtime memory is partitioned into multiple segments
 * loaded by DOS at varying physical addresses across boots:
 *
 *   - `wroot.exe` (the host program — always loaded; has CS code segment +
 *     a DGROUP data segment).
 *   - 11 overlays (`winit.ovr`, `wbase.ovr`, `wmaze.ovr`, ...) that swap
 *     in and out of an overlay region based on the engine's state machine.
 *   - Video drivers (`ega.drv`, `cga.drv`, `herc.drv`) loaded once at boot.
 *
 * RE findings that say "DGROUP 0x363a" are ambiguous without context — is
 * that wroot's DGROUP, or the current overlay's data segment? They give
 * different physical addresses, and both are sometimes mistakenly called
 * "DGROUP." This file pins down the address-space taxonomy so future
 * findings + tooling can be unambiguous.
 */

/**
 * Canonical names of every segment that can show up in a Wiz6 save state.
 * Add a string union member here when introducing a new binary (e.g. a
 * sound driver if we ever locate one).
 */
export type SegmentSpace =
  // wroot.exe — always loaded; the host program.
  | 'wroot.exe' // synonym for the binary as a whole; same load base as wroot.dgroup
  | 'wroot.dgroup' // wroot's data segment. Contains msg.dbs, fonts, sounds, game_state at +0x363A.
  // Per-overlay data segments — each overlay has its own DS at runtime.
  // Most overlay-local variables (e.g. wbase's menu_window, FUN_0732 X/Y
  // tables) live in the overlay's own DGROUP, NOT wroot.dgroup. Currently
  // only `wbase.dgroup` is detected (via predicate scan); add detection
  // for the others as they become needed.
  | 'winit.dgroup'
  | 'wbase.dgroup'
  | 'wmaze.dgroup'
  | 'wmele.dgroup'
  | 'wmnpc.dgroup'
  | 'wpcvw.dgroup'
  | 'wpcmk.dgroup'
  | 'wpops.dgroup'
  | 'wtrea.dgroup'
  | 'wmexe.dgroup'
  | 'wdopt.dgroup'
  // Overlays — at most one swapped in at a time, but their last-loaded
  // image stays in memory until another overlay overwrites it. Multiple
  // can coexist at known physical locations.
  | 'winit.ovr'
  | 'wbase.ovr'
  | 'wmaze.ovr'
  | 'wmele.ovr'
  | 'wmnpc.ovr'
  | 'wpcvw.ovr'
  | 'wpcmk.ovr'
  | 'wpops.ovr'
  | 'wtrea.ovr'
  | 'wmexe.ovr'
  | 'wdopt.ovr'
  // Video drivers — loaded once at boot.
  | 'ega.drv'
  | 'cga.drv'
  | 'herc.drv';

/**
 * A typed address within Wiz6's runtime memory: which segment, what offset.
 * Use this in RE findings + MCP tool inputs instead of bare physical
 * offsets so downstream code can't accidentally read the wrong segment.
 */
export interface SegAddr {
  /** Which loaded binary's address space this offset is relative to. */
  space: SegmentSpace;
  /** Byte offset within that segment (≥ 0). For overlays this is the file
   * offset within the .ovr/.drv file. For wroot.dgroup this is the DGROUP-
   * relative offset (the conventional "DGROUP 0xXXXX" from findings). */
  offset: number;
}

/**
 * Per-binary anchor for finding the segment's load address in a save's
 * Memory blob. Each binary has a stable byte sequence at a known offset
 * (within the file) that's preserved verbatim in memory after load —
 * i.e. no relocations apply to those bytes. We anchor on that sequence,
 * then compute the segment's load base as `phys_anchor - anchor_offset`.
 */
export interface SegmentAnchor {
  /** Segment name this anchor identifies. */
  space: SegmentSpace;
  /** Path on disk where the file lives (relative to repo root). */
  diskPath: string;
  /**
   * Byte offset within the file where the anchor signature begins. The
   * anchor signature must be non-relocated (no segment refs in those
   * bytes) so it appears verbatim in memory.
   */
  anchorFileOffset: number;
  /** Number of bytes to use as the anchor signature. */
  anchorLength: number;
  /**
   * Optional offset adjustment when the segment is loaded — i.e. the
   * file_offset 0 → memory_base mapping isn't 1:1.
   *
   * For wroot.exe, the MZ header (0x200 bytes) is consumed at load time
   * and isn't present in memory, so memory_base = phys_anchor - file_offset + 0x200.
   * Equivalent: file_offset 0x200 in wroot.exe corresponds to memory_base 0
   * after load. Encode that as `loadHeaderSkipBytes = 0x200`.
   *
   * Most overlays have a tiny header (12-14 bytes) that the loader keeps
   * in memory, so loadHeaderSkipBytes = 0.
   */
  loadHeaderSkipBytes?: number;
}

/**
 * The result of scanning a save's Memory blob for all known segments.
 * Maps each segment name to its physical load base — i.e. the byte offset
 * within the Memory blob where the segment's offset-0 lives.
 *
 * A segment is absent from the map if its anchor signature wasn't found
 * in memory (the binary isn't currently loaded or was overwritten by a
 * later overlay).
 */
export type SegmentMap = Partial<Record<SegmentSpace, SegmentEntry>>;

export interface SegmentEntry {
  /** Physical address where this segment's offset 0 sits in memory. */
  physBase: number;
  /** Phys offset where the anchor signature was found (for debug/audit). */
  anchorPhys: number;
}

/**
 * Resolve a `SegAddr` to a physical-memory offset using the segment map.
 * Throws if the segment isn't loaded.
 */
export function resolveSegAddr(map: SegmentMap, addr: SegAddr): number {
  const entry = map[addr.space];
  if (!entry) {
    throw new Error(
      `segment "${addr.space}" is not loaded in this save (no anchor signature found)`,
    );
  }
  return entry.physBase + addr.offset;
}
