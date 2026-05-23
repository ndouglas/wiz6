/**
 * Wiz6 stores pixel indices in `.ega` and `.pic` files with a permuted
 * bit-pattern ordering. The engine relies on the BIOS-default EGA palette
 * being active when these assets render; the on-disk bit pattern decodes
 * to a *standard EGA palette index* via the table below.
 *
 * Discovered in Stage 1f.2 by capturing the title sequence in DOSBox-X and
 * inverting the pixel-to-bit-pattern mapping. The Phase 1 RE pass for #002
 * (per-scene palette switching) confirmed it applies symmetrically to both
 * `.ega` screens and `.pic` sprites — the same encoding convention is used
 * across the asset toolchain.
 *
 * Table: file bit-pattern 0x0..0xF → standard EGA palette index.
 */
export const EGA_FILE_INDEX_PERMUTATION = [
  0, 15, 9, 5, 12, 14, 10, 11, 8, 7, 1, 13, 4, 6, 2, 3,
] as const;
