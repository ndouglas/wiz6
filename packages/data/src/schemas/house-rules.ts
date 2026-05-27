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
});

export type HouseRules = z.infer<typeof HouseRulesSchema>;

/** Stock-behavior defaults — every rule set to its engine-faithful value. */
export const STOCK_HOUSE_RULES: HouseRules = {
  schemaVersion: 1,
};

/** Recommended first-load defaults — includes the QoLs the project ships on. */
export const DEFAULT_HOUSE_RULES: HouseRules = {
  schemaVersion: 1,
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

export const HOUSE_RULES_META: readonly HouseRuleMeta[] = [];
