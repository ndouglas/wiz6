/**
 * draftFromEngineDump — adapt a LIVE engine creation-draft dump into a
 * DraftState so the creation `drawCharSheet` renderer displays the exact
 * character the engine rolled.
 *
 * Where `draftFromCharacter` adapts a committed Character (review screens, with
 * `bonusPool: -1` to HIDE the BONUS row), this adapts the in-creation draft
 * captured at a creation waypoint via `LiveSession.dumpDraft()`. Critically it
 * keeps the LIVE `bonusPool` (so the BONUS row renders), and pulls every stat
 * from the engine's decoded `character_record` instead of hardcoding RE'd
 * values that go stale when the roll changes.
 *
 * Source shape (see packages/mcp/src/live/live-session.ts `dumpDraft`):
 *   { draft: <character_record decode>, bonusPool: <u16 at DGROUP 0x56ac> }
 * The `character_record` decode uses snake_case field names and decodes
 * `attributes`/`skills` as numeric arrays.
 */

import { type DraftState, blankDraft } from '../state.js';

/** The subset of the `character_record` decode this adapter consumes. */
export interface EngineDraftRecord {
  name: string;
  race: number;
  sex: number;
  class: number;
  /** [str, int, pie, vit, dex, spd, per, kar] */
  attributes: number[];
  rendered_portrait_index: number;
  /** Age in game-days (engine *0x5478, u32). drawCharSheet divides by 365. */
  age_counter: number;
  hp_cur: number;
  hp_max: number;
  sp_cur: number;
  sp_max: number;
  level: number;
  level_secondary: number;
  skills: number[];
  xp: number;
  encumbrance_max: number;
}

export interface EngineDraftDump {
  draft: EngineDraftRecord;
  /** Remaining bonus pool (engine u16 at DGROUP 0x56ac). */
  bonusPool: number;
}

const ATTR_ORDER = ['str', 'int', 'pie', 'vit', 'dex', 'spd', 'per', 'kar'] as const;

export function draftFromEngineDump(dump: EngineDraftDump): DraftState {
  const base = blankDraft();
  const r = dump.draft;
  const a = r.attributes;
  const attributes = {
    str: a[0] ?? 0,
    int: a[1] ?? 0,
    pie: a[2] ?? 0,
    vit: a[3] ?? 0,
    dex: a[4] ?? 0,
    spd: a[5] ?? 0,
    per: a[6] ?? 0,
    kar: a[7] ?? 0,
  } satisfies Record<(typeof ATTR_ORDER)[number], number>;

  return {
    ...base,
    name: r.name,
    race: r.race,
    sex: r.sex,
    class: r.class,
    attributes,
    skills: [...r.skills],
    portrait: r.rendered_portrait_index,
    // LIVE bonus pool — keeps the BONUS row visible (unlike draftFromCharacter,
    // which forces -1 to hide it on the review screen).
    bonusPool: dump.bonusPool,
    derived: {
      age: r.age_counter,
      // Char-sheet row-3 secondary-age counter. Engine reads *0x5496 (0
      // pre-derived, 1 post-skill-init); the record's level_secondary (+0x26)
      // tracks the same 0→1 transition, so we source it data-driven from the
      // sidecar rather than hardcoding 1 (which is wrong on the class screen,
      // where derived stats aren't computed yet and the engine renders "0").
      secondAge: r.level_secondary,
      hpInitial: r.hp_max,
      stamina: r.sp_max,
      carryCapacityMax: r.encumbrance_max,
      level: r.level,
      xp: r.xp,
    },
  };
}
