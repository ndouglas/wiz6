import { useParams } from 'react-router-dom';
import { ScenarioDbProvider, useScenarioDb } from '../../lib/hooks/useScenarioDb.js';
import { findMonsterBySlug } from '../../lib/monsters.js';
import styles from './MonstersPage.module.css';

function MonstersPageInner() {
  const { data, loading, error } = useScenarioDb();
  const { slug } = useParams<{ slug?: string }>();

  if (loading) return <p className={styles.loading}>loading scenario data…</p>;
  if (error)
    return (
      <div className={styles.errorBox}>
        failed to load scenario data: {error.message}
      </div>
    );
  if (!data) return null;

  const selected = slug ? findMonsterBySlug(data.monsters, slug) : null;

  return (
    <div className={styles.page}>
      <section className={styles.list} aria-label="monster list">
        {/* Placeholder until Task 5 wires the list. */}
        <p style={{ padding: 'var(--space-4)', color: 'var(--color-text-faint)' }}>
          list pane
        </p>
      </section>
      <section className={styles.detail} aria-label="monster detail">
        {slug && !selected ? (
          <p className={styles.emptyDetail}>no monster matches slug "{slug}"</p>
        ) : !selected ? (
          <p className={styles.emptyDetail}>
            Select a monster from the list to view its details.
          </p>
        ) : (
          <>
            {/* Placeholder header — full MonsterDetail comes in Task 7. */}
            <h2>{selected.nameIdSingular}</h2>
          </>
        )}
      </section>
    </div>
  );
}

export function MonstersPage() {
  return (
    <ScenarioDbProvider>
      <MonstersPageInner />
    </ScenarioDbProvider>
  );
}
