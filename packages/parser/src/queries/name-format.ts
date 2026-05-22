/**
 * Expand the Wiz6 "of" ligature in decoded names.
 *
 * The Wiz6 game font has a special glyph at byte 0x3D (ASCII `=`) that
 * renders as a small "of" ligature. Many monster and item names use this
 * convention (e.g. `KNIGHT=DEATH` -> `KNIGHT OF DEATH`,
 * `AMULET=AIR` -> `AMULET OF AIR`). Apply this transform at the
 * parser's name-decoding boundary so all consumers see human-readable
 * names.
 *
 * - Replaces every `=` with ` OF ` (uppercase, single spaces).
 * - Collapses runs of consecutive whitespace into a single space.
 * - Trims leading/trailing whitespace from the result.
 */
export function expandOfLigature(s: string): string {
  return s
    .replace(/=/g, ' OF ')
    .replace(/\s+/g, ' ')
    .trim();
}
