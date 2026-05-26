import { RACE_BASE_STATS } from '@wiz6/data';
import type { CharacterDraft, DraftAttributes } from '../lib/draft.js';
import styles from './shared.module.css';
import attrStyles from './AttributeDistributeStep.module.css';

const ATTRS: Array<keyof Pick<DraftAttributes, 'str' | 'iq' | 'pie' | 'vit' | 'dex' | 'spd'>> = [
  'str', 'iq', 'pie', 'vit', 'dex', 'spd',
];

const LABELS: Record<typeof ATTRS[number], string> = {
  str: 'STR',
  iq: 'IQ',
  pie: 'PIE',
  vit: 'VIT',
  dex: 'DEX',
  spd: 'SPD',
};

const ATTR_MAX = 18;

interface Props {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

export function AttributeDistributeStep({ draft, onUpdate }: Props) {
  const spent = ATTRS.reduce((a, k) => a + draft.bonusDistribution[k], 0);
  const remaining = draft.bonusPool - spent;
  const raceBase = draft.raceIdx !== null ? RACE_BASE_STATS[draft.raceIdx] : null;

  function adjust(attr: typeof ATTRS[number], delta: 1 | -1) {
    const next = { ...draft.bonusDistribution };
    next[attr] = Math.max(0, next[attr] + delta);
    onUpdate({ bonusDistribution: next });
  }

  return (
    <div className={styles.step}>
      <p className={attrStyles.pool}>
        <strong>{remaining}</strong> of {draft.bonusPool} bonus points unspent.
      </p>
      <div className={attrStyles.grid}>
        {ATTRS.map((attr) => {
          const base = raceBase ? raceBaseAsDraft(raceBase)[attr] : 0;
          const bonus = draft.bonusDistribution[attr];
          const total = base + bonus;
          const canInc = remaining > 0 && total < ATTR_MAX;
          const canDec = bonus > 0;
          return (
            <div key={attr} className={attrStyles.row} aria-label={LABELS[attr]}>
              <span className={attrStyles.label}>{LABELS[attr]}</span>
              <button type="button" onClick={() => adjust(attr, -1)} disabled={!canDec}>−</button>
              <span className={attrStyles.value}>
                {total} <span className={attrStyles.bonus}>({base}+{bonus})</span>
              </span>
              <button type="button" onClick={() => adjust(attr, 1)} disabled={!canInc}>+</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function raceBaseAsDraft(r: typeof RACE_BASE_STATS[number]): DraftAttributes {
  return { str: r.str, iq: r.int, pie: r.pie, vit: r.vit, dex: r.dex, spd: r.spd, per: r.per, kar: r.kar };
}
