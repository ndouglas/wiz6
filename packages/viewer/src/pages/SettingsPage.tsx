import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HOUSE_RULES_META,
  STOCK_HOUSE_RULES,
  DEFAULT_HOUSE_RULES,
  type HouseRules,
  type HouseRuleMeta,
} from '@wiz6/data';
import {
  getHouseRules,
  setHouseRule,
  resetToStock,
  resetToDefaults,
  subscribeHouseRules,
} from '../lib/house-rules-store.js';
import styles from './SettingsPage.module.css';

/**
 * The settings / house-rules page. Lives outside the EGA viewport so the
 * UI can use modern web affordances (mouseover descriptions, scrollable
 * lists, multi-column layouts, etc.).
 *
 * v1 ships a single toggle (pinMaxBonusRoll); the architecture supports
 * adding more by extending HouseRulesSchema and HOUSE_RULES_META — no
 * UI changes needed for additional boolean toggles. Number / enum
 * controls will need additional render branches.
 */
export function SettingsPage() {
  const [rules, setRules] = useState<HouseRules>(getHouseRules());

  useEffect(() => subscribeHouseRules(setRules), []);

  // Group meta entries by category for the eventual multi-section layout.
  const byCategory = HOUSE_RULES_META.reduce<Record<string, HouseRuleMeta[]>>(
    (acc, m) => {
      (acc[m.category] ??= []).push(m);
      return acc;
    },
    {},
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.heading}>House Rules</h1>
        <p className={styles.lede}>
          Toggleable behavior modifications. <strong>Stock</strong> values match the
          original DOS Wiz6 behavior. Project defaults turn on a curated set of
          quality-of-life improvements.
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={resetToDefaults}>
            Reset to project defaults
          </button>
          <button type="button" onClick={resetToStock} className={styles.stockButton}>
            Reset to stock (engine-faithful)
          </button>
          <Link to="/castle" className={styles.backLink}>
            ← Back to the castle
          </Link>
        </div>
      </header>

      {Object.entries(byCategory).map(([cat, items]) => (
        <section key={cat} className={styles.category}>
          <h2 className={styles.categoryHeading}>{cat}</h2>
          <ul className={styles.ruleList}>
            {items.map((m) => (
              <RuleRow key={m.key} meta={m} rules={rules} />
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

function RuleRow({ meta, rules }: { meta: HouseRuleMeta; rules: HouseRules }) {
  if (meta.control !== 'boolean') {
    // Future-proofing for number/enum controls. Render a placeholder for now.
    return (
      <li className={styles.rule}>
        <strong>{meta.label}</strong> — control type {meta.control} not yet implemented
      </li>
    );
  }
  const current = rules[meta.key] as boolean;
  const isStock = current === meta.stockValue;
  return (
    <li className={styles.rule}>
      <label className={styles.ruleLabel}>
        <input
          type="checkbox"
          checked={current}
          onChange={(e) => setHouseRule(meta.key, e.target.checked)}
          aria-label={meta.label}
        />
        <span className={styles.ruleLabelText}>{meta.label}</span>
        <span
          className={styles.behaviorTag}
          data-stock={isStock || undefined}
          title={isStock ? 'matches original DOS Wiz6 behavior' : 'quality-of-life modification'}
        >
          {isStock ? 'stock' : 'QoL'}
        </span>
      </label>
      <p className={styles.ruleDescription}>{meta.description}</p>
      {meta.learnMoreUrl ? (
        <p className={styles.learnMore}>
          <Link to={meta.learnMoreUrl}>Learn more →</Link>
        </p>
      ) : null}
    </li>
  );
}

// Suppress unused-import warning for STOCK / DEFAULT — they're referenced via the buttons above
// implicitly through resetToStock / resetToDefaults. Keep the typecheck happy.
void STOCK_HOUSE_RULES;
void DEFAULT_HOUSE_RULES;
