import type { Character } from '@wiz6/data';
import styles from './RosterView.module.css';

interface Props {
  character: Character;
  fromGallery?: boolean;
  onDownload?: () => void;
}

export function RosterCharacterCard({ character: c, fromGallery, onDownload }: Props) {
  return (
    <article className={styles.card} data-from-gallery={fromGallery || undefined}>
      <header className={styles.cardHeader}>
        <h2 className={styles.name}>{c.name}</h2>
        {fromGallery ? <span className={styles.badge}>from gallery</span> : null}
      </header>
      <dl className={styles.stats}>
        <div><dt>Race</dt><dd>{c.race}</dd></div>
        <div><dt>Class</dt><dd>{c.class}</dd></div>
        <div><dt>Level</dt><dd>{c.level}</dd></div>
        <div><dt>XP</dt><dd>{c.xp}</dd></div>
        <div><dt>Gold</dt><dd>{c.gold}</dd></div>
      </dl>
      {onDownload ? (
        <div className={styles.cardActions}>
          <button type="button" onClick={onDownload}>Download</button>
        </div>
      ) : null}
    </article>
  );
}
