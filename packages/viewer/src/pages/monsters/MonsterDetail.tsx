import { useEffect, useState } from 'react';
import type { ScenarioMonster } from '@wiz6/data';
import { PicSchema } from '@wiz6/data';
import { renderPicDescriptor, concatenatePicSegments } from '@wiz6/parser';
import { PicCanvas } from '../../components/PicCanvas.js';
import { useUrlState } from '../../lib/hooks/useUrlState.js';
import styles from './MonsterDetail.module.css';
import { MonsterDetailProvider } from './MonsterDetailContext.js';
import { AttacksTab } from './tabs/AttacksTab.js';
import { FamilyTab } from './tabs/FamilyTab.js';
import { OverviewTab } from './tabs/OverviewTab.js';
import { RawBytesTab } from './tabs/RawBytesTab.js';
import { SavesTab } from './tabs/SavesTab.js';
import { SpritesIdsTab } from './tabs/SpritesIdsTab.js';

interface RenderedSprite {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

function useMonsterSprite(picId: number): RenderedSprite | null {
  const [sprite, setSprite] = useState<RenderedSprite | null>(null);
  useEffect(() => {
    if (!picId || picId === 0) {
      setSprite(null);
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
        const firstDesc = pic.descriptors[0];
        if (!firstDesc) return;
        const decoded = concatenatePicSegments(pic.segments);
        const r = renderPicDescriptor(firstDesc, decoded);
        if (!cancelled) setSprite(r);
      } catch {
        // Swallow — leave sprite null; page still renders.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [picId]);
  return sprite;
}

type TabId = 'overview' | 'attacks' | 'saves' | 'sprites' | 'raw' | 'family';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'attacks', label: 'Attacks' },
  { id: 'saves', label: 'Saves & Resistances' },
  { id: 'sprites', label: 'Sprites & IDs' },
  { id: 'raw', label: 'Raw bytes' },
  { id: 'family', label: 'Family' },
];

interface MonsterDetailProps {
  monster: ScenarioMonster;
  allMonsters: readonly ScenarioMonster[];
}

export function MonsterDetail({ monster, allMonsters }: MonsterDetailProps) {
  const [rawTab, setTab] = useUrlState('tab');
  const currentTab: TabId = (TABS.find((t) => t.id === rawTab)?.id ?? 'overview') as TabId;
  const name = monster.nameIdSingular || `(empty slot ${monster.index})`;
  const sprite = useMonsterSprite(monster.picId);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerRow}>
          {sprite ? (
            <div className={styles.sprite} data-testid="monster-sprite">
              <PicCanvas
                width={sprite.width}
                height={sprite.height}
                rgba={sprite.rgba}
                scale={2}
              />
            </div>
          ) : null}
          <div className={styles.headerText}>
            <h2 className={styles.title}>{name}</h2>
            <div className={styles.subHeader}>
              {monster.nameIdSingular ? <span>{monster.nameIdSingular}</span> : null}
              {monster.nameIdPlural ? <span>{monster.nameIdPlural}</span> : null}
              {monster.nameUnidSingular ? <span>{monster.nameUnidSingular}</span> : null}
              {monster.nameUnidPlural ? <span>{monster.nameUnidPlural}</span> : null}
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => {
              const hex = monster.statBytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
              void navigator.clipboard.writeText(hex);
            }}
          >
            Copy raw bytes hex
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => {
              void navigator.clipboard.writeText(JSON.stringify(monster, null, 2));
            }}
          >
            Copy as JSON
          </button>
        </div>
      </header>

      <div className={styles.tabBar} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={currentTab === t.id}
            className={`${styles.tab} ${currentTab === t.id ? styles.tabActive : ''}`.trim()}
            onClick={() => setTab(t.id === 'overview' ? null : t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <MonsterDetailProvider>
        <div role="tabpanel" data-testid={`tab-${currentTab}`}>
          {currentTab === 'overview' ? (
            <OverviewTab monster={monster} />
          ) : currentTab === 'attacks' ? (
            <AttacksTab monster={monster} />
          ) : currentTab === 'saves' ? (
            <SavesTab monster={monster} />
          ) : currentTab === 'sprites' ? (
            <SpritesIdsTab monster={monster} allMonsters={allMonsters} />
          ) : currentTab === 'family' ? (
            <FamilyTab monster={monster} allMonsters={allMonsters} />
          ) : (
            <RawBytesTab monster={monster} />
          )}
        </div>
      </MonsterDetailProvider>
    </>
  );
}
