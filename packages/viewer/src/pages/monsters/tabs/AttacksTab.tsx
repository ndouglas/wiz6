import type { ScenarioMonster } from '@wiz6/data';
import { formatAttackDice } from '@wiz6/parser';
import styles from './AttacksTab.module.css';

const STYLE_LABEL: Record<number, string> = {
  0: 'melee',
  1: 'grapple/entangle',
  2: 'stun/crush',
  3: 'ranged/precision',
};

interface AttackRecord {
  index: 1 | 2 | 3;
  diceCount: number;
  diceSides: number;
  specialChance: number;
  style: number;
  damageBonus: number;
  poisonChance: number;
  poisonStrength: number;
  drainChance: number;
  stunChance: number;
  hpDrainChance: number;
  ageChance: number;
  decapitateChance: number;
  extra: readonly number[];
}

function attackRecords(m: ScenarioMonster): AttackRecord[] {
  return [
    {
      index: 1,
      diceCount: m.attack1DiceCount,
      diceSides: m.attack1DiceSides,
      specialChance: m.attack1SpecialChance,
      style: m.attack1Style,
      damageBonus: m.attack1DamageBonus,
      poisonChance: m.attack1PoisonChance,
      poisonStrength: m.attack1PoisonStrength,
      drainChance: m.attack1DrainChance,
      stunChance: m.attack1StunChance,
      hpDrainChance: m.attack1HpDrainChance,
      ageChance: m.attack1AgeChance,
      decapitateChance: m.attack1DecapitateChance,
      extra: m.attack1Extra,
    },
    {
      index: 2,
      diceCount: m.attack2DiceCount,
      diceSides: m.attack2DiceSides,
      specialChance: m.attack2SpecialChance,
      style: m.attack2Style,
      damageBonus: m.attack2DamageBonus,
      poisonChance: m.attack2PoisonChance,
      poisonStrength: m.attack2PoisonStrength,
      drainChance: m.attack2DrainChance,
      stunChance: m.attack2StunChance,
      hpDrainChance: m.attack2HpDrainChance,
      ageChance: m.attack2AgeChance,
      decapitateChance: m.attack2DecapitateChance,
      extra: m.attack2Extra,
    },
    {
      index: 3,
      diceCount: m.attack3DiceCount,
      diceSides: m.attack3DiceSides,
      specialChance: m.attack3SpecialChance,
      style: m.attack3Style,
      damageBonus: m.attack3DamageBonus,
      poisonChance: m.attack3PoisonChance,
      poisonStrength: m.attack3PoisonStrength,
      drainChance: m.attack3DrainChance,
      stunChance: m.attack3StunChance,
      hpDrainChance: m.attack3HpDrainChance,
      ageChance: m.attack3AgeChance,
      decapitateChance: m.attack3DecapitateChance,
      extra: m.attack3Extra,
    },
  ];
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row} data-key={label}>
      {`${label} ${value}`}
    </div>
  );
}

function AttackColumn({ atk }: { atk: AttackRecord }) {
  const unused = atk.diceCount === 0 || atk.diceSides === 0;
  const diceText = formatAttackDice(atk.diceCount, atk.diceSides);
  const diceLine =
    atk.damageBonus !== 0 && atk.diceCount !== 0
      ? `${diceText} +${atk.damageBonus}`
      : diceText;
  return (
    <div
      role="group"
      aria-label={`attack ${atk.index}`}
      className={`${styles.column} ${unused ? styles.unused : ''}`.trim()}
    >
      <h3 className={styles.colHeader}>Atk {atk.index}</h3>
      <div className={styles.diceLine}>{diceLine}</div>
      <Row label="style" value={STYLE_LABEL[atk.style] ?? String(atk.style)} />
      <Row label="special" value={`${atk.specialChance}%`} />
      <Row label="poison" value={`${atk.poisonChance}%`} />
      <Row label="poison strength" value={String(atk.poisonStrength)} />
      <Row label="drain" value={`${atk.drainChance}%`} />
      <Row label="stun" value={`${atk.stunChance}%`} />
      <Row label="hp drain" value={`${atk.hpDrainChance}%`} />
      <Row label="age" value={`${atk.ageChance}%`} />
      <Row label="decapitate" value={`${atk.decapitateChance}%`} />
      <Row label="extra" value={`[${atk.extra.join(', ')}]`} />
    </div>
  );
}

interface AttacksTabProps {
  monster: ScenarioMonster;
}

export function AttacksTab({ monster }: AttacksTabProps) {
  const atks = attackRecords(monster);
  return (
    <div className={styles.grid}>
      {atks.map((a) => (
        <AttackColumn key={a.index} atk={a} />
      ))}
    </div>
  );
}
