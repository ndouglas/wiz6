import { useUrlState } from '../../lib/hooks/useUrlState.js';
import type { UniqueFilterValues, MonsterSortField } from '../../lib/monsters.js';
import styles from './MonsterFilters.module.css';

const SORT_FIELDS: { value: MonsterSortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'level', label: 'Level' },
  { value: 'ac', label: 'AC' },
  { value: 'hp', label: 'HP' },
  { value: 'xp', label: 'XP-on-kill' },
  { value: 'gold', label: 'Gold' },
];

interface MonsterFiltersProps {
  values: UniqueFilterValues;
}

function FilterDetails({
  label,
  urlKey,
  options,
  formatOption,
}: {
  label: string;
  urlKey: string;
  options: readonly (string | number)[];
  formatOption: (opt: string | number) => string;
}) {
  const [selected, setSelected] = useUrlState.list(urlKey);
  return (
    <details className={styles.filterDetails}>
      <summary>
        {label}
        {selected.length > 0 ? <span className={styles.filterCount}> ({selected.length})</span> : null}
      </summary>
      <div className={styles.filterOptions}>
        {options.map((opt) => {
          const optStr = String(opt);
          const checked = selected.includes(optStr);
          return (
            <label key={optStr}>
              <input
                type="checkbox"
                aria-label={formatOption(opt)}
                checked={checked}
                onChange={() => {
                  if (checked) setSelected(selected.filter((v) => v !== optStr));
                  else setSelected([...selected, optStr]);
                }}
              />
              {optStr}
            </label>
          );
        })}
      </div>
    </details>
  );
}

export function MonsterFilters({ values }: MonsterFiltersProps) {
  const [search, setSearch] = useUrlState('search');
  const [sort, setSort] = useUrlState('sort');
  const [dir, setDir] = useUrlState('dir');
  const [empty, setEmpty] = useUrlState('empty');

  const currentSort = (sort as MonsterSortField | null) ?? 'name';
  const currentDir = dir === 'desc' ? 'desc' : 'asc';

  return (
    <div className={styles.controls}>
      <div className={styles.searchRow}>
        <input
          className={styles.search}
          type="search"
          placeholder="search names…"
          value={search ?? ''}
          onChange={(e) => setSearch(e.target.value || null)}
        />
      </div>

      <div className={styles.sortRow}>
        <label htmlFor="monster-sort">Sort</label>
        <select
          id="monster-sort"
          value={currentSort}
          onChange={(e) => setSort(e.target.value === 'name' ? null : e.target.value)}
        >
          {SORT_FIELDS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.dirButton}
          onClick={() => setDir(currentDir === 'asc' ? 'desc' : null)}
          aria-label={`direction ${currentDir}`}
        >
          {currentDir === 'asc' ? '↑ asc' : '↓ desc'}
        </button>
      </div>

      <div className={styles.toggleRow}>
        <label>
          <input
            type="checkbox"
            checked={empty === '1'}
            onChange={(e) => setEmpty(e.target.checked ? '1' : null)}
          />
          include empty slots
        </label>
      </div>

      <div className={styles.filtersRow}>
        <FilterDetails
          label="class"
          urlKey="class"
          options={values.classes}
          formatOption={(c) => `class ${c}`}
        />
        <FilterDetails
          label="element"
          urlKey="element"
          options={values.elements}
          formatOption={(e) => `element ${e}`}
        />
        <FilterDetails
          label="family"
          urlKey="family"
          options={values.families}
          formatOption={(f) => `family ${f}`}
        />
        <FilterDetails
          label="creature kind"
          urlKey="creatureKind"
          options={values.creatureKinds}
          formatOption={(k) => `kind ${k}`}
        />
        <FilterDetails
          label="sex"
          urlKey="sex"
          options={values.sexes}
          formatOption={(s) => `sex ${s}`}
        />
        <FilterDetails
          label="behavior"
          urlKey="behavior"
          options={values.behaviorClasses}
          formatOption={(b) => `behavior ${b}`}
        />
      </div>
    </div>
  );
}
