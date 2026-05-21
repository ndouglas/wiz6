import { useParams } from 'react-router-dom';
import { ScenarioDbProvider, useScenarioDb } from '../../lib/hooks/useScenarioDb.js';
import { useUrlState } from '../../lib/hooks/useUrlState.js';
import {
  findMonsterBySlug,
  filterMonsters,
  searchMonsters,
  sortMonsters,
  uniqueFilterValues,
  type MonsterFilter,
  type MonsterSortField,
  type SortDir,
} from '../../lib/monsters.js';
import { MonsterDetail } from './MonsterDetail.js';
import { MonsterFilters } from './MonsterFilters.js';
import { MonsterList } from './MonsterList.js';
import styles from './MonstersPage.module.css';

function MonstersPageInner() {
  const { data, loading, error } = useScenarioDb();
  const { slug } = useParams<{ slug?: string }>();

  const [search] = useUrlState('search');
  const [sort] = useUrlState('sort');
  const [dir] = useUrlState('dir');
  const [empty] = useUrlState('empty');
  const [classes] = useUrlState.list('class');
  const [elements] = useUrlState.list('element');
  const [families] = useUrlState.list('family');
  const [creatureKinds] = useUrlState.list('creatureKind');
  const [sexes] = useUrlState.list('sex');
  const [behaviorClasses] = useUrlState.list('behavior');

  if (loading) return <p className={styles.loading}>loading scenario data…</p>;
  if (error)
    return (
      <div className={styles.errorBox}>
        failed to load scenario data: {error.message}
      </div>
    );
  if (!data) return null;

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

  const filtered = sortMonsters(
    searchMonsters(filterMonsters(data.monsters, filter), search ?? ''),
    sortField,
    sortDir,
  );
  const totalFilled = data.monsters.filter((m) => !m.empty).length;
  const selected = slug ? findMonsterBySlug(data.monsters, slug) : null;
  const filterValues = uniqueFilterValues(data.monsters);

  return (
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
  );
}

export function MonstersPage() {
  return (
    <ScenarioDbProvider>
      <MonstersPageInner />
    </ScenarioDbProvider>
  );
}
