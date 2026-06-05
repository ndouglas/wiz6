import { z } from 'zod';

/**
 * House rules — toggleable behavior modifications for the wiz6 port.
 *
 * Each rule has a `stock` value (matches the original DOS Wiz6 behavior)
 * and a modified value (a quality-of-life improvement). The settings UI
 * at `/settings` lets the player flip rules on/off. The engine ports
 * check the rules at decision points; stock = engine-faithful, modified
 * = QoL.
 *
 * Categories help organize the (eventually large) toggle UI:
 *   - creation: affects character creation (rolls, bonus points, etc.)
 *   - gameplay: affects in-engine gameplay (aging, class change tax, etc.)
 *   - rendering: affects how the EGA viewport draws (shaders, scaling, etc.)
 *
 * Versioned envelope mirrors the other persisted schemas (Save/Roster).
 */
export const HouseRulesSchema = z.object({
  schemaVersion: z.literal(1),
  /**
   * When TRUE, character-creation bonus rolls are pinned to the maximum
   * possible value (no reroll grind). When FALSE, the engine's random
   * roll mechanic runs faithfully — stock behavior.
   *
   * Category: creation. Default: TRUE (the first QoL we shipped).
   */
  pinMaxBonusRoll: z.boolean(),
  /**
   * When TRUE, the port plays SOUND00 ("ding") on rejected character-creation
   * inputs (bonus decrease at floor, increase at cap, confirm with leftover
   * points, duplicate-name commit, skill-untrain at floor). When FALSE,
   * rejected actions are silent — useful if you find the engine's beep
   * annoying. Category: creation. Default: TRUE (matches the engine).
   */
  playInvalidActionBeep: z.boolean(),
  /**
   * When TRUE, the skill-training screen allows exiting with leftover skill
   * points (engine-faithful — the engine permits this). When FALSE, the
   * screen blocks exit until budget==0 (port's stricter default). Category:
   * creation. Default: FALSE (stricter UX).
   */
  engineFaithfulSkillExit: z.boolean(),
  /**
   * When TRUE, the WPCVW EDIT submenu (rename, change portrait, change
   * profession) appears in the camp REVIEW MEMBER action set. When FALSE,
   * EDIT is camp-disabled (engine behavior — EDIT is only reachable from
   * the dungeon in the original). Category: gameplay. Default: FALSE.
   */
  allowEditFromCamp: z.boolean(),
  /**
   * When TRUE, a character's maximum carrying capacity is recomputed from their
   * CURRENT STR/VIT/race whenever it's displayed, so it tracks attribute gains.
   * When FALSE, it stays frozen at the value rolled at creation — faithfully
   * reproducing an original-game bug: the engine sets carry capacity (record
   * +0x22) once at creation and NEVER updates it as STR/VIT rise on level-up
   * (the wpcvw level-up path only writes HP/STM, never +0x440a). Category:
   * gameplay. Default: TRUE (fix the bug).
   */
  recomputeCarryCapacity: z.boolean(),
});

export type HouseRules = z.infer<typeof HouseRulesSchema>;

/** Stock-behavior defaults — every rule set to its engine-faithful value. */
export const STOCK_HOUSE_RULES: HouseRules = {
  schemaVersion: 1,
  pinMaxBonusRoll: false,
  playInvalidActionBeep: true,
  engineFaithfulSkillExit: true,
  allowEditFromCamp: false,
  recomputeCarryCapacity: false,
};

/** Recommended first-load defaults — includes the QoLs the project ships on. */
export const DEFAULT_HOUSE_RULES: HouseRules = {
  schemaVersion: 1,
  pinMaxBonusRoll: true,
  playInvalidActionBeep: true,
  engineFaithfulSkillExit: false,
  allowEditFromCamp: false,
  recomputeCarryCapacity: true,
};

/**
 * Display metadata for a single house rule. Used by the settings UI to
 * render labels, descriptions, and the appropriate control type. Adding
 * a new rule means: extend HouseRulesSchema + STOCK_HOUSE_RULES +
 * DEFAULT_HOUSE_RULES, then append a HOUSE_RULES_META entry here.
 */
export interface HouseRuleMeta {
  /** The schema key (typed against HouseRules). */
  key: keyof Omit<HouseRules, 'schemaVersion'>;
  /** Short human-readable label shown in the settings UI. */
  label: string;
  /** Multi-line description for the settings UI (rendered as paragraph or tooltip). */
  description: string;
  /** Category for grouping. */
  category: 'creation' | 'gameplay' | 'rendering';
  /** The stock value (engine-faithful behavior). */
  stockValue: boolean | number | string;
  /** Control type the settings UI should render. */
  control: 'boolean';
  /** Optional in-app URL pointing at an engineering note or RE doc with
   *  more context. Rendered as a "Learn more" link in the settings UI. */
  learnMoreUrl?: string;
}

export const HOUSE_RULES_META: readonly HouseRuleMeta[] = [
  {
    key: 'pinMaxBonusRoll',
    label: 'Pin bonus points to max',
    description:
      'Wiz6 rolls a small random bonus-point pool at character creation with no reroll — to try for a better roll you must restart the whole creation flow, and the rolls that qualify for the elite classes (Samurai, Monk, Ninja, Lord, Bishop) hit only ~1 in 400 (≈10–20 hours of grinding). When ON, the pool is pinned to its maximum on the first try so you can pick any class without grinding. See the linked note for the full math and the developers’ own buried debug switch.',
    category: 'creation',
    stockValue: false,
    control: 'boolean',
    learnMoreUrl: '/explore/notes#bonus-point-lottery',
  },
  {
    key: 'playInvalidActionBeep',
    label: 'Beep on rejected inputs (creation)',
    description:
      'The engine plays a short "ding" sound (SOUND00) when you press a key that the character-creation screens reject — pushing an attribute past its 18 cap, pressing Enter to confirm bonus distribution with points still in the pool, typing a name that already exists in your roster, untraining a skill below its baseline value, and so on. Some players find the ding annoying. Turn OFF to make rejected actions silent. (The screens still reject the action; only the sound changes.)',
    category: 'creation',
    stockValue: true,
    control: 'boolean',
  },
  {
    key: 'engineFaithfulSkillExit',
    label: 'Allow skill-train exit with leftover points',
    description:
      'On the SKILL POINTS screen during character creation, the original engine lets you press Escape to exit even if you have skill points remaining (forfeiting them). The port defaults to a stricter rule: you must spend the whole skill budget before you can leave. Turn ON to match the engine and allow forfeit-exits. Most players prefer the stricter default — forfeiting points is almost always a mistake, and the engine offers no warning.',
    category: 'creation',
    stockValue: true,
    control: 'boolean',
  },
  {
    key: 'allowEditFromCamp',
    label: 'Allow EDIT from camp REVIEW MEMBER',
    description:
      'In the original Wizardry VI, the EDIT submenu (rename, change portrait, change profession) is only available from the in-dungeon character view — camp REVIEW MEMBER disables it. The wiz6 dungeon is not yet ported, so this toggle lets you reach EDIT from the castle for now.',
    category: 'gameplay',
    stockValue: false,
    control: 'boolean',
  },
  {
    key: 'recomputeCarryCapacity',
    label: 'Recompute carry capacity from current STR',
    description:
      "A character's maximum carrying capacity is rolled once, at creation, from STR/VIT/race ((STR*2+VIT)*3, +STR at STR≥16/≥18, ×15; Faerie ×2/3). The original engine then NEVER updates it — no matter how much STR or VIT you gain on level-up, the cap stays frozen at its creation value (the level-up code only ever rewrites HP and stamina, never the carry-capacity field). So a character who trains STR from 10 to 18 over many levels keeps the carry limit of their level-1 self. When this is ON, the cap is recomputed from current attributes wherever it's shown, so it grows with your stats. Turn OFF to faithfully reproduce the original bug.",
    category: 'gameplay',
    stockValue: false,
    control: 'boolean',
    learnMoreUrl: '/explore/notes#carry-capacity-frozen',
  },
];
