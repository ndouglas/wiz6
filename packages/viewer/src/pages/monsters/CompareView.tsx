import type { ScenarioMonster } from '@wiz6/data';
import { findMonsterBySlug, formatHpDice, formatLevelRange } from '@wiz6/parser';
import { useUrlState } from '../../lib/hooks/useUrlState.js';
import styles from './CompareView.module.css';

interface CompareViewProps {
  allMonsters: readonly ScenarioMonster[];
}

type Row = {
  label: string;
  read: (m: ScenarioMonster) => string;
};

const ROWS: Row[] = [
  { label: 'class', read: (m) => String(m.monsterClass) },
  { label: 'sub-class', read: (m) => String(m.monsterSubClass) },
  { label: 'level', read: (m) => formatLevelRange(m.monsterLevel, m.monsterLevelMax) },
  { label: 'ac', read: (m) => String(m.monsterAC) },
  { label: 'hp', read: (m) => formatHpDice(m.hpDiceCount, m.hpDiceSides) },
  { label: 'xp', read: (m) => m.xpOnKill.toLocaleString() },
  { label: 'gold', read: (m) => String(m.goldStat) },
  { label: 'element', read: (m) => String(m.specialAttackElement) },
  { label: 'sex', read: (m) => String(m.monsterSex) },
  { label: 'creature kind', read: (m) => String(m.creatureKind) },
  { label: 'behavior', read: (m) => String(m.monsterBehaviorClass) },
  { label: 'sprite group', read: (m) => String(m.spriteGroup) },
  { label: 'move stat', read: (m) => String(m.moveStat) },
  { label: 'family', read: (m) => m.familyId.join(',') },
  { label: 'magic resist', read: (m) => `${m.magicResistChance}%` },
  { label: 'spell power', read: (m) => `${m.spellPowerChance}%` },
  { label: 'fly evade', read: (m) => `${m.flyEvadeChance}%` },
  { label: 'combat sprite', read: (m) => String(m.combatSpriteId) },
  { label: 'secondary sprite', read: (m) => String(m.secondarySpriteId) },
  { label: 'save table', read: (m) => `[${m.saveTable.join(',')}]` },
  { label: 'effect chance', read: (m) => `[${m.effectChanceTable.join(',')}]` },
  { label: 'attribute saves', read: (m) => `[${m.attributeSaves.join(',')}]` },
];

interface Column {
  id: string;
  monster: ScenarioMonster | null;
}

export function CompareView({ allMonsters }: CompareViewProps) {
  const [ids, setIds] = useUrlState.list('ids');

  if (ids.length === 0) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.empty}>no monsters selected — shift-click rows in the list to add</p>
      </div>
    );
  }

  const columns: Column[] = ids.slice(0, 4).map((id) => ({
    id,
    monster: findMonsterBySlug(allMonsters, id),
  }));

  const removeAt = (id: string) => () => setIds(ids.filter((i) => i !== id));

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.fieldHeader}>field</th>
            {columns.map((col) => (
              <th key={col.id} className={styles.colHeader} scope="col">
                <div className={styles.colName}>
                  {col.monster ? col.monster.nameIdSingular : (
                    <span className={styles.notFound}>{col.id} (not found)</span>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.removeBtn}
                  aria-label={`remove ${col.id}`}
                  onClick={removeAt(col.id)}
                >
                  remove
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const values = columns.map((col) =>
              col.monster ? row.read(col.monster) : '—',
            );
            const allSame = values.every((v) => v === values[0]);
            return (
              <tr key={row.label}>
                <th className={styles.fieldHeader} scope="row">
                  {row.label}
                </th>
                {values.map((v, i) => (
                  <td
                    key={columns[i]!.id}
                    className={`${styles.cell} ${!allSame ? styles.diff : ''}`.trim()}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
