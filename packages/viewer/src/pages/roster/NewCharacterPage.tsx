import { useState } from 'react';
import {
  type CharacterDraft,
  createEmptyDraft,
  isNameValid,
  isRaceValid,
  isBonusRollValid,
  isClassValid,
  isAttributesValid,
  isSkillsValid,
  isSpellsValid,
  isKarmaValid,
} from './lib/draft.js';
import { NameStep } from './steps/NameStep.js';
import { RaceStep } from './steps/RaceStep.js';
import { BonusRollStep } from './steps/BonusRollStep.js';
import styles from './NewCharacterPage.module.css';

const STEP_NAMES = [
  'Name',
  'Race',
  'Bonus Roll',
  'Class',
  'Attributes',
  'Skills',
  'Spells',
  'Karma',
  'Review',
] as const;

const VALIDATORS: Array<(d: CharacterDraft) => boolean> = [
  (d) => isNameValid(d.name),
  isRaceValid,
  isBonusRollValid,
  isClassValid,
  isAttributesValid,
  isSkillsValid,
  isSpellsValid,
  isKarmaValid,
  () => true, // Review
];

export function NewCharacterPage() {
  const [draft, setDraft] = useState<CharacterDraft>(createEmptyDraft());
  const [step, setStep] = useState(0);

  const validNow = VALIDATORS[step]!(draft);
  const stepName = STEP_NAMES[step]!;

  return (
    <main className={styles.page}>
      <header>
        <h1>Create Character</h1>
        <p className={styles.stepIndicator}>
          Step {step + 1} of {STEP_NAMES.length}: <strong>{stepName}</strong>
        </p>
      </header>
      <section className={styles.stepBody}>
        {step === 0 && (
          <NameStep draft={draft} onUpdate={(p) => setDraft((d) => ({ ...d, ...p }))} />
        )}
        {step === 1 && (
          <RaceStep draft={draft} onUpdate={(p) => setDraft((d) => ({ ...d, ...p }))} />
        )}
        {step === 2 && (
          <BonusRollStep draft={draft} onUpdate={(p) => setDraft((d) => ({ ...d, ...p }))} />
        )}
        {step > 2 && <div>{stepName} (placeholder)</div>}
      </section>
      <footer className={styles.actions}>
        <button type="button" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
          ← Back
        </button>
        <button
          type="button"
          onClick={() => setStep((s) => s + 1)}
          disabled={!validNow || step === STEP_NAMES.length - 1}
        >
          Next →
        </button>
      </footer>
    </main>
  );
}
