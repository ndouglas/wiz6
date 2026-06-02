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

// Party-member picker reachers (REVIEW MEMBER = MASTER OPTIONS slot 1,
// DISMISS MEMBER = slot 2). Built on castle-3 (3 fixed PCFILE chars →
// deterministic). After castle-3 the cursor is on ADD PARTY MEMBER (slot 0).
//   review-who-exit:    down enter        → REVIEW WHO?, cursor on EXIT (-1)
//   review-who-member:  down enter / down → cursor on slot 0
//   dismiss-who-exit:   down down enter   → DISMISS WHO?, cursor on EXIT (-1)
//   dismiss-who-member: down down enter / down → cursor on slot 0
function makePickerRecipe(
  name: string,
  toOption: string,
  extra: readonly string[],
  picker: 'REVIEW' | 'DISMISS',
): SaveStateRecipe {
  return {
    name,
    description:
      `${picker} WHO? picker over a 3-member castle (deterministic PCFILE chars). ` +
      `Reaches ${name.endsWith('member') ? 'cursor-on-slot-0' : 'cursor-on-EXIT'}.`,
    steps: [...makeCastleRecipe(3).steps, toOption, ...extra],
  };
}

const PICKER_RECIPES: readonly SaveStateRecipe[] = [
  makePickerRecipe('review-who-exit', 'down enter', [], 'REVIEW'),
  makePickerRecipe('review-who-member', 'down enter', ['down'], 'REVIEW'),
  makePickerRecipe('dismiss-who-exit', 'down down enter', [], 'DISMISS'),
  makePickerRecipe('dismiss-who-member', 'down down enter', ['down'], 'DISMISS'),
];

// Creation-flow recipes: sequential waypoints along ONE linear playthrough
// (name → race → sex → class → bonus → karma → portrait → skills → spell).
// Each drives from a fresh boot to its target screen.
//
// IMPORTANT — backend divergence (see the parent's report): the committed
// fixtures were minted from DOSBox-X save states, whose per-creation RANDOM
// stat/bonus roll differs from what the dosbox-pure (libretro) harness rolls
// (e.g. class-select fixture has BONUS 17; libretro rolls BONUS 5). The roll is
// deterministic *per libretro boot* but does NOT match the DOSBox-X capture, so
// every screen that displays rolled stats diverges on character DATA while the
// chrome/layout is byte-exact. Likewise the NATHAN-Rawulf-Fighter roster
// character in the review/delete/rename/portrait fixtures is absent from the
// pinned test-fixtures/original/pcfile.dbs (which holds THESUS/TEMPEST/…), so
// those picker/sheet screens cannot reproduce the captured roster. These recipes
// still reach the correct WAYPOINT screen; the divergence is recorded in the
// per-recipe note below and in the parent's deliverable table.
//
// Prologue → CHARACTER MENU (down down enter) → CREATE PC (up left left enter).
// Linear creation: <name> enter → RACE; <race> enter → SEX; enter → CLASS;
// <class> enter → BONUS (DRAIN) → KARMA (enter) → PORTRAIT (enter) → SKILLS
// (DRAIN) → SPELL pick (casters).
const CREATION_RECIPES: readonly SaveStateRecipe[] = [
  {
    name: 'creation-name-input',
    description: 'CREATE PC name-entry prompt (first creation screen, before typing).',
    steps: [...CREATE_PC_PROLOGUE],
  },
  {
    name: 'creation-race-select',
    description:
      'RACE list, name=NATHAN typed, HUMAN (index 0). DATA-clean (no rolled ' +
      'stats yet) → 100.00% byte-exact under the keyboard-only (cursor-free) boot.',
    steps: [...CREATE_PC_PROLOGUE, 'n a t h a n enter'],
    settleMs: 300,
  },
  {
    name: 'creation-class-select',
    description:
      'CLASS list — NATHAN, Human male. Fixture BONUS=17; libretro rolls a ' +
      'different (smaller) bonus → fewer eligible classes → divergent.',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'n a t h a n enter', // NAME
      'enter',             // RACE: Human (index 0)
      'enter',             // SEX: Male
    ],
    settleMs: 300,
  },
  // SAMURAI flow (Human male, class index 11) — portrait/skill/confirm waypoints.
  {
    name: 'creation-portrait-select',
    description: 'NATHAN Human-male SAMURAI portrait picker (rolled-stat divergent).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'n a t h a n enter',          // NAME
      'enter',                      // RACE: Human
      'enter',                      // SEX: Male
      'down down down down down down down down down down down enter', // CLASS: Samurai (index 11)
      DRAIN,                        // BONUS
      'enter',                      // KARMA → PORTRAIT
    ],
    settleMs: 300,
  },
  {
    name: 'creation-skill-train',
    description: 'NATHAN SAMURAI skill-train, WEAPONRY, mid-allocation (rolled-stat divergent).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'n a t h a n enter',
      'enter',
      'enter',
      'down down down down down down down down down down down enter',
      DRAIN,
      'enter',  // KARMA
      'enter',  // PORTRAIT → SKILLS
      'right',  // spend 1 point on first skill (mid-allocation)
    ],
    settleMs: 300,
  },
  {
    name: 'creation-skill-train-done',
    description: 'NATHAN SAMURAI skill-train, budget exhausted (rolled-stat divergent).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'n a t h a n enter',
      'enter',
      'enter',
      'down down down down down down down down down down down enter',
      DRAIN,
      'enter',
      'enter',  // PORTRAIT → SKILLS
      'right right right right right right right right right right', // drain budget (no exit enter — stay on screen)
    ],
    settleMs: 300,
  },
  {
    name: 'creation-confirm',
    description: 'NATHAN SAMURAI "SAVE THIS CHARACTER? YES NO" (rolled-stat divergent).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'n a t h a n enter',
      'enter',
      'enter',
      'down down down down down down down down down down down enter',
      DRAIN,
      'enter',
      'enter',
      DRAIN,  // SKILLS drain + exit → confirm
    ],
    settleMs: 300,
  },
  {
    name: 'creation-skill-train-physical',
    description:
      'NATHAN Rawulf Fighter skill-train, PHYSICAL category (rolled-stat divergent).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'n a t h a n enter',
      'down down down down down down down down down enter', // RACE: Rawulf (index 9)
      'enter',                                             // SEX: Male
      'enter',                                             // CLASS: Fighter (index 0)
      DRAIN,                                               // BONUS
      'enter',                                             // KARMA
      'enter',                                             // PORTRAIT → SKILLS
      'right',                                             // → PHYSICAL category (next-category key)
    ],
    settleMs: 300,
  },
  // Mage spell-picker waypoints — same M-Elf Mage draft, different school/mode.
  {
    name: 'creation-spell-pick',
    description: 'M-Elf Mage spell picker, FIRE grid (rolled-stat divergent).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'm a g e enter', // NAME = MAGE
      'down enter',    // RACE: Elf (index 1)
      'enter',         // SEX: Male
      'down enter',    // CLASS: Mage (index 1)
      DRAIN,           // BONUS
      'enter',         // KARMA
      'enter',         // PORTRAIT
      DRAIN,           // SKILLS → spell pick
    ],
    settleMs: 300,
  },
  {
    name: 'creation-spell-grid-water',
    description: 'M-Elf Mage spell picker, WATER grid (rolled-stat divergent).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'm a g e enter',
      'down enter',
      'enter',
      'down enter',
      DRAIN,
      'enter',
      'enter',
      DRAIN,
      'right', // FIRE → WATER (school cursor right)
    ],
    settleMs: 300,
  },
  {
    name: 'creation-spell-grid-air',
    description: 'M-Elf Mage spell picker, AIR grid (rolled-stat divergent).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'm a g e enter',
      'down enter',
      'enter',
      'down enter',
      DRAIN,
      'enter',
      'enter',
      DRAIN,
      'right right', // FIRE → WATER → AIR
    ],
    settleMs: 300,
  },
  {
    name: 'creation-spell-grid-earth',
    description: 'M-Elf Mage spell picker, EARTH grid (rolled-stat divergent).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'm a g e enter',
      'down enter',
      'enter',
      'down enter',
      DRAIN,
      'enter',
      'enter',
      DRAIN,
      'right right right', // FIRE → WATER → AIR → EARTH
    ],
    settleMs: 300,
  },
  {
    name: 'creation-spell-sublist-chill',
    description: 'M-Elf Mage WATER sub-list, CHILLING TOUCH selected (rolled-stat divergent).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'm a g e enter',
      'down enter',
      'enter',
      'down enter',
      DRAIN,
      'enter',
      'enter',
      DRAIN,
      'right', // → WATER grid
      'enter', // open sub-list, first spell (CHILLING TOUCH)
    ],
    settleMs: 300,
  },
  {
    name: 'creation-spell-sublist-terror',
    description: 'M-Elf Mage WATER sub-list, TERROR selected (rolled-stat divergent).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'm a g e enter',
      'down enter',
      'enter',
      'down enter',
      DRAIN,
      'enter',
      'enter',
      DRAIN,
      'right',      // → WATER grid
      'enter',      // open sub-list
      'down',       // CHILLING TOUCH → TERROR
    ],
    settleMs: 300,
  },
  // Roster-management waypoints over an EXISTING roster character. The committed
  // fixtures capture a single-char roster (NATHAN Rawulf Fighter) absent from the
  // pinned pcfile, so these reach the right SCREEN but show a different roster
  // (the pinned THESUS/… set) — STALE/divergent.
  // CHARACTER MENU (down down enter) — POPULATED-roster layout (6 options,
  // col-major; cursor STARTS on EXIT, bottom-right):
  //   col0: CREATE PC (r0) | REVIEW PC (r1)
  //   col1: DELETE PC (r0) | RENAME PC (r1)
  //   col2: PORTRAIT  (r0) | EXIT      (r1)  ← cursor start
  // From EXIT: REVIEW=left left ; DELETE=left up ; RENAME=left ; PORTRAIT=up.
  {
    name: 'creation-review-picker',
    description: 'REVIEW WHO? roster picker (stale: NATHAN-roster vs pinned pcfile).',
    steps: ['down down enter', 'left left enter'], // CHAR MENU (cursor on EXIT) → REVIEW PC
    settleMs: 300,
  },
  {
    name: 'creation-review-character',
    description: 'REVIEW PC char-sheet of the first roster char (stale roster).',
    steps: ['down down enter', 'left left enter', 'enter'], // REVIEW PC → pick first → sheet
    settleMs: 300,
  },
  {
    name: 'creation-delete-picker',
    description: 'DELETE WHO? roster picker (stale roster).',
    steps: ['down down enter', 'left up enter'], // CHAR MENU (cursor on EXIT) → DELETE PC (col1,row0)
    settleMs: 300,
  },
  {
    name: 'creation-delete-confirm',
    description: 'DELETE THIS CHARACTER? YES NO (stale roster).',
    steps: ['down down enter', 'left up enter', 'enter'], // DELETE PC → pick first → confirm
    settleMs: 300,
  },
  {
    name: 'creation-rename-picker',
    description: 'RENAME WHO? roster picker (stale roster).',
    steps: ['down down enter', 'left enter'], // CHAR MENU (cursor on EXIT) → RENAME PC (col1,row1)
    settleMs: 300,
  },
  {
    name: 'creation-rename-input',
    description: 'RENAME char-sheet + NEW NAME > input (stale roster).',
    steps: ['down down enter', 'left enter', 'enter'], // RENAME PC → pick first → input
    settleMs: 300,
  },
  {
    name: 'creation-portrait-target-picker',
    description: 'PORTRAIT FOR WHOM? roster picker (stale roster).',
    steps: ['down down enter', 'up enter'], // CHAR MENU (cursor on EXIT) → PORTRAIT (col2,row0)
    settleMs: 300,
  },
  {
    name: 'creation-portrait-change',
    description: 'PORTRAIT change active — char sheet + picker (stale roster).',
    steps: ['down down enter', 'up enter', 'enter'], // PORTRAIT → pick first → change
    settleMs: 300,
  },
  {
    name: 'creation-portrait-done',
    description: 'PORTRAIT post-change preview (stale roster).',
    steps: ['down down enter', 'up enter', 'enter', 'right enter'], // …→ cycle one portrait, then commit → preview
    settleMs: 300,
  },
  {
    name: 'creation-review-member',
    description:
      'WPCVW REVIEW MEMBER (state 0x11) of a party member (stale roster — captured ' +
      'NATHAN Rawulf Fighter absent from pinned pcfile).',
    // Reached via MASTER OPTIONS REVIEW MEMBER (slot 1) over an added party.
    // After adding one member the cursor is back on ADD PARTY MEMBER (slot 0).
    // down → REVIEW MEMBER (slot 1); enter → REVIEW WHO? picker; enter → WPCVW view.
    // After adding one member the cursor is back on ADD PARTY MEMBER (slot 0).
    // down → REVIEW MEMBER (slot 1); enter → REVIEW WHO? picker; enter → WPCVW view.
    // Split down/enter into separate steps so the menu settles the highlight move
    // before the select (a combined 'down enter' step didn't register the move).
    // After adding one member the cursor is back on ADD PARTY MEMBER (slot 0).
    // down → REVIEW MEMBER (slot 1); enter → REVIEW WHO? (single member ⇒
    // selecting it opens the WPCVW view directly). Splitting down/enter into
    // separate steps lets the highlight move settle before the select.
    steps: ['enter', 'enter', 'down', 'enter'],
    settleMs: 300,
  },
];

export const STATE_CATALOG: readonly SaveStateRecipe[] = [
  ...SEED_CATALOG,
  ...CASTLE_RECIPES,
  ...PICKER_RECIPES,
  ...CREATION_RECIPES,
];

export function findRecipe(name: string): SaveStateRecipe | undefined {
  return STATE_CATALOG.find((r) => r.name === name);
}
