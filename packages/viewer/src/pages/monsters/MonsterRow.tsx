import { useNavigate } from 'react-router-dom';
import type { ScenarioMonster } from '@wiz6/data';
import { monsterSlug, formatLevelRange } from '@wiz6/parser';
import { useUrlState } from '../../lib/hooks/useUrlState.js';
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
  const name = monster.nameIdSingular || `(empty slot ${monster.index})`;
  const range = formatLevelRange(monster.monsterLevel, monster.monsterLevelMax);
  const [compareIds, setCompareIds] = useUrlState.list('ids');
  const inCompare = compareIds.includes(slug);
  const rowClass = `${styles.row} ${classClass} ${selected ? styles.rowActive : ''} ${inCompare ? styles.rowCompare : ''}`.trim();

  return (
    <button
      type="button"
      className={rowClass}
      aria-current={selected ? 'true' : undefined}
      onClick={(event) => {
        if (event.shiftKey) {
          if (inCompare) {
            setCompareIds(compareIds.filter((id) => id !== slug));
          } else if (compareIds.length < 4) {
            setCompareIds([...compareIds, slug]);
          }
          return;
        }
        navigate(`/explore/monsters/${slug}`);
      }}
    >
      <span className={styles.name}>
        {inCompare ? <span className={styles.compareBadge}>{compareIds.indexOf(slug) + 1}</span> : null}
        {name}
      </span>
      <span className={styles.level}>lvl {range}</span>
      <span className={styles.ac}>AC {monster.monsterAC}</span>
    </button>
  );
}
