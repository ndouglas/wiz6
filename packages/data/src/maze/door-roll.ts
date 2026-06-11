/** Roll constants for the OPEN-door FORCE/PICK mechanic, all confirmed by raw
 *  disassembly of wmaze.ovr (docs/re/findings/maze-open-door-menu.json,
 *  static-asm-correction-roll-and-outcome). */
export const DOOR_ROLL = {
  /** strain_len / progress clamp ceiling (0x12). */
  strainMax: 18,
  /** PICK skill clamp ceiling (0x5f) on level + Skulduggery. */
  skillCap: 95,
  /** tumbler-count clamp ceiling. */
  maxTumblers: 6,
  /** Skulduggery skill index in character.skills[]. */
  skulduggerySkillIndex: 15,
  /** FORCE fatigue side-branch fires when rng(50) === 0. */
  fatigueOdds: 50,
  /** A failed FORCE/PICK advances the door toward welded when rng(3) === 0. */
  jamOdds: 3,
  /** Classes that gain Skulduggery XP from a failed pick (Thief/Rogue/Ninja). */
  thiefClasses: [3, 6, 13] as const,
} as const;
