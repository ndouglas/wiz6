import {
  CLASS_REQUIREMENTS,
  CLASS_INDEX_TO_NAME,
  meetsClassRequirements,
} from '@wiz6/data';
import type { CharacterDraft } from '../lib/draft.js';
import styles from './shared.module.css';
import classStyles from './ClassPickStep.module.css';

interface Props {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

function maxAttrsWithBonus(attrs: CharacterDraft['attributes'], pool: number) {
  return {
    str: Math.min(18, attrs.str + pool),
    int: Math.min(18, attrs.iq + pool),
    pie: Math.min(18, attrs.pie + pool),
    vit: Math.min(18, attrs.vit + pool),
    dex: Math.min(18, attrs.dex + pool),
    spd: Math.min(18, attrs.spd + pool),
    per: attrs.per,
    kar: attrs.kar,
  };
}

export function ClassPickStep({ draft, onUpdate }: Props) {
  return (
    <div className={styles.step}>
      <p>Choose a class. Greyed classes have unreachable attribute requirements.</p>
      <div className={classStyles.grid}>
        {CLASS_REQUIREMENTS.map((req, idx) => {
          const possible = meetsClassRequirements(maxAttrsWithBonus(draft.attributes, draft.bonusPool), idx);
          const selected = draft.classIdx === idx;
          return (
            <button
              key={idx}
              type="button"
              className={classStyles.card}
              aria-pressed={selected}
              data-selected={selected || undefined}
              disabled={!possible}
              onClick={() => onUpdate({ classIdx: idx })}
              title={describeRequirements(req)}
            >
              <span className={classStyles.name}>{CLASS_INDEX_TO_NAME[idx]?.name ?? req.name}</span>
              <span className={classStyles.req}>{describeRequirements(req)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function describeRequirements(req: typeof CLASS_REQUIREMENTS[number]): string {
  const parts: string[] = [];
  if (req.str > 0) parts.push(`STR≥${req.str}`);
  if (req.int > 0) parts.push(`IQ≥${req.int}`);
  if (req.pie > 0) parts.push(`PIE≥${req.pie}`);
  if (req.vit > 0) parts.push(`VIT≥${req.vit}`);
  if (req.dex > 0) parts.push(`DEX≥${req.dex}`);
  if (req.spd > 0) parts.push(`SPD≥${req.spd}`);
  return parts.join(' · ') || 'no requirements';
}
