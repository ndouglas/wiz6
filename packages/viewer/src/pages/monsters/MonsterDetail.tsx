import type { ScenarioMonster } from '@wiz6/data';
import { useUrlState } from '../../lib/hooks/useUrlState.js';
import styles from './MonsterDetail.module.css';
import { MonsterDetailProvider } from './MonsterDetailContext.js';
import { AttacksTab } from './tabs/AttacksTab.js';
import { OverviewTab } from './tabs/OverviewTab.js';
import { RawBytesTab } from './tabs/RawBytesTab.js';
import { SavesTab } from './tabs/SavesTab.js';

type TabId = 'overview' | 'attacks' | 'saves' | 'raw';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'attacks', label: 'Attacks' },
  { id: 'saves', label: 'Saves & Resistances' },
  { id: 'raw', label: 'Raw bytes' },
];

interface MonsterDetailProps {
  monster: ScenarioMonster;
}

export function MonsterDetail({ monster }: MonsterDetailProps) {
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
          ) : (
            <RawBytesTab monster={monster} />
          )}
        </div>
      </MonsterDetailProvider>
    </>
  );
}
