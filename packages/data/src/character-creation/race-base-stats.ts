/**
 * Race base-stat table — minimum attribute values per race.
 *
 * Decoded from a live save state captured at the race-selection menu
 * (game_state=0x10) by reading DGROUP+0x52D9 via MCP `dosbox_read_memory`.
 * The engine populates this table transiently when wpcmk character
 * creation runs (it's NOT in BSS at boot). See
 * `docs/re/findings/race-base-stats.json` for evidence + cross-validation.
 *
 * On-disk encoding: each race row is 9 bytes — 8 ASCII-encoded attribute
 * bytes (`'A' + minimum_value`) + 1 null terminator. Decoder formula
 * `byte - 0x41` recovers the integer minimums. We expose the decoded
 * integers directly here.
 *
 * Attribute order matches the in-memory character record's attribute
 * block (`STR, INT, PIE, VIT, DEX, SPD, PER, KAR`).
 *
 * Cross-validation: every stock character's decoded attribute values
 * equals (race base) + (class-favored bonus allocation). E.g. THESUS the
 * Human Fighter has STR=18, decoded base = 9, so 9 bonus points went
 * into STR.
 */
export interface RaceBaseStats {
  /** Race index 0..10, matching engine ordering. */
  index: number;
  /** Race display name. */
  name: string;
  /** Minimum STR. */
  str: number;
  /** Minimum INT. */
  int: number;
  /** Minimum PIE. */
  pie: number;
  /** Minimum VIT. */
  vit: number;
  /** Minimum DEX. */
  dex: number;
  /** Minimum SPD. */
  spd: number;
  /** Minimum PER (Personality). */
  per: number;
  /** Minimum KAR (Karma). Always 0 — karma is purely earned. */
  kar: number;
}

export const RACE_BASE_STATS: readonly RaceBaseStats[] = [
  { index: 0,  name: 'Human',     str: 9,  int: 8,  pie: 8,  vit: 9,  dex: 9,  spd: 8,  per: 8,  kar: 0 },
  { index: 1,  name: 'Elf',       str: 7,  int: 10, pie: 10, vit: 7,  dex: 9,  spd: 9,  per: 8,  kar: 0 },
  { index: 2,  name: 'Dwarf',     str: 11, int: 6,  pie: 10, vit: 12, dex: 7,  spd: 7,  per: 7,  kar: 0 },
  { index: 3,  name: 'Gnome',     str: 10, int: 7,  pie: 13, vit: 10, dex: 8,  spd: 6,  per: 6,  kar: 0 },
  { index: 4,  name: 'Hobbit',    str: 8,  int: 7,  pie: 6,  vit: 9,  dex: 10, spd: 7,  per: 13, kar: 0 },
  { index: 5,  name: 'Faerie',    str: 5,  int: 11, pie: 6,  vit: 6,  dex: 10, spd: 14, per: 12, kar: 0 },
  { index: 6,  name: 'Lizardman', str: 12, int: 5,  pie: 5,  vit: 14, dex: 8,  spd: 10, per: 3,  kar: 0 },
  { index: 7,  name: 'Dracon',    str: 10, int: 7,  pie: 6,  vit: 12, dex: 10, spd: 8,  per: 6,  kar: 0 },
  { index: 8,  name: 'Felpurr',   str: 7,  int: 10, pie: 7,  vit: 7,  dex: 10, spd: 12, per: 10, kar: 0 },
  { index: 9,  name: 'Rawulf',    str: 8,  int: 6,  pie: 12, vit: 10, dex: 8,  spd: 8,  per: 10, kar: 0 },
  { index: 10, name: 'Mook',      str: 10, int: 10, pie: 6,  vit: 10, dex: 7,  spd: 7,  per: 9,  kar: 0 },
];

/** Look up race base stats by index. Throws on out-of-range. */
export function getRaceBaseStats(raceIndex: number): RaceBaseStats {
  const r = RACE_BASE_STATS[raceIndex];
  if (!r) {
    throw new Error(`race index ${raceIndex} out of range (valid 0..${RACE_BASE_STATS.length - 1})`);
  }
  return r;
}
