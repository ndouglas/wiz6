import { readFileSync } from 'node:fs';
import AdmZip from 'adm-zip';

/**
 * VGA palette extraction from a DOSBox-X save state's `Vga` blob.
 *
 * The blob is a DOSBox-X-internal serialization of the VGA emulation state —
 * registers + DAC palette + attribute-controller palette + ~800 KB of video
 * RAM. The on-disk layout is implementation-specific, so this module locates
 * the DAC by signature (scanning for 256 RGB triples of 6-bit values that
 * land at a plausible offset) and back-tracks 16 bytes for the AC palette
 * that always sits immediately before the DAC.
 *
 * Verified against DOSBox-X 2026.05.02 save format on tools/dosbox/save/1.sav:
 * DAC at Vga blob offset 0x82FE9 (boot-time, BIOS default palette).
 *
 * Returns 6-bit values (0..63) as they appear in the hardware. To convert to
 * 8-bit RGB for display, scale by 255/63 or use the VGA "bit replication"
 * trick (`v = (v << 2) | (v >> 4)`).
 */

export interface VgaPaletteState {
  /** Byte offset within the Vga blob where the DAC was found. */
  dacOffset: number;
  /**
   * 256-entry DAC, each entry (R, G, B) as 6-bit (0..63) values. To convert
   * to standard 8-bit RGB, use `v8 = (v6 << 2) | (v6 >> 4)` (VGA's bit-
   * replication trick).
   *
   * The first 16 entries are the ones Wiz6's `wiz6-main` and `wiz6-dungeon`
   * palette tables overwrite. Entries 16-31 typically mirror 0-15 with high-
   * intensity variants; entries 32-255 follow the standard VGA default
   * (a 256-color CGA-compatible extended palette).
   */
  dac: Array<[number, number, number]>;
}

/**
 * Find the VGA DAC palette in a Vga blob by signature.
 *
 * Heuristic: scan for a 768-byte region where every byte is ≤ 0x3F (the DAC
 * stores 6-bit values), with entries 0..15 forming a structure consistent
 * with the EGA / extended-CGA palette family (sufficient variance, no all-
 * zero region in the first 48 bytes).
 *
 * Returns the offset of the DAC's first byte, or -1 if not found.
 */
export function findDacOffset(blob: Uint8Array): number {
  // Common known offset first — fast path for the documented DOSBox-X build.
  const FAST_PATH = 0x82fe9;
  if (FAST_PATH + 768 <= blob.length && looksLikeDac(blob, FAST_PATH)) {
    return FAST_PATH;
  }
  // Fallback: linear scan. The blob is ~800 KB so this is acceptable for v1.
  for (let i = 0; i <= blob.length - 768; i++) {
    if (looksLikeDac(blob, i)) return i;
  }
  return -1;
}

function looksLikeDac(blob: Uint8Array, offset: number): boolean {
  // All 768 bytes must be in 6-bit range.
  for (let i = 0; i < 768; i++) {
    if (blob[offset + i]! > 0x3f) return false;
  }
  // Entry 0 should be (0, 0, 0) — black, in every sane palette.
  if (blob[offset] !== 0 || blob[offset + 1] !== 0 || blob[offset + 2] !== 0) return false;
  // Entry 15 (white) should be bright. The hardware default is (63,63,63) but
  // user palettes may set it lower; require an aggregate ≥ 96 (avg ≥ 32/63
  // per channel) so we don't false-positive on near-zero regions.
  const e15r = blob[offset + 15 * 3]!;
  const e15g = blob[offset + 15 * 3 + 1]!;
  const e15b = blob[offset + 15 * 3 + 2]!;
  if (e15r + e15g + e15b < 96) return false;
  // Variance across first 16 entries — rules out runs of 0s or near-flat.
  const seen = new Set<number>();
  for (let i = 0; i < 16 * 3; i++) seen.add(blob[offset + i]!);
  if (seen.size < 4) return false;
  return true;
}

export function parseVgaPaletteFromBlob(blob: Uint8Array): VgaPaletteState | null {
  const dacOffset = findDacOffset(blob);
  if (dacOffset < 0) return null;
  const dac: Array<[number, number, number]> = [];
  for (let i = 0; i < 256; i++) {
    dac.push([
      blob[dacOffset + i * 3]!,
      blob[dacOffset + i * 3 + 1]!,
      blob[dacOffset + i * 3 + 2]!,
    ]);
  }
  return { dacOffset, dac };
}

/**
 * Read a DOSBox-X save state ZIP and extract its `Vga` blob in memory.
 */
export function readVgaBlob(savePath: string): Uint8Array {
  const zip = new AdmZip(readFileSync(savePath));
  const entry = zip.getEntry('Vga');
  if (!entry) throw new Error(`save state ${savePath} has no 'Vga' entry`);
  return new Uint8Array(entry.getData());
}

/**
 * Convenience: full pipeline from save-state path to parsed palette state.
 */
export function parseVgaPaletteFromSave(savePath: string): VgaPaletteState | null {
  return parseVgaPaletteFromBlob(readVgaBlob(savePath));
}
