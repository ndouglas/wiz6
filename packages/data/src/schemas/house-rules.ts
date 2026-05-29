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
});

export type HouseRules = z.infer<typeof HouseRulesSchema>;

/** Stock-behavior defaults — every rule set to its engine-faithful value. */
export const STOCK_HOUSE_RULES: HouseRules = {
  schemaVersion: 1,
  pinMaxBonusRoll: false,
  playInvalidActionBeep: true,
  engineFaithfulSkillExit: true,
  allowEditFromCamp: false,
};

/** Recommended first-load defaults — includes the QoLs the project ships on. */
export const DEFAULT_HOUSE_RULES: HouseRules = {
  schemaVersion: 1,
  pinMaxBonusRoll: true,
  playInvalidActionBeep: true,
  engineFaithfulSkillExit: false,
  allowEditFromCamp: false,
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
      'During character creation, Wiz6 rolls a small random bonus-point pool you distribute across attributes. There is no reroll button. To try for a higher roll, you must abandon the entire character and start the creation flow over — re-enter the name, re-pick race, re-allocate the new pool, re-pick class, re-distribute skill points, re-pick spells (for casters), re-pick portrait. Every attempt is a 2-3 minute click marathon. The rolls needed to qualify for the elite classes (Samurai, Monk, Ninja, Lord, Bishop) appear roughly 1 in 400 attempts — that works out to ~10-20 hours of grinding to roll into one of those classes. An absolute dogshit gaming experience even by 1990 standards. When this is ON, the bonus pool is pinned to its maximum rollable value on the first try, so you can pick any class without grinding. (The developers themselves had a buried debug switch for this very purpose — see the linked note.) Turn OFF only if you really want the original UX (recommended: do not).',
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
];
