import { useParams } from 'react-router-dom';
import type { ScenarioMonster } from '@wiz6/data';
import { monsterSlug } from '@wiz6/parser';
import { MonsterRow } from './MonsterRow.js';
import styles from './MonsterList.module.css';

interface MonsterListProps {
  monsters: readonly ScenarioMonster[];
  totalFilled: number;
}

export function MonsterList({ monsters, totalFilled }: MonsterListProps) {
  const { slug } = useParams<{ slug?: string }>();
  return (
    <>
      <div className={styles.list} role="list">
        {monsters.map((m) => (
          <MonsterRow
            key={m.index}
            monster={m}
            selected={!!slug && monsterSlug(m) === slug}
          />
        ))}
      </div>
      <p className={styles.footer}>
        showing {monsters.length} / {totalFilled}
      </p>
    </>
  );
}
