import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ScenarioMonster } from '@wiz6/data';
import { familyKey, monsterSlug } from '@wiz6/parser';
import styles from './MonsterListFamilies.module.css';

interface MonsterListFamiliesProps {
  monsters: readonly ScenarioMonster[];
  totalFilled: number;
}

interface FamilyGroup {
  key: string;
  members: ScenarioMonster[];
}

function group(monsters: readonly ScenarioMonster[]): FamilyGroup[] {
  const map = new Map<string, ScenarioMonster[]>();
  for (const m of monsters) {
    if (m.empty) continue;
    const k = familyKey(m.familyId);
    const list = map.get(k) ?? [];
    list.push(m);
    map.set(k, list);
  }
  return Array.from(map.entries())
    .map(([key, members]) => ({ key, members }))
    .sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
}

export function MonsterListFamilies({ monsters, totalFilled }: MonsterListFamiliesProps) {
  const navigate = useNavigate();
  const groups = group(monsters);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (k: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <>
      <div className={styles.list}>
        {groups.map(({ key, members }) => (
          <div key={key} className={styles.family}>
            <button
              type="button"
              className={styles.familyHeader}
              onClick={() => toggle(key)}
              aria-expanded={!collapsed.has(key)}
            >
              <span>{key}</span>
              <span>
                ({members.length} member{members.length === 1 ? '' : 's'})
              </span>
            </button>
            {!collapsed.has(key) ? (
              <ul className={styles.familyMembers}>
                {members.map((m) => (
                  <li key={m.index}>
                    <button
                      type="button"
                      className={styles.member}
                      onClick={() => navigate(`/explore/monsters/${monsterSlug(m)}`)}
                    >
                      {m.nameIdSingular || `(empty slot ${m.index})`}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
      <p className={styles.footer}>
        showing {monsters.filter((m) => !m.empty).length} / {totalFilled}
      </p>
    </>
  );
}
