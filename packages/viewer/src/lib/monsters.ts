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

export function monsterSlug(m: ScenarioMonster): string {
  if (m.nameIdSingular) return slugify(m.nameIdSingular);
  return `slot-${m.index}`;
}

export function findMonsterBySlug(
  monsters: readonly ScenarioMonster[],
  slug: string,
): ScenarioMonster | null {
  return monsters.find((m) => monsterSlug(m) === slug) ?? null;
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
