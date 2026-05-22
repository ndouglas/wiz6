import type { ScenarioMonster } from '@wiz6/data';

export type MonsterFieldName = keyof ScenarioMonster;
export type MonsterByteGroup =
  | 'core'
  | 'attack'
  | 'save'
  | 'sprite'
  | 'family'
  | 'meta';

export interface MonsterByteField {
  /** First byte offset within statBytes (0..157). */
  readonly offset: number;
  /** Number of consecutive bytes consumed (1 for scalars, N for arrays / u16s). */
  readonly length: number;
  /** Matches a property on ScenarioMonster (compile-time-checked via the
   *  MonsterFieldName type). */
  readonly fieldName: MonsterFieldName;
  /** Human-friendly label shown in the hex grid legend + tooltips. */
  readonly label: string;
  /** Coarse grouping used for cell colouring. */
  readonly group: MonsterByteGroup;
}

/**
 * Source of truth mapping each decoded byte of statBytes to its ScenarioMonster
 * field. Derived by hand from packages/parser/src/formats/scenario-db.ts.
 *
 * Gaps in the offset list are intentional — those bytes are still unmapped /
 * unknown (see docs/re/scenario-dbs.md). The HexGrid component handles
 * unmapped bytes by rendering them in the "unknown" colour.
 *
 * Multi-byte entries cover contiguous ranges. Non-contiguous fields (e.g. an
 * attack record's per-byte fields like attackNPoisonChance at bytes 10, 26, 42)
 * appear as separate entries with the same fieldName-prefix but distinct
 * fieldNames (attack1PoisonChance, attack2PoisonChance, attack3PoisonChance).
 */
export const MONSTER_BYTE_MAP: readonly MonsterByteField[] = [
  // --- Core stats ----------------------------------------------------------
  { offset: 0,   length: 2, fieldName: 'xpOnKill',             label: 'XP on kill (u16 LE)',  group: 'core' },
  // --- Attack 1 (bytes 6..20) ---------------------------------------------
  { offset: 6,   length: 1, fieldName: 'attack1DiceCount',     label: 'Atk1 dice count',      group: 'attack' },
  { offset: 7,   length: 1, fieldName: 'attack1DiceSides',     label: 'Atk1 dice sides',      group: 'attack' },
  { offset: 8,   length: 1, fieldName: 'attack1HpDrainChance', label: 'Atk1 HP drain %',      group: 'attack' },
  { offset: 9,   length: 1, fieldName: 'attack1SpecialChance', label: 'Atk1 special %',       group: 'attack' },
  { offset: 10,  length: 1, fieldName: 'attack1PoisonChance',  label: 'Atk1 poison %',        group: 'attack' },
  { offset: 11,  length: 1, fieldName: 'attack1AgeChance',     label: 'Atk1 age %',           group: 'attack' },
  { offset: 13,  length: 1, fieldName: 'attack1DrainChance',   label: 'Atk1 drain %',         group: 'attack' },
  { offset: 14,  length: 1, fieldName: 'attack1DecapitateChance', label: 'Atk1 decapitate %', group: 'attack' },
  { offset: 15,  length: 1, fieldName: 'attack1StunChance',    label: 'Atk1 stun %',          group: 'attack' },
  { offset: 16,  length: 1, fieldName: 'attack1PoisonStrength', label: 'Atk1 poison strength', group: 'attack' },
  { offset: 17,  length: 1, fieldName: 'attack1Style',         label: 'Atk1 style',           group: 'attack' },
  { offset: 18,  length: 2, fieldName: 'attack1Extra',         label: 'Atk1 extra bytes',     group: 'attack' },
  { offset: 20,  length: 1, fieldName: 'attack1DamageBonus',   label: 'Atk1 damage bonus',    group: 'attack' },
  // --- Attack 2 (bytes 22..36) --------------------------------------------
  { offset: 22,  length: 1, fieldName: 'attack2DiceCount',     label: 'Atk2 dice count',      group: 'attack' },
  { offset: 23,  length: 1, fieldName: 'attack2DiceSides',     label: 'Atk2 dice sides',      group: 'attack' },
  { offset: 24,  length: 1, fieldName: 'attack2HpDrainChance', label: 'Atk2 HP drain %',      group: 'attack' },
  { offset: 25,  length: 1, fieldName: 'attack2SpecialChance', label: 'Atk2 special %',       group: 'attack' },
  { offset: 26,  length: 1, fieldName: 'attack2PoisonChance',  label: 'Atk2 poison %',        group: 'attack' },
  { offset: 27,  length: 1, fieldName: 'attack2AgeChance',     label: 'Atk2 age %',           group: 'attack' },
  { offset: 29,  length: 1, fieldName: 'attack2DrainChance',   label: 'Atk2 drain %',         group: 'attack' },
  { offset: 30,  length: 1, fieldName: 'attack2DecapitateChance', label: 'Atk2 decapitate %', group: 'attack' },
  { offset: 31,  length: 1, fieldName: 'attack2StunChance',    label: 'Atk2 stun %',          group: 'attack' },
  { offset: 32,  length: 1, fieldName: 'attack2PoisonStrength', label: 'Atk2 poison strength', group: 'attack' },
  { offset: 33,  length: 1, fieldName: 'attack2Style',         label: 'Atk2 style',           group: 'attack' },
  { offset: 34,  length: 2, fieldName: 'attack2Extra',         label: 'Atk2 extra bytes',     group: 'attack' },
  { offset: 36,  length: 1, fieldName: 'attack2DamageBonus',   label: 'Atk2 damage bonus',    group: 'attack' },
  // --- Attack 3 (bytes 38..52) --------------------------------------------
  { offset: 38,  length: 1, fieldName: 'attack3DiceCount',     label: 'Atk3 dice count',      group: 'attack' },
  { offset: 39,  length: 1, fieldName: 'attack3DiceSides',     label: 'Atk3 dice sides',      group: 'attack' },
  { offset: 40,  length: 1, fieldName: 'attack3HpDrainChance', label: 'Atk3 HP drain %',      group: 'attack' },
  { offset: 41,  length: 1, fieldName: 'attack3SpecialChance', label: 'Atk3 special %',       group: 'attack' },
  { offset: 42,  length: 1, fieldName: 'attack3PoisonChance',  label: 'Atk3 poison %',        group: 'attack' },
  { offset: 43,  length: 1, fieldName: 'attack3AgeChance',     label: 'Atk3 age %',           group: 'attack' },
  { offset: 45,  length: 1, fieldName: 'attack3DrainChance',   label: 'Atk3 drain %',         group: 'attack' },
  { offset: 46,  length: 1, fieldName: 'attack3DecapitateChance', label: 'Atk3 decapitate %', group: 'attack' },
  { offset: 47,  length: 1, fieldName: 'attack3StunChance',    label: 'Atk3 stun %',          group: 'attack' },
  { offset: 48,  length: 1, fieldName: 'attack3PoisonStrength', label: 'Atk3 poison strength', group: 'attack' },
  { offset: 49,  length: 1, fieldName: 'attack3Style',         label: 'Atk3 style',           group: 'attack' },
  { offset: 50,  length: 2, fieldName: 'attack3Extra',         label: 'Atk3 extra bytes',     group: 'attack' },
  { offset: 52,  length: 1, fieldName: 'attack3DamageBonus',   label: 'Atk3 damage bonus',    group: 'attack' },
  // --- Encounter / HP / level / family ------------------------------------
  { offset: 54,  length: 1, fieldName: 'groupDiceCount',       label: 'Group dice count',     group: 'core' },
  { offset: 55,  length: 1, fieldName: 'groupDiceSides',       label: 'Group dice sides',     group: 'core' },
  { offset: 56,  length: 1, fieldName: 'goldStat',             label: 'Gold drop',            group: 'core' },
  { offset: 58,  length: 1, fieldName: 'hpDiceCount',          label: 'HP dice count',        group: 'core' },
  { offset: 59,  length: 1, fieldName: 'hpDiceSides',          label: 'HP dice sides',        group: 'core' },
  { offset: 60,  length: 1, fieldName: 'moveStat',             label: 'Move stat',            group: 'core' },
  { offset: 62,  length: 1, fieldName: 'monsterLevel',         label: 'Level',                group: 'core' },
  { offset: 63,  length: 1, fieldName: 'monsterLevelMax',      label: 'Level max',            group: 'core' },
  { offset: 64,  length: 1, fieldName: 'creatureKind',         label: 'Creature kind',        group: 'meta' },
  { offset: 70,  length: 4, fieldName: 'familyId',             label: 'Family ID (4 bytes)',  group: 'family' },
  // --- Extended saves -----------------------------------------------------
  { offset: 85,  length: 12, fieldName: 'extendedSaves',       label: 'Extended saves (12)',  group: 'save' },
  // --- Sprite / trait IDs (100-cluster) -----------------------------------
  { offset: 98,  length: 1, fieldName: 'combatSpriteId',       label: 'Combat sprite ID',     group: 'sprite' },
  { offset: 99,  length: 1, fieldName: 'combatSpriteAlt',      label: 'Combat sprite alt',    group: 'sprite' },
  { offset: 100, length: 1, fieldName: 'secondarySpriteId',    label: 'Secondary sprite',     group: 'sprite' },
  { offset: 102, length: 1, fieldName: 'magicResistChance',    label: 'Magic resist %',       group: 'save' },
  { offset: 103, length: 1, fieldName: 'auxSave103',           label: 'Aux save (byte 103)',  group: 'save' },
  { offset: 104, length: 1, fieldName: 'spellPowerChance',     label: 'Spell power %',        group: 'save' },
  { offset: 106, length: 1, fieldName: 'auxSave106',           label: 'Aux save (byte 106)',  group: 'save' },
  { offset: 111, length: 1, fieldName: 'flyEvadeChance',       label: 'Fly evade %',          group: 'save' },
  { offset: 112, length: 1, fieldName: 'combatTraitId',        label: 'Combat trait ID',      group: 'sprite' },
  // --- Save / effect-chance tables ----------------------------------------
  { offset: 113, length: 5, fieldName: 'saveTable',            label: 'Save table (5)',       group: 'save' },
  { offset: 121, length: 5, fieldName: 'effectChanceTable',    label: 'Effect chance (5)',    group: 'save' },
  { offset: 126, length: 1, fieldName: 'monsterAC',            label: 'Monster AC (signed)',  group: 'core' },
  // --- Attribute saves + class / sex / element / behavior / sprite group --
  { offset: 144, length: 4, fieldName: 'attributeSaves',       label: 'Attribute saves (4)',  group: 'save' },
  { offset: 148, length: 1, fieldName: 'monsterClass',         label: 'Class tier',           group: 'meta' },
  { offset: 149, length: 1, fieldName: 'monsterSubClass',      label: 'Sub-class',            group: 'meta' },
  { offset: 150, length: 1, fieldName: 'monsterSex',           label: 'Sex',                  group: 'meta' },
  { offset: 152, length: 1, fieldName: 'specialAttackElement', label: 'Special atk element',  group: 'meta' },
  { offset: 156, length: 1, fieldName: 'monsterBehaviorClass', label: 'Behavior class',       group: 'meta' },
  { offset: 157, length: 1, fieldName: 'spriteGroup',          label: 'Sprite group',         group: 'sprite' },
] as const;

/**
 * Reverse lookup: given a field name, return every byte offset that field
 * occupies. Used to compute "which bytes should pulse when I hover this field
 * on the Overview tab."
 */
export function byteRangeForField(fieldName: MonsterFieldName): number[] {
  const offsets: number[] = [];
  for (const entry of MONSTER_BYTE_MAP) {
    if (entry.fieldName === fieldName) {
      for (let i = 0; i < entry.length; i++) offsets.push(entry.offset + i);
    }
  }
  return offsets;
}

/**
 * Forward lookup: given a byte offset (0..157), return the byte-map entry that
 * claims it, or null if the byte is unmapped.
 */
export function fieldAtOffset(offset: number): MonsterByteField | null {
  if (offset < 0 || offset >= 158) return null;
  for (const entry of MONSTER_BYTE_MAP) {
    if (offset >= entry.offset && offset < entry.offset + entry.length) return entry;
  }
  return null;
}
