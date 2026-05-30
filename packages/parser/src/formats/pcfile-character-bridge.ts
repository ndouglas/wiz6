import type { Character, PcfileSlot } from '@wiz6/data';

/** Record offsets for fields the engine keeps but PcfileSlot only preserves in `raw`. */
const OFF_RENDERED_PORTRAIT = 0x19c; // global portrait index 0..41 (the drawn portrait)
const OFF_SEX = 0x1a1;

/**
 * Convert a decoded PCFILE.DBS slot into a roster `Character`.
 *
 * Engine fields map field-for-field. Two fields live only in `raw`:
 *   - rendered portrait at +0x19c  → Character.portraitIndex (the GLOBAL index the
 *     engine actually draws; NOT slot.portraitIndex, which is the +0x1ab creation default)
 *   - sex at +0x1a1                → Character.sex
 *
 * @param slot a populated PcfileSlot (caller filters out empty slots).
 * @param id   the UUID to assign (fresh on import; deterministic in tests).
 */
export function pcfileSlotToCharacter(slot: PcfileSlot, id: string): Character {
  return {
    id,
    name: slot.name ?? '',
    race: slot.race,
    class: slot.class,
    level: slot.level,
    savedOldLevel: slot.savedOldLevel,
    xp: slot.xp,
    gold: slot.gold,
    conditions: [...slot.conditions],
    dead: slot.conditions[2] !== 0,
    paralyzed: slot.conditions[3] !== 0,
    attributes: {
      str: slot.str, int: slot.int, pie: slot.pie, vit: slot.vit,
      dex: slot.dex, spd: slot.spd, per: slot.per, kar: slot.kar,
    },
    schoolMana: [...slot.schoolManaCur],
    schoolManaMax: [...slot.schoolManaMax],
    skills: [...slot.skills],
    reaction: slot.reaction,
    sex: (slot.raw[OFF_SEX] === 1 ? 1 : 0),
    portraitIndex: slot.raw[OFF_RENDERED_PORTRAIT]!,
    hpCurrent: slot.hpCurrent,
    hpMax: slot.hpMax,
    staminaCurrent: slot.spCurrent,
    staminaMax: slot.spMax,
    age: slot.ageCounter,
    mks: slot.mks,
    encumbranceCurrent: slot.encumbranceCurrent,
    encumbranceMax: slot.encumbranceMax,
    bodyAc: [...slot.bodyAc],
  };
}
