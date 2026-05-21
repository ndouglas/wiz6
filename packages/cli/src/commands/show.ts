import { parseArgs } from 'node:util';
import { findMonsterBySlug } from '@wiz6/parser';
import type { ScenarioMonster } from '@wiz6/data';
import { loadScenarioDb, resolveOriginalDir } from '../lib/loaders.js';
import type { CliIO } from '../index.js';

interface ShowOpts {
  cwd: string;
  io: CliIO;
}

function findMonster(
  monsters: readonly ScenarioMonster[],
  id: string,
): ScenarioMonster | null {
  if (/^\d+$/.test(id)) {
    const idx = Number(id);
    return monsters[idx] ?? null;
  }
  return findMonsterBySlug(monsters, id);
}

function renderMonster(m: ScenarioMonster): string {
  const lines: string[] = [];
  lines.push(`[${m.index}] ${m.nameIdSingular || '(empty)'}`);
  if (m.nameIdPlural) lines.push(`  pl-id    : ${m.nameIdPlural}`);
  if (m.nameUnidSingular) lines.push(`  unid-sg  : ${m.nameUnidSingular}`);
  if (m.nameUnidPlural) lines.push(`  unid-pl  : ${m.nameUnidPlural}`);
  lines.push('');
  const fields: [string, unknown][] = [
    ['empty', m.empty],
    ['xpOnKill', m.xpOnKill],
    ['monsterClass', m.monsterClass],
    ['monsterSubClass', m.monsterSubClass],
    ['monsterLevel', m.monsterLevel],
    ['monsterLevelMax', m.monsterLevelMax],
    ['monsterAC', m.monsterAC],
    ['hpDice', `${m.hpDiceCount}d${m.hpDiceSides}`],
    ['groupDice', `${m.groupDiceCount}d${m.groupDiceSides}`],
    ['monsterSex', m.monsterSex],
    ['creatureKind', m.creatureKind],
    ['monsterBehaviorClass', m.monsterBehaviorClass],
    ['spriteGroup', m.spriteGroup],
    ['moveStat', m.moveStat],
    ['goldStat', m.goldStat],
    ['specialAttackElement', m.specialAttackElement],
    ['familyId', m.familyId.join(',')],
    ['saveTable', JSON.stringify(m.saveTable)],
    ['effectChanceTable', JSON.stringify(m.effectChanceTable)],
    ['extendedSaves', JSON.stringify(m.extendedSaves)],
    ['attributeSaves', JSON.stringify(m.attributeSaves)],
    ['attack1', `${m.attack1DiceCount}d${m.attack1DiceSides} +${m.attack1DamageBonus} (special ${m.attack1SpecialChance}%)`],
    ['attack2', `${m.attack2DiceCount}d${m.attack2DiceSides} +${m.attack2DamageBonus} (special ${m.attack2SpecialChance}%)`],
    ['attack3', `${m.attack3DiceCount}d${m.attack3DiceSides} +${m.attack3DamageBonus} (special ${m.attack3SpecialChance}%)`],
    ['attack1Extra', JSON.stringify(m.attack1Extra)],
    ['attack2Extra', JSON.stringify(m.attack2Extra)],
    ['attack3Extra', JSON.stringify(m.attack3Extra)],
    ['combatSpriteId', m.combatSpriteId],
    ['combatSpriteAlt', m.combatSpriteAlt],
    ['secondarySpriteId', m.secondarySpriteId],
    ['magicResistChance', m.magicResistChance],
    ['spellPowerChance', m.spellPowerChance],
    ['flyEvadeChance', m.flyEvadeChance],
    ['combatTraitId', m.combatTraitId],
    ['auxSave103', m.auxSave103],
    ['auxSave106', m.auxSave106],
  ];
  const labelWidth = Math.max(...fields.map(([k]) => k.length));
  for (const [k, v] of fields) {
    lines.push(`  ${k.padEnd(labelWidth)}  ${v}`);
  }
  return lines.join('\n') + '\n';
}

export function runShowCommand(args: readonly string[], opts: ShowOpts): number {
  const type = args[0];
  const id = args[1];
  if (!type || !id) {
    opts.io.writeErr(`usage: wiz6 show <type> <slug|index> [--json]\n\nknown types: monster\n`);
    return 1;
  }
  if (type !== 'monster') {
    opts.io.writeErr(`unknown type: ${type}\n\nknown types: monster\n`);
    return 1;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: [...args.slice(2)],
      options: {
        original: { type: 'string' },
        json: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (err) {
    opts.io.writeErr(`bad args: ${(err as Error).message}\n`);
    return 1;
  }

  let originalDir: string;
  try {
    originalDir = resolveOriginalDir({
      cwd: opts.cwd,
      override: (parsed.values.original as string | undefined) ?? null,
    });
  } catch (err) {
    opts.io.writeErr(`${(err as Error).message}\n`);
    return 1;
  }

  const db = loadScenarioDb(originalDir);
  const m = findMonster(db.monsters, id);
  if (!m) {
    opts.io.writeErr(`no monster matches ${id}\n`);
    return 1;
  }

  if (parsed.values.json === true) {
    opts.io.write(JSON.stringify(m, null, 2) + '\n');
  } else {
    opts.io.write(renderMonster(m));
  }
  return 0;
}
