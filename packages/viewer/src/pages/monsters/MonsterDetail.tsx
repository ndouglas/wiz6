import type { ScenarioMonster } from '@wiz6/data';
import { useUrlState } from '../../lib/hooks/useUrlState.js';
import styles from './MonsterDetail.module.css';
import { MonsterDetailProvider } from './MonsterDetailContext.js';
import { AttacksTab } from './tabs/AttacksTab.js';
import { FamilyTab } from './tabs/FamilyTab.js';
import { OverviewTab } from './tabs/OverviewTab.js';
import { RawBytesTab } from './tabs/RawBytesTab.js';
import { SavesTab } from './tabs/SavesTab.js';
import { SpritesIdsTab } from './tabs/SpritesIdsTab.js';

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

  return (
    <>
      <header className={styles.header}>
        <h2 className={styles.title}>{name}</h2>
        <div className={styles.subHeader}>
          {monster.nameIdSingular ? <span>{monster.nameIdSingular}</span> : null}
          {monster.nameIdPlural ? <span>{monster.nameIdPlural}</span> : null}
          {monster.nameUnidSingular ? <span>{monster.nameUnidSingular}</span> : null}
          {monster.nameUnidPlural ? <span>{monster.nameUnidPlural}</span> : null}
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
