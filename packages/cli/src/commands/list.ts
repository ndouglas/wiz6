import { parseArgs } from 'node:util';
import {
  filterMonsters,
  monsterSlug,
  sortMonsters,
  type MonsterFilter,
  type MonsterSortField,
  type SortDir,
} from '@wiz6/parser';
import type { ScenarioMonster } from '@wiz6/data';
import { loadScenarioDb, resolveOriginalDir } from '../lib/loaders.js';
import { formatTable } from '../lib/format.js';
import type { CliIO } from '../index.js';

interface ListOpts {
  cwd: string;
  io: CliIO;
}

const VALID_SORT_FIELDS = ['name', 'level', 'ac', 'hp', 'xp', 'gold'] as const;

export function runListCommand(args: readonly string[], opts: ListOpts): number {
  const type = args[0];
  if (!type) {
    opts.io.writeErr(`usage: wiz6 list <type> [flags]\n\nknown types: monsters\n`);
    return 1;
  }

  if (type !== 'monsters') {
    opts.io.writeErr(`unknown type: ${type}\n\nknown types: monsters\n`);
    return 1;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: [...args.slice(1)],
      options: {
        original: { type: 'string' },
        class: { type: 'string', multiple: true },
        element: { type: 'string', multiple: true },
        family: { type: 'string', multiple: true },
        sex: { type: 'string', multiple: true },
        sort: { type: 'string' },
        dir: { type: 'string' },
        limit: { type: 'string' },
        empty: { type: 'boolean' },
        json: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (err) {
    opts.io.writeErr(`bad args: ${(err as Error).message}\n`);
    return 1;
  }

  const flags = parsed.values;
  const sortField = (flags.sort as MonsterSortField | undefined) ?? 'name';
  if (!VALID_SORT_FIELDS.includes(sortField)) {
    opts.io.writeErr(
      `bad --sort: ${sortField}. Valid: ${VALID_SORT_FIELDS.join(', ')}\n`,
    );
    return 1;
  }
  const dir: SortDir = flags.dir === 'desc' ? 'desc' : 'asc';
  const limit = flags.limit ? Number(flags.limit) : null;
  if (limit !== null && (!Number.isFinite(limit) || limit < 0)) {
    opts.io.writeErr(`bad --limit: ${flags.limit}\n`);
    return 1;
  }

  let originalDir: string;
  try {
    originalDir = resolveOriginalDir({
      cwd: opts.cwd,
      override: (flags.original as string | undefined) ?? null,
    });
  } catch (err) {
    opts.io.writeErr(`${(err as Error).message}\n`);
    return 1;
  }

  const db = loadScenarioDb(originalDir);

  const filter: MonsterFilter = { includeEmpty: flags.empty === true };
  const classes = flags.class as string[] | undefined;
  if (classes) filter.classes = classes.map(Number);
  const elements = flags.element as string[] | undefined;
  if (elements) filter.elements = elements.map(Number);
  const families = flags.family as string[] | undefined;
  if (families) filter.families = families;
  const sexes = flags.sex as string[] | undefined;
  if (sexes) filter.sexes = sexes.map(Number);
  const filtered = filterMonsters(db.monsters, filter);
  const sorted = sortMonsters(filtered, sortField, dir);
  const limited: ScenarioMonster[] = limit !== null ? sorted.slice(0, limit) : sorted.slice();

  if (flags.json === true) {
    opts.io.write(JSON.stringify(limited, null, 2) + '\n');
    return 0;
  }

  const headers = ['slug', 'name', 'class', 'level', 'ac', 'hp', 'xp', 'gold'];
  const rows = limited.map((m) => [
    monsterSlug(m),
    m.nameIdSingular || '(empty)',
    String(m.monsterClass),
    m.monsterLevel === m.monsterLevelMax
      ? String(m.monsterLevel)
      : `${m.monsterLevel}-${m.monsterLevelMax}`,
    String(m.monsterAC),
    `${m.hpDiceCount}d${m.hpDiceSides}`,
    m.xpOnKill.toLocaleString(),
    String(m.goldStat),
  ]);
  const numeric = [false, false, true, true, true, false, true, true];
  opts.io.write(formatTable(headers, rows, { numeric }) + '\n');
  return 0;
}
