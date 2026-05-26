import { useEffect, useState } from 'react';
import { type CharacterDraft, MAX_BONUS_POINTS } from '../lib/draft.js';
import { getHouseRules, subscribeHouseRules } from '../../../lib/house-rules-store.js';
import styles from './shared.module.css';

interface Props {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

function rollStockBonus(): number {
  return 1 + Math.floor(Math.random() * 8) + Math.floor(Math.random() * 8) + Math.floor(Math.random() * 8);
}

export function BonusRollStep({ draft, onUpdate }: Props) {
  const [rules, setRules] = useState(getHouseRules());
  useEffect(() => subscribeHouseRules(setRules), []);

  const pinned = rules.pinMaxBonusRoll;

  useEffect(() => {
    if (pinned && draft.bonusPool === 0) {
      onUpdate({ bonusPool: MAX_BONUS_POINTS });
    }
  }, [pinned, draft.bonusPool, onUpdate]);

  if (pinned) {
    return (
      <div className={styles.step}>
        <p>
          Bonus points (pinned to max via house rule): <strong>{MAX_BONUS_POINTS}</strong>
        </p>
        <p className={styles.hint}>
          The original game's bonus-roll grind is bypassed. Toggle "Pin bonus points to max" off
          in /settings to get the engine-faithful experience.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.step}>
      <p>
        Current roll: <strong>{draft.bonusPool || '—'}</strong>
      </p>
      <button type="button" onClick={() => onUpdate({ bonusPool: rollStockBonus() })}>
        Roll bonus points
      </button>
      <p className={styles.hint}>
        Stock Wiz6 behavior: small random pool. Reroll for higher values (no in-engine accept yet —
        each click replaces the previous roll).
      </p>
    </div>
  );
}
