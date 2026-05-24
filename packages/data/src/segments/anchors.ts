import type { SegmentAnchor } from './types.js';

/**
 * Anchor catalog: per-binary signatures used to locate each segment's
 * load address in a save state's Memory blob.
 *
 * Conventions:
 *   - For wroot.exe, we use a stable signature from its static string
 *     table (the overlay-name + bootstrap-file list at file offset
 *     0x10556). MZ header (0x200 bytes) is stripped at load, so we
 *     set `loadHeaderSkipBytes = 0x200` so the resulting `physBase`
 *     points at where file offset 0x200 lives in memory.
 *   - For overlays + drivers, we use the first 32-64 bytes of the file
 *     as the anchor (these binaries have minimal relocations and the
 *     early bytes appear verbatim in memory after load). loadHeaderSkipBytes
 *     defaults to 0 — the file's offset 0 maps to memory_base 0.
 *   - `wroot.dgroup` is NOT in this catalog — wroot's data segment has
 *     a context-dependent base that varies per overlay load. It's
 *     resolved by the legacy `resolveDgroupBase` function in dgroup.ts
 *     (game_state-legality validation across candidate offsets).
 */

export const SEGMENT_ANCHORS: readonly SegmentAnchor[] = [
  // wroot.exe — anchor on the static "DISK.HDR..." string table.
  {
    space: 'wroot.exe',
    diskPath: 'original/wroot.exe',
    anchorFileOffset: 0x10556,
    anchorLength: 30,
    loadHeaderSkipBytes: 0x200,
  },
  // Overlays — first 64 bytes (header + start of dispatch code).
  { space: 'winit.ovr', diskPath: 'original/winit.ovr', anchorFileOffset: 0x40, anchorLength: 64 },
  { space: 'wbase.ovr', diskPath: 'original/wbase.ovr', anchorFileOffset: 0x40, anchorLength: 64 },
  { space: 'wmaze.ovr', diskPath: 'original/wmaze.ovr', anchorFileOffset: 0x40, anchorLength: 64 },
  { space: 'wmele.ovr', diskPath: 'original/wmele.ovr', anchorFileOffset: 0x40, anchorLength: 64 },
  { space: 'wmnpc.ovr', diskPath: 'original/wmnpc.ovr', anchorFileOffset: 0x40, anchorLength: 64 },
  { space: 'wpcvw.ovr', diskPath: 'original/wpcvw.ovr', anchorFileOffset: 0x40, anchorLength: 64 },
  { space: 'wpcmk.ovr', diskPath: 'original/wpcmk.ovr', anchorFileOffset: 0x40, anchorLength: 64 },
  { space: 'wpops.ovr', diskPath: 'original/wpops.ovr', anchorFileOffset: 0x40, anchorLength: 64 },
  { space: 'wtrea.ovr', diskPath: 'original/wtrea.ovr', anchorFileOffset: 0x40, anchorLength: 64 },
  { space: 'wmexe.ovr', diskPath: 'original/wmexe.ovr', anchorFileOffset: 0x40, anchorLength: 64 },
  { space: 'wdopt.ovr', diskPath: 'original/wdopt.ovr', anchorFileOffset: 0x40, anchorLength: 64 },
  // Video drivers — first 32 bytes (driver dispatch table).
  { space: 'ega.drv', diskPath: 'original/ega.drv', anchorFileOffset: 0, anchorLength: 32 },
  { space: 'cga.drv', diskPath: 'original/cga.drv', anchorFileOffset: 0, anchorLength: 32 },
  { space: 'herc.drv', diskPath: 'original/herc.drv', anchorFileOffset: 0, anchorLength: 32 },
];
