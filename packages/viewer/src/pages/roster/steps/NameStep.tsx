import type { CharacterDraft } from '../lib/draft.js';
import styles from './shared.module.css';

interface NameStepProps {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

const MAX_NAME = 7;

export function NameStep({ draft, onUpdate }: NameStepProps) {
  return (
    <div className={styles.step}>
      <label htmlFor="char-name">Name</label>
      <input
        id="char-name"
        type="text"
        value={draft.name}
        maxLength={MAX_NAME}
        onChange={(e) => onUpdate({ name: e.target.value.slice(0, MAX_NAME).toUpperCase() })}
      />
      <p className={styles.counter}>{draft.name.length} / {MAX_NAME}</p>
      <p className={styles.hint}>
        ASCII characters only. Names are uppercase in the engine.
      </p>
    </div>
  );
}
