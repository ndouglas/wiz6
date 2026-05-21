import { useNavigate } from 'react-router-dom';
import type { ScenarioMonster } from '@wiz6/data';
import { monsterSlug, formatLevelRange } from '../../lib/monsters.js';
import styles from './MonsterList.module.css';

interface MonsterRowProps {
  monster: ScenarioMonster;
  selected: boolean;
}

const CLASS_STYLES: Record<number, string> = {
  1: styles.rowClass1!,
  2: styles.rowClass2!,
  3: styles.rowClass3!,
  4: styles.rowClass4!,
};

export function MonsterRow({ monster, selected }: MonsterRowProps) {
  const navigate = useNavigate();
  const slug = monsterSlug(monster);
  const classClass = CLASS_STYLES[monster.monsterClass] ?? '';
  const rowClass = `${styles.row} ${classClass} ${selected ? styles.rowActive : ''}`.trim();
  const name = monster.nameIdSingular || `(empty slot ${monster.index})`;
  const range = formatLevelRange(monster.monsterLevel, monster.monsterLevelMax);

  return (
    <button
      type="button"
      className={rowClass}
      aria-current={selected ? 'true' : undefined}
      onClick={() => navigate(`/monsters/${slug}`)}
    >
      <span className={styles.name}>{name}</span>
      <span className={styles.level}>lvl {range}</span>
      <span className={styles.ac}>AC {monster.monsterAC}</span>
    </button>
  );
}
