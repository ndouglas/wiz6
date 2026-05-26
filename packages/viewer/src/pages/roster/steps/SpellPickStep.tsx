import {
  CLASS_SPELLBOOKS,
  SPELLBOOK_NAMES,
  SCHOOL_NAMES,
  spellsInBook,
} from '@wiz6/data';
import {
  type CharacterDraft,
  expectedSpellPickCount,
} from '../lib/draft.js';
import styles from './shared.module.css';
import spellStyles from './SpellPickStep.module.css';

interface Props {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

export function SpellPickStep({ draft, onUpdate }: Props) {
  if (draft.classIdx === null) {
    return <div className={styles.step}><p>Pick a class first.</p></div>;
  }

  const totalPicks = expectedSpellPickCount(draft.classIdx);
  if (totalPicks === 0) {
    return <div className={styles.step}><p>This class has no starter spells. Continue.</p></div>;
  }

  const books = CLASS_SPELLBOOKS[draft.classIdx]!;
  const picksByBook: Record<number, number> = {};
  for (const p of draft.starterSpells) picksByBook[p.bookIdx] = (picksByBook[p.bookIdx] ?? 0) + 1;

  function togglePick(bookIdx: number, entryIdx: number) {
    const existingIdx = draft.starterSpells.findIndex(
      (p) => p.bookIdx === bookIdx && p.entryIdx === entryIdx
    );
    if (existingIdx >= 0) {
      const next = [...draft.starterSpells];
      next.splice(existingIdx, 1);
      onUpdate({ starterSpells: next });
    } else {
      const allowed = books[bookIdx]!;
      if ((picksByBook[bookIdx] ?? 0) >= allowed) return;
      onUpdate({ starterSpells: [...draft.starterSpells, { bookIdx, entryIdx }] });
    }
  }

  return (
    <div className={styles.step}>
      <p style={{ fontWeight: 600 }}>
        {draft.starterSpells.length} of {totalPicks} spells picked.
      </p>
      <p className={styles.hint}>
        Spell names are placeholders ("School Lv N"). Decoding canonical names is a later task.
      </p>
      {books.map((count, bookIdx) => {
        if (count === 0) return null;
        const taken = picksByBook[bookIdx] ?? 0;
        return (
          <section key={bookIdx} className={spellStyles.book}>
            <h3>
              {SPELLBOOK_NAMES[bookIdx]} book — {taken} of {count} picked
            </h3>
            <div className={spellStyles.grid}>
              {spellsInBook(bookIdx).map(({ entryIdx, entry }) => {
                const picked = draft.starterSpells.some(
                  (p) => p.bookIdx === bookIdx && p.entryIdx === entryIdx
                );
                return (
                  <button
                    key={entryIdx}
                    type="button"
                    className={spellStyles.spell}
                    aria-pressed={picked}
                    data-picked={picked || undefined}
                    onClick={() => togglePick(bookIdx, entryIdx)}
                  >
                    {SCHOOL_NAMES[entry.school]} Lv {entry.level} #{entryIdx}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
