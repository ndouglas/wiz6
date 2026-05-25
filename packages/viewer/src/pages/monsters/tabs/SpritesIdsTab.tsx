import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ScenarioMonster } from '@wiz6/data';
import { PicSchema, WIZ6_MAIN } from '@wiz6/data';
import { renderPicDescriptor, concatenatePicSegments, monsterSlug, monsterDisplayName } from '@wiz6/parser';
import { PicCanvas } from '../../../components/PicCanvas.js';

interface SpritesIdsTabProps {
  monster: ScenarioMonster;
  allMonsters: readonly ScenarioMonster[];
}

interface RenderedSprite {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

function usePicDescriptors(picId: number): RenderedSprite[] | null {
  const [sprites, setSprites] = useState<RenderedSprite[] | null>(null);
  useEffect(() => {
    if (!picId || picId === 0) {
      setSprites(null);
      return;
    }
    let cancelled = false;
    const padded = picId.toString().padStart(2, '0');
    (async () => {
      try {
        const res = await fetch(`/pics/mon${padded}.json`);
        if (!res.ok) return;
        const text = await res.text();
        if (text.trimStart().startsWith('<')) return;
        const pic = PicSchema.parse(JSON.parse(text));
        const decoded = concatenatePicSegments(pic.segments);
        const rendered = pic.descriptors.map((d) => renderPicDescriptor(d, decoded, WIZ6_MAIN));
        if (!cancelled) setSprites(rendered);
      } catch {
        // Swallow — leave sprites null; page still renders.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [picId]);
  return sprites;
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
  const sprites = usePicDescriptors(monster.picId);
  const padded = monster.picId > 0 ? monster.picId.toString().padStart(2, '0') : null;

  return (
    <div>
      <div data-testid="sprite-gallery" style={{ marginBottom: 'var(--space-4)' }}>
        {monster.picId === 0 ? (
          <div
            style={{
              padding: 'var(--space-3)',
              border: '1px dashed var(--color-border)',
              color: 'var(--color-text-faint)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
            }}
          >
            no sprite (picId = 0)
          </div>
        ) : sprites === null ? (
          <div style={{ color: 'var(--color-text-muted)' }}>loading sprite…</div>
        ) : sprites.length === 0 ? (
          <div style={{ color: 'var(--color-text-muted)' }}>mon{padded}.pic has no descriptors</div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-3)',
                alignItems: 'flex-start',
              }}
            >
              {sprites.map((sprite, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <PicCanvas
                    width={sprite.width}
                    height={sprite.height}
                    rgba={sprite.rgba}
                    scale={2}
                  />
                  <span style={{ color: 'var(--color-text-faint)', fontSize: '0.75rem', marginTop: 2 }}>
                    desc {i}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ color: 'var(--color-text-faint)', fontSize: '0.8rem', marginTop: 'var(--space-2)' }}>
              from <Link to={`/explore/pics/mon${padded}`}>mon{padded}.pic</Link>
              {' · '}{sprites.length} descriptor{sprites.length === 1 ? '' : 's'}
            </p>
          </>
        )}
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
                        <Link to={`/explore/monsters/${monsterSlug(m, allMonsters)}`}>{monsterDisplayName(m, allMonsters)}</Link>
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
