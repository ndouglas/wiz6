import type { ScenarioMonster } from '@wiz6/data';
import { slugify } from './slug.js';

export type MonsterSortField = 'name' | 'level' | 'ac' | 'hp' | 'xp' | 'gold';
export type SortDir = 'asc' | 'desc';

export interface MonsterFilter {
  classes?: readonly number[];
  elements?: readonly number[];
  families?: readonly string[]; // "a,b,c,d" stringified familyId tuples
  creatureKinds?: readonly number[];
  sexes?: readonly number[];
  behaviorClasses?: readonly number[];
  includeEmpty?: boolean;
}

/**
 * Slug for routing. When `allMonsters` is provided AND another non-empty
 * record shares the same `nameIdSingular`, the slug is suffixed with `-N`
 * (where N is the 1-based ordinal of this record among same-named records,
 * ordered by `index`). The first same-named record keeps the bare slug for
 * backwards-compatibility with existing URLs.
 *
 * Empty-name slots always slug as `slot-${index}` regardless of `allMonsters`.
 */
export function monsterSlug(
  m: ScenarioMonster,
  allMonsters?: readonly ScenarioMonster[],
): string {
  if (!m.nameIdSingular) return `slot-${m.index}`;
  const base = slugify(m.nameIdSingular);
  if (!allMonsters) return base;
  const ordinal = nameOrdinal(m, allMonsters);
  return ordinal <= 1 ? base : `${base}-${ordinal}`;
}

/**
 * Display name with `(#N)` suffix when shared with another non-empty record.
 * Returns plain `nameIdSingular` otherwise (or `(empty slot N)` for empties).
 */
export function monsterDisplayName(
  m: ScenarioMonster,
  allMonsters?: readonly ScenarioMonster[],
): string {
  if (!m.nameIdSingular) return `(empty slot ${m.index})`;
  if (!allMonsters) return m.nameIdSingular;
  const sameName = sameNameRecords(m, allMonsters);
  if (sameName.length <= 1) return m.nameIdSingular;
  const ordinal = sameName.findIndex((o) => o.index === m.index) + 1;
  return `${m.nameIdSingular} (#${ordinal})`;
}

function sameNameRecords(
  m: ScenarioMonster,
  allMonsters: readonly ScenarioMonster[],
): ScenarioMonster[] {
  return allMonsters
    .filter((o) => !o.empty && o.nameIdSingular === m.nameIdSingular)
    .sort((a, b) => a.index - b.index);
}

function nameOrdinal(m: ScenarioMonster, allMonsters: readonly ScenarioMonster[]): number {
  const sameName = sameNameRecords(m, allMonsters);
  if (sameName.length <= 1) return 1;
  return sameName.findIndex((o) => o.index === m.index) + 1;
}

export function findMonsterBySlug(
  monsters: readonly ScenarioMonster[],
  slug: string,
): ScenarioMonster | null {
  // Try disambiguated slug first
  const exact = monsters.find((m) => monsterSlug(m, monsters) === slug);
  if (exact) return exact;
  // Accept `<name>-1` as an alias for the bare slug (the first same-named record)
  const m1 = slug.match(/^(.+)-1$/);
  if (m1) {
    const base = m1[1]!;
    return monsters.find((m) => monsterSlug(m, monsters) === base) ?? null;
  }
  return null;
}

export function searchMonsters(
  monsters: readonly ScenarioMonster[],
  query: string,
): ScenarioMonster[] {
  const q = query.trim().toLowerCase();
  if (q === '') return monsters.slice();
  return monsters.filter((m) => {
    const haystack = [m.nameIdSingular, m.nameIdPlural, m.nameUnidSingular, m.nameUnidPlural]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function familyKey(familyId: readonly number[]): string {
  return familyId.join(',');
}

export function filterMonsters(
  monsters: readonly ScenarioMonster[],
  filter: MonsterFilter,
): ScenarioMonster[] {
  const includeEmpty = filter.includeEmpty ?? false;
  return monsters.filter((m) => {
    if (!includeEmpty && m.empty) return false;
    if (filter.classes && filter.classes.length > 0 && !filter.classes.includes(m.monsterClass))
      return false;
    if (
      filter.elements &&
      filter.elements.length > 0 &&
      !filter.elements.includes(m.specialAttackElement)
    )
      return false;
    if (
      filter.families &&
      filter.families.length > 0 &&
      !filter.families.includes(familyKey(m.familyId))
    )
      return false;
    if (
      filter.creatureKinds &&
      filter.creatureKinds.length > 0 &&
      !filter.creatureKinds.includes(m.creatureKind)
    )
      return false;
    if (filter.sexes && filter.sexes.length > 0 && !filter.sexes.includes(m.monsterSex))
      return false;
    if (
      filter.behaviorClasses &&
      filter.behaviorClasses.length > 0 &&
      !filter.behaviorClasses.includes(m.monsterBehaviorClass)
    )
      return false;
    return true;
  });
}

function compareNumbers(a: number, b: number): number {
  return a - b;
}

function sortKey(m: ScenarioMonster, field: MonsterSortField): number | string {
  switch (field) {
    case 'name':
      return m.nameIdSingular || `~slot-${m.index}`; // empty names sort to end
    case 'level':
      return m.monsterLevel;
    case 'ac':
      return m.monsterAC;
    case 'hp':
      return m.hpDiceCount * (m.hpDiceSides + 1); // approximate expected HP
    case 'xp':
      return m.xpOnKill;
    case 'gold':
      return m.goldStat;
  }
}

export function sortMonsters(
  monsters: readonly ScenarioMonster[],
  field: MonsterSortField,
  dir: SortDir,
): ScenarioMonster[] {
  const decorated = monsters.map((m, i) => ({ m, i, k: sortKey(m, field) }));
  decorated.sort((a, b) => {
    let cmp: number;
    if (typeof a.k === 'string' && typeof b.k === 'string') cmp = a.k.localeCompare(b.k);
    else cmp = compareNumbers(a.k as number, b.k as number);
    if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
    return a.i - b.i; // stable tiebreaker
  });
  return decorated.map((d) => d.m);
}

export interface UniqueFilterValues {
  classes: number[];
  elements: number[];
  families: string[];
  creatureKinds: number[];
  sexes: number[];
  behaviorClasses: number[];
}

export function uniqueFilterValues(monsters: readonly ScenarioMonster[]): UniqueFilterValues {
  const filled = monsters.filter((m) => !m.empty);
  const collect = <K extends keyof ScenarioMonster>(key: K): number[] => {
    const seen = new Set<number>();
    for (const m of filled) seen.add(m[key] as unknown as number);
    return Array.from(seen);
  };
  const families = Array.from(new Set(filled.map((m) => familyKey(m.familyId))));
  return {
    classes: collect('monsterClass'),
    elements: collect('specialAttackElement'),
    families,
    creatureKinds: collect('creatureKind'),
    sexes: collect('monsterSex'),
    behaviorClasses: collect('monsterBehaviorClass'),
  };
}

export function formatLevelRange(min: number, max: number): string {
  if (min === max) return String(min);
  return `${min}-${max}`;
}

export function formatHpDice(count: number, sides: number): string {
  if (count === 0 || sides === 0) return '—';
  return `${count}d${sides}`;
}

export function formatAttackDice(count: number, sides: number): string {
  if (count === 0 || sides === 0) return '—';
  return `${count}d${sides}`;
}
