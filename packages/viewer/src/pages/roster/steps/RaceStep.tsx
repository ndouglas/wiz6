import { RACE_BASE_STATS } from '@wiz6/data';
import type { CharacterDraft } from '../lib/draft.js';
import styles from './shared.module.css';
import raceStyles from './RaceStep.module.css';

interface RaceStepProps {
  draft: CharacterDraft;
  onUpdate: (patch: Partial<CharacterDraft>) => void;
}

export function RaceStep({ draft, onUpdate }: RaceStepProps) {
  return (
    <div className={styles.step}>
      <p>Choose a race. Base attributes for each shown below.</p>
      <div className={raceStyles.grid}>
        {RACE_BASE_STATS.map((race) => {
          const selected = draft.raceIdx === race.index;
          return (
            <button
              key={race.index}
              type="button"
              className={raceStyles.card}
              aria-pressed={selected}
              data-selected={selected || undefined}
              onClick={() =>
                onUpdate({
                  raceIdx: race.index,
                  attributes: {
                    str: race.str,
                    iq: race.int,
                    pie: race.pie,
                    vit: race.vit,
                    dex: race.dex,
                    spd: race.spd,
                    per: race.per,
                    kar: race.kar,
                  },
                  bonusDistribution: { str: 0, iq: 0, pie: 0, vit: 0, dex: 0, spd: 0, per: 0, kar: 0 },
                })
              }
            >
              <span className={raceStyles.name}>{race.name}</span>
              <span className={raceStyles.stats}>
                STR {race.str} · IQ {race.int} · PIE {race.pie} · VIT {race.vit}
                <br />
                DEX {race.dex} · SPD {race.spd} · PER {race.per}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
