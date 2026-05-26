import { CLASS_INDEX_TO_NAME, RACE_BASE_STATS } from '@wiz6/data';
import { computeTotalAttributes, type CharacterDraft } from '../lib/draft.js';
import styles from './shared.module.css';
import reviewStyles from './ReviewStep.module.css';

interface Props {
  draft: CharacterDraft;
  onCreate: () => void;
}

export function ReviewStep({ draft, onCreate }: Props) {
  const total = computeTotalAttributes(draft);
  const race = draft.raceIdx !== null ? RACE_BASE_STATS[draft.raceIdx]?.name : '?';
  const klassRaw = draft.classIdx !== null ? CLASS_INDEX_TO_NAME[draft.classIdx] : undefined;
  const klass = klassRaw == null ? '?' : (typeof klassRaw === 'string' ? klassRaw : (klassRaw as { name: string }).name);

  return (
    <div className={styles.step}>
      <div className={reviewStyles.card}>
        <h2>{draft.name}</h2>
        <p className={reviewStyles.meta}>
          {race} {klass} · Karma {draft.karma} · Portrait #{(total?.spd ?? 0) + 1}
        </p>
        <dl className={reviewStyles.stats}>
          <dt>STR</dt><dd>{total?.str}</dd>
          <dt>IQ</dt><dd>{total?.iq}</dd>
          <dt>PIE</dt><dd>{total?.pie}</dd>
          <dt>VIT</dt><dd>{total?.vit}</dd>
          <dt>DEX</dt><dd>{total?.dex}</dd>
          <dt>SPD</dt><dd>{total?.spd}</dd>
          <dt>PER</dt><dd>{total?.per}</dd>
          <dt>KAR</dt><dd>{draft.karma}</dd>
        </dl>
        <p className={reviewStyles.spells}>
          Starter spells: {draft.starterSpells.length || 'none'}
        </p>
      </div>
      <button type="button" onClick={onCreate} className={reviewStyles.create}>
        Create character
      </button>
    </div>
  );
}
