import { Link } from 'react-router-dom';
import type { ScenarioMonster } from '@wiz6/data';
import { monsterSlug } from '@wiz6/parser';

interface SpritesIdsTabProps {
  monster: ScenarioMonster;
  allMonsters: readonly ScenarioMonster[];
}

type SpriteField = keyof Pick<
  ScenarioMonster,
  | 'picId'
  | 'combatSpriteId'
  | 'combatSpriteAlt'
  | 'secondarySpriteId'
  | 'combatTraitId'
  | 'magicResistChance'
  | 'spellPowerChance'
  | 'auxSave103'
  | 'auxSave106'
  | 'flyEvadeChance'
>;

const FIELDS: { name: SpriteField; label: string; isPercent?: boolean }[] = [
  { name: 'picId', label: 'Pic file (monNN.pic)' },
  { name: 'combatSpriteId', label: 'Combat sprite ID' },
  { name: 'combatSpriteAlt', label: 'Combat sprite ID (alt)' },
  { name: 'secondarySpriteId', label: 'Secondary sprite ID' },
  { name: 'combatTraitId', label: 'Combat trait' },
  { name: 'magicResistChance', label: 'Magic resist', isPercent: true },
  { name: 'spellPowerChance', label: 'Spell power', isPercent: true },
  { name: 'auxSave103', label: 'Aux save (byte 103)', isPercent: true },
  { name: 'auxSave106', label: 'Aux save (byte 106)', isPercent: true },
  { name: 'flyEvadeChance', label: 'Fly evade', isPercent: true },
];

function sharedWith(
  monster: ScenarioMonster,
  allMonsters: readonly ScenarioMonster[],
  field: SpriteField,
): ScenarioMonster[] {
  const value = monster[field];
  if (value === 0) return []; // skip the noisy "everyone has 0" case
  return allMonsters.filter(
    (m) =>
      !m.empty && m.index !== monster.index && m[field] === value,
  );
}

export function SpritesIdsTab({ monster, allMonsters }: SpritesIdsTabProps) {
  return (
    <div>
      <div
        data-testid="sprite-placeholder"
        style={{
          width: 96,
          height: 96,
          background: 'var(--color-surface)',
          border: '1px dashed var(--color-border)',
          color: 'var(--color-text-faint)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          marginBottom: 'var(--space-4)',
        }}
      >
        sprite{'\n'}TBD
      </div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.88rem',
        }}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            <th style={{ textAlign: 'left', padding: 'var(--space-1) 0' }}>field</th>
            <th style={{ textAlign: 'right', padding: 'var(--space-1) 0' }}>value</th>
            <th style={{ textAlign: 'left', padding: 'var(--space-1) var(--space-3)' }}>shared with</th>
          </tr>
        </thead>
        <tbody>
          {FIELDS.map(({ name, label, isPercent }) => {
            const value = monster[name];
            const sharers = sharedWith(monster, allMonsters, name);
            return (
              <tr key={name} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: 'var(--space-1) 0', color: 'var(--color-text-muted)' }}>
                  {label}
                </td>
                <td style={{ padding: 'var(--space-1) 0', textAlign: 'right', color: 'var(--color-text)' }}>
                  {value}
                  {isPercent ? '%' : ''}
                </td>
                <td style={{ padding: 'var(--space-1) var(--space-3)', color: 'var(--color-text-faint)' }}>
                  {sharers.length === 0 ? (
                    <span>—</span>
                  ) : (
                    sharers.slice(0, 5).map((m, i) => (
                      <span key={m.index}>
                        {i > 0 ? ', ' : ''}
                        <Link to={`/monsters/${monsterSlug(m)}`}>{m.nameIdSingular}</Link>
                      </span>
                    ))
                  )}
                  {sharers.length > 5 ? <span> +{sharers.length - 5} more</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
