import { CLASS_SKILL_AVAILABILITY, SKILL_SLOT_NAMES } from '@wiz6/data';
import { type CharacterDraft, STARTER_SKILL_POINTS } from '../lib/draft.js';
import styles from './shared.module.css';
import skillStyles from './SkillPointStep.module.css';

interface Props {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

export function SkillPointStep({ draft, onUpdate }: Props) {
  if (draft.classIdx === null) {
    return <div className={styles.step}><p>Pick a class first.</p></div>;
  }

  const availableSlots = CLASS_SKILL_AVAILABILITY[draft.classIdx]
    ?.map((available, slotIdx) => ({ slotIdx, available }))
    .filter((s) => s.available) ?? [];

  const spent = Object.values(draft.skillPoints).reduce((a, b) => a + b, 0);
  const remaining = STARTER_SKILL_POINTS - spent;

  function adjust(slotIdx: number, delta: 1 | -1) {
    const next = { ...draft.skillPoints };
    next[slotIdx] = Math.max(0, (next[slotIdx] ?? 0) + delta);
    if (next[slotIdx] === 0) delete next[slotIdx];
    onUpdate({ skillPoints: next });
  }

  return (
    <div className={styles.step}>
      <p className={skillStyles.pool}>
        <strong>{remaining}</strong> of {STARTER_SKILL_POINTS} skill points unspent.
      </p>
      <p className={styles.hint}>
        Skill names are best-effort; engine canonical names not yet decoded.
      </p>
      <div className={skillStyles.grid}>
        {availableSlots.map(({ slotIdx }) => {
          const points = draft.skillPoints[slotIdx] ?? 0;
          const canInc = remaining > 0;
          const canDec = points > 0;
          return (
            <div key={slotIdx} className={skillStyles.row}>
              <span className={skillStyles.label}>
                {SKILL_SLOT_NAMES[slotIdx] ?? `Skill #${slotIdx}`}
              </span>
              <button type="button" onClick={() => adjust(slotIdx, -1)} disabled={!canDec}>−</button>
              <span className={skillStyles.value}>{points}</span>
              <button type="button" onClick={() => adjust(slotIdx, 1)} disabled={!canInc}>+</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
