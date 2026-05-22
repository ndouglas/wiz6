import { useNavigate } from 'react-router-dom';
import type { ScenarioMonster } from '@wiz6/data';
import { familyKey, monsterSlug, monsterDisplayName } from '@wiz6/parser';

interface FamilyTabProps {
  monster: ScenarioMonster;
  allMonsters: readonly ScenarioMonster[];
}

export function FamilyTab({ monster, allMonsters }: FamilyTabProps) {
  const navigate = useNavigate();
  const key = familyKey(monster.familyId);
  const family = allMonsters.filter(
    (m) =>
      !m.empty &&
      m.index !== monster.index &&
      familyKey(m.familyId) === key,
  );

  return (
    <div>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Family ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{key}</span>
      </p>
      <h3 style={{ marginTop: 'var(--space-4)' }}>{monster.nameIdSingular}</h3>
      {family.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>
          no other monsters in this family
        </p>
      ) : (
        <ul
          aria-label="family members"
          style={{ listStyle: 'none', padding: 0, margin: 0 }}
        >
          {family.map((m) => (
            <li key={m.index} style={{ marginBottom: 'var(--space-1)' }}>
              <button
                type="button"
                onClick={() => navigate(`/explore/monsters/${monsterSlug(m, allMonsters)}`)}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                  padding: 'var(--space-1) var(--space-3)',
                  borderRadius: 2,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.92rem',
                }}
              >
                {monsterDisplayName(m, allMonsters)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
