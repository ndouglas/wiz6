import { useEffect } from 'react';
import { rollKarma } from '@wiz6/data';
import type { CharacterDraft } from '../lib/draft.js';
import styles from './shared.module.css';

interface Props {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

function rng19(): number {
  return Math.random();
}

export function KarmaStep({ draft, onUpdate }: Props) {
  useEffect(() => {
    if (!draft.karmaRolled) {
      onUpdate({ karma: rollKarma(rng19, false), karmaRolled: true });
    }
  }, [draft.karmaRolled, onUpdate]);

  return (
    <div className={styles.step}>
      <p>
        Karma roll: <strong>{draft.karmaRolled ? draft.karma : '—'}</strong>
      </p>
      <button
        type="button"
        onClick={() => onUpdate({ karma: rollKarma(rng19, false), karmaRolled: true })}
      >
        Reroll
      </button>
      <p className={styles.hint}>
        Karma is rolled per-character at creation. Affects NPC reactions and class-change eligibility.
      </p>
    </div>
  );
}
