import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScenarioDbProvider, useScenarioDb } from '../../lib/hooks/useScenarioDb.js';
import { useUrlState } from '../../lib/hooks/useUrlState.js';
import { useKeyboardShortcuts } from '../../lib/hooks/useKeyboardShortcuts.js';
import {
  findMonsterBySlug,
  filterMonsters,
  monsterSlug,
  searchMonsters,
  sortMonsters,
  uniqueFilterValues,
  type MonsterFilter,
  type MonsterSortField,
  type SortDir,
} from '@wiz6/parser';
import { MonsterFilters } from './MonsterFilters.js';
import { MonsterList } from './MonsterList.js';
import { MonsterDetail } from './MonsterDetail.js';
import { KeyboardHelp } from './KeyboardHelp.js';
import styles from './MonstersPage.module.css';

function MonstersPageInner() {
  const { data, loading, error } = useScenarioDb();
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);

  const [search] = useUrlState('search');
  const [, setTab] = useUrlState('tab');
  const [sort] = useUrlState('sort');
  const [dir] = useUrlState('dir');
  const [empty] = useUrlState('empty');
  const [classes] = useUrlState.list('class');
  const [elements] = useUrlState.list('element');
  const [families] = useUrlState.list('family');
  const [creatureKinds] = useUrlState.list('creatureKind');
  const [sexes] = useUrlState.list('sex');
  const [behaviorClasses] = useUrlState.list('behavior');

  const filtered = useMemo(() => {
    if (!data) return [];
    const filter: MonsterFilter = {
      classes: classes.map(Number),
      elements: elements.map(Number),
      families,
      creatureKinds: creatureKinds.map(Number),
      sexes: sexes.map(Number),
      behaviorClasses: behaviorClasses.map(Number),
      includeEmpty: empty === '1',
    };
    const sortField = (sort as MonsterSortField | null) ?? 'name';
    const sortDir: SortDir = dir === 'desc' ? 'desc' : 'asc';
    return sortMonsters(
      searchMonsters(filterMonsters(data.monsters, filter), search ?? ''),
      sortField,
      sortDir,
    );
  }, [
    data,
    classes,
    elements,
    families,
    creatureKinds,
    sexes,
    behaviorClasses,
    empty,
    sort,
    dir,
    search,
  ]);

  useKeyboardShortcuts({
    ArrowDown: () => {
      if (filtered.length === 0) return;
      const idx = slug ? filtered.findIndex((m) => monsterSlug(m) === slug) : -1;
      const nextIdx = idx + 1 < filtered.length ? idx + 1 : 0;
      navigate(`/monsters/${monsterSlug(filtered[nextIdx]!)}`);
    },
    ArrowUp: () => {
      if (filtered.length === 0) return;
      const idx = slug ? filtered.findIndex((m) => monsterSlug(m) === slug) : 0;
      const prevIdx = idx > 0 ? idx - 1 : filtered.length - 1;
      navigate(`/monsters/${monsterSlug(filtered[prevIdx]!)}`);
    },
    '1': () => setTab(null),
    '2': () => setTab('attacks'),
    '3': () => setTab('saves'),
    '/': (e) => {
      e.preventDefault();
      const input = document.querySelector<HTMLInputElement>(
        'input[type="search"]',
      );
      input?.focus();
    },
    '?': () => setHelpOpen(true),
    Escape: () => setHelpOpen(false),
  });

  if (loading) return <p className={styles.loading}>loading scenario data…</p>;
  if (error)
    return (
      <div className={styles.errorBox}>
        failed to load scenario data: {error.message}
      </div>
    );
  if (!data) return null;

  const totalFilled = data.monsters.filter((m) => !m.empty).length;
  const selected = slug ? findMonsterBySlug(data.monsters, slug) : null;
  const filterValues = uniqueFilterValues(data.monsters);

  return (
    <>
      <div className={styles.page}>
        <section className={styles.list} aria-label="monster list">
          <MonsterFilters values={filterValues} />
          <MonsterList monsters={filtered} totalFilled={totalFilled} />
        </section>
        <section className={styles.detail} aria-label="monster detail">
          {slug && !selected ? (
            <p className={styles.emptyDetail}>no monster matches slug "{slug}"</p>
          ) : !selected ? (
            <p className={styles.emptyDetail}>
              Select a monster from the list to view its details.
            </p>
          ) : (
            <MonsterDetail monster={selected} />
          )}
        </section>
      </div>
      <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}

export function MonstersPage() {
  return (
    <ScenarioDbProvider>
      <MonstersPageInner />
    </ScenarioDbProvider>
  );
}
