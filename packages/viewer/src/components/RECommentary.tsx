import { useState } from 'react';
import { Link } from 'react-router-dom';
import { findNote, type NoteIndexEntry } from '../data/note-index.js';
import styles from './RECommentary.module.css';

interface Props {
  /** One or more Engineering Notes card IDs to surface here. */
  cardIds: string[];
  /** Optional override for the collapsed-badge label. Default: "RE notes". */
  label?: string;
  /** Optional intro shown above the cards when expanded. */
  intro?: string;
}

/**
 * Contextual "director's commentary" badge that surfaces relevant Engineering
 * Notes cards on a data-explorer page. Collapsed by default. Click to expand
 * the inline summaries — each links to the full card on /explore/notes.
 */
export function RECommentary({ cardIds, label = 'RE notes', intro }: Props) {
  const [open, setOpen] = useState(false);

  const cards: NoteIndexEntry[] = cardIds
    .map((id) => findNote(id))
    .filter((c): c is NoteIndexEntry => c !== undefined);

  if (cards.length === 0) return null;

  return (
    <aside className={styles.commentary} aria-label="Reverse-engineering commentary">
      <button
        type="button"
        className={`${styles.toggle} ${open ? styles.toggleOpen : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={styles.icon} aria-hidden>📜</span>
        <span className={styles.toggleLabel}>{label}</span>
        <span className={styles.count}>{cards.length}</span>
        <span className={styles.chevron} aria-hidden>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className={styles.panel}>
          {intro && <p className={styles.intro}>{intro}</p>}
          <ul className={styles.cardList}>
            {cards.map((c) => (
              <li key={c.id} className={styles.cardItem}>
                <Link to={`/explore/notes#${c.id}`} className={styles.cardLink}>
                  <h3 className={styles.cardTitle}>{c.title}</h3>
                  <p className={styles.cardPitch}>{c.pitch}</p>
                  <div className={styles.cardTags}>
                    {c.tags.map((t) => (
                      <span key={t} className={styles.tag}>{t}</span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <p className={styles.footer}>
            Full cards on <Link to="/explore/notes">Engineering Notes →</Link>
          </p>
        </div>
      )}
    </aside>
  );
}
