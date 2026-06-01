/**
 * state-catalog.ts — named DOSBox drive recipes. The DURABLE save-state library
 * (committed); .sav files are materialized on demand by build-saves.ts. Each
 * recipe drives from a fresh boot (after the title screen is dismissed) to its
 * target state.
 *
 * Macros use the MCP input key-names accepted by sendMacro (e.g. 'enter',
 * 'down', 'right', 'up', and letters for typing). Each `steps` entry is one
 * space-separated key macro; the builder settles the frame (waitForStableFrame)
 * between entries before sending the next.
 *
 * Spec: docs/superpowers/specs/2026-05-31-dosbox-save-state-library-design.md
 */
export interface SaveStateRecipe {
  name: string;
  description: string;
  /** Drive steps AFTER the title screen is dismissed. One macro string each;
   *  the builder settles the frame between steps. */
  steps: string[];
  /** Extra settle (ms) after the final step before saving (default 0). */
  settleMs?: number;
}

// Shared creation prologue: MASTER OPTIONS → CHARACTER MENU → CREATE PC.
// (MASTER OPTIONS cursor starts on ADD PARTY MEMBER; down×2 → CHARACTER MENU.
// In CHARACTER MENU the cursor starts on EXIT; up + left×2 → CREATE PC.)
const CREATE_PC_PROLOGUE: readonly string[] = ['down down enter', 'up left left enter'];

// Drain any bonus pool / skill budget: the reducer caps per-attribute and
// ignores excess presses, so a long run of 'right' empties the pool regardless
// of its size, then 'enter' exits the screen.
const DRAIN = 'right right right right right right right right right right enter';

const SEED_CATALOG: readonly SaveStateRecipe[] = [
  {
    name: 'mage-spellpick',
    description:
      'M-Elf Mage parked at the creation spell picker (FIRE grid). Matches the ' +
      'creation-spell-* fixtures IF the engine stat-roll is deterministic per ' +
      'boot (verified in build-saves Task 5); otherwise a valid fresh Mage.',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'm a g e enter', // NAME = MAGE
      'down enter',    // RACE: Elf (index 1)
      'enter',         // SEX: Male (index 0)
      'down enter',    // CLASS: Mage (index 1)
      DRAIN,           // BONUS: drain pool, exit
      'enter',         // KARMA
      'enter',         // PORTRAIT (default)
      DRAIN,           // SKILLS: drain budget, exit → spell pick
    ],
    settleMs: 300,
  },
  {
    name: 'priest-spellpick',
    description: 'M-Human Priest parked at the creation spell picker.',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'p r s t enter', // NAME = PRST
      'enter',         // RACE: Human (index 0)
      'enter',         // SEX: Male
      'down down enter', // CLASS: Priest (index 2)
      DRAIN,           // BONUS
      'enter',         // KARMA
      'enter',         // PORTRAIT
      DRAIN,           // SKILLS → spell pick
    ],
    settleMs: 300,
  },
];

// Castle recipes: MASTER OPTIONS with N party members (deterministic — uses
// fixed PCFILE characters). Ported from build-castle-saves.ts per-member loop:
//   enter → pick ADD PARTY MEMBER
//   enter → pick first PCFILE char
//   up up up → re-anchor cursor on ADD PARTY MEMBER
// Each 3-macro block is a separate step so the builder settles between them.
function makeCastleRecipe(n: number): SaveStateRecipe {
  const steps: string[] = [];
  for (let i = 0; i < n; i++) {
    steps.push('enter');       // pick ADD PARTY MEMBER
    steps.push('enter');       // pick first PCFILE char
    steps.push('up up up');    // re-anchor cursor on ADD PARTY MEMBER
  }
  return {
    name: `castle-${n}`,
    description:
      `Castle / MASTER OPTIONS with ${n} party member${n === 1 ? '' : 's'} ` +
      `(fixed PCFILE chars → deterministic).`,
    steps,
  };
}

const CASTLE_RECIPES: readonly SaveStateRecipe[] = [1, 2, 3, 4, 5, 6].map(makeCastleRecipe);

export const STATE_CATALOG: readonly SaveStateRecipe[] = [
  ...SEED_CATALOG,
  ...CASTLE_RECIPES,
];

export function findRecipe(name: string): SaveStateRecipe | undefined {
  return STATE_CATALOG.find((r) => r.name === name);
}
