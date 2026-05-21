import type { ScenarioMonster } from '@wiz6/data';
import {
  familyKey,
  formatHpDice,
  formatLevelRange,
} from '../../../lib/monsters.js';
import styles from './OverviewTab.module.css';

const CLASS_LABEL: Record<number, string> = {
  1: '1 — animal/beast',
  2: '2 — humanoid/undead',
  3: '3 — demon/elite',
  4: '4 — ultimate boss',
};

const ELEMENT_LABEL: Record<number, { label: string; cls?: string }> = {
  1: { label: 'fire', cls: 'badgeFire' },
  2: { label: 'earth' },
  3: { label: 'cold', cls: 'badgeCold' },
  4: { label: 'acid' },
  5: { label: 'disease' },
  6: { label: 'water' },
  7: { label: 'vampiric' },
  8: { label: 'poison', cls: 'badgePoison' },
  9: { label: 'plant poison' },
  11: { label: 'mental', cls: 'badgeMental' },
  12: { label: 'charm' },
};

const CREATURE_KIND_LABEL: Record<number, string> = {
  1: 'humanoid soldier',
  2: 'stone elemental',
  3: 'elite humanoid',
  4: 'rodent/cat',
  5: 'flying',
  6: 'plant',
  7: 'blob/slime',
  8: 'undead',
  10: 'elite warrior',
};

const SEX_LABEL: Record<number, string> = {
  0: 'male humanoid',
  1: 'female',
  2: 'neuter/creature',
};

const CLASS_BADGE: Record<number, string | undefined> = {
  1: styles.badgeClass1,
  2: styles.badgeClass2,
  3: styles.badgeClass3,
  4: styles.badgeClass4,
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className={styles.label} aria-hidden="true">
        {label}
      </div>
      <div className={styles.value} aria-label={label}>
        {children}
      </div>
    </>
  );
}

interface OverviewTabProps {
  monster: ScenarioMonster;
}

export function OverviewTab({ monster: m }: OverviewTabProps) {
  const elem = ELEMENT_LABEL[m.specialAttackElement];
  const elemBadgeClass = elem?.cls ? styles[elem.cls] : undefined;
  return (
    <div className={styles.grid}>
      <Row label="class">
        <span className={`${styles.badge} ${CLASS_BADGE[m.monsterClass] ?? ''}`.trim()}>
          {CLASS_LABEL[m.monsterClass] ?? `class ${m.monsterClass}`}
        </span>
        <span className={styles.gloss}>· sub {m.monsterSubClass}</span>
      </Row>
      <Row label="level">{formatLevelRange(m.monsterLevel, m.monsterLevelMax)}</Row>
      <Row label="ac">
        {m.monsterAC}
        <span className={styles.gloss}>(wiz6: lower = better)</span>
      </Row>
      <Row label="hp">{formatHpDice(m.hpDiceCount, m.hpDiceSides)}</Row>
      <Row label="xp on kill">{m.xpOnKill.toLocaleString()}</Row>
      <Row label="gold">
        {m.goldStat}
        <span className={styles.gloss}>≈ {(m.goldStat * 10).toLocaleString()} gp</span>
      </Row>
      <Row label="element">
        {elem ? (
          <span className={`${styles.badge} ${elemBadgeClass ?? ''}`.trim()}>{elem.label}</span>
        ) : (
          <span className={styles.gloss}>element {m.specialAttackElement}</span>
        )}
      </Row>
      <Row label="sex">{SEX_LABEL[m.monsterSex] ?? `sex ${m.monsterSex}`}</Row>
      <Row label="creature kind">
        {CREATURE_KIND_LABEL[m.creatureKind] ?? `kind ${m.creatureKind}`}
      </Row>
      <Row label="behavior">
        {m.monsterBehaviorClass}
        <span className={styles.gloss}>(see docs/re/scenario-dbs.md)</span>
      </Row>
      <Row label="move stat">{m.moveStat}</Row>
      <Row label="sprite group">{m.spriteGroup}</Row>
      <Row label="family">
        <span className={styles.gloss}>{familyKey(m.familyId)}</span>
      </Row>
    </div>
  );
}
