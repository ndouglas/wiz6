import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addCharacter } from '../../lib/roster-store.js';
import { buildCharacter } from './lib/build-character.js';
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
import { ClassPickStep } from './steps/ClassPickStep.js';
import { AttributeDistributeStep } from './steps/AttributeDistributeStep.js';
import { SkillPointStep } from './steps/SkillPointStep.js';
import { SpellPickStep } from './steps/SpellPickStep.js';
import { KarmaStep } from './steps/KarmaStep.js';
import { ReviewStep } from './steps/ReviewStep.js';
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
  // Step 3: classIdx is set. isClassValid checks if requirements are met via
  // computeTotalAttributes (race base + bonusDistribution), but bonusDistribution
  // is zero at class-pick time, so checking full requirements here would block
  // all but a few race+class combos. The ClassPickStep already gates the buttons
  // by theoretical reachability (race base + full bonus pool), so the wizard
  // shell only needs to confirm a selection was made.
  (d) => d.classIdx !== null,
  isAttributesValid,
  isSkillsValid,
  isSpellsValid,
  isKarmaValid,
  () => true, // Review
];

export function NewCharacterPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<CharacterDraft>(createEmptyDraft());
  const [step, setStep] = useState(0);

  const handleCreate = () => {
    const c = buildCharacter(draft);
    addCharacter(c);
    navigate('/roster');
  };

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
        {step === 3 && (
          <ClassPickStep draft={draft} onUpdate={(p) => setDraft((d) => ({ ...d, ...p }))} />
        )}
        {step === 4 && (
          <AttributeDistributeStep draft={draft} onUpdate={(p) => setDraft((d) => ({ ...d, ...p }))} />
        )}
        {step === 5 && (
          <SkillPointStep draft={draft} onUpdate={(p) => setDraft((d) => ({ ...d, ...p }))} />
        )}
        {step === 6 && (
          <SpellPickStep draft={draft} onUpdate={(p) => setDraft((d) => ({ ...d, ...p }))} />
        )}
        {step === 7 && (
          <KarmaStep draft={draft} onUpdate={(p) => setDraft((d) => ({ ...d, ...p }))} />
        )}
        {step === 8 && (
          <ReviewStep draft={draft} onCreate={handleCreate} />
        )}
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
