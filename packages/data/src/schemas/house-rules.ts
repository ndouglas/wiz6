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
});

export type HouseRules = z.infer<typeof HouseRulesSchema>;

/** Stock-behavior defaults — every rule set to its engine-faithful value. */
export const STOCK_HOUSE_RULES: HouseRules = {
  schemaVersion: 1,
  pinMaxBonusRoll: false,
};

/** Recommended first-load defaults — includes the QoLs the project ships on. */
export const DEFAULT_HOUSE_RULES: HouseRules = {
  schemaVersion: 1,
  pinMaxBonusRoll: true,
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
}

export const HOUSE_RULES_META: readonly HouseRuleMeta[] = [
  {
    key: 'pinMaxBonusRoll',
    label: 'Pin bonus points to max',
    description:
      "During character creation, Wiz6 rolls a small random bonus-point pool you can distribute across attributes. The stock UX is 'reroll until you get a big number' — fast and grindy. When this is ON, the bonus pool is pinned to the maximum rollable value (no reroll needed). Turn OFF for the stock random-roll experience.",
    category: 'creation',
    stockValue: false,
    control: 'boolean',
  },
];
