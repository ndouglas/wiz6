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
  /** Drive steps. By default these run AFTER a fresh boot + title-screen
   *  dismissal. If `pcfileFixture` is set, the boot uses an image overlaid with
   *  that committed pcfile (see below). One macro string each; the builder
   *  settles the frame between steps. */
  steps: string[];
  /** Extra settle (ms) after the final step before saving (default 0). */
  settleMs?: number;
  /** Optional committed pcfile name (test-fixtures/states/<pcfileFixture>.pcfile.dbs)
   *  to OVERLAY on the pinned game image before booting. dosbox-pure's savestate
   *  does NOT capture host-mounted-file writes, so an in-game SAVE never survives
   *  a re-mount (see docs/re/findings/creation-save-persistence.json). To review a
   *  CREATED character reproducibly we bake it into the source pcfile and boot from
   *  a fresh image whose roster already contains it. The recipe then drives forward
   *  with NO creation roll — fully deterministic. */
  pcfileFixture?: string;
  /** Boot-sequence capture (intro/title/menu frames that play BEFORE the normal
   *  `step 3000 → enter → step 800` prelude lands on MASTER OPTIONS). Instead of
   *  driving the prelude + steps, the builder cold-boots `bootFrames` frames, then
   *  optionally taps `enter` (dismiss title) and steps `afterFrames` more — landing
   *  on the exact animated frame. The intro auto-plays with no input: sirtech logo →
   *  author credit → title art → scrolling credits → settled title page. Each frame
   *  sits on a multi-frame plateau (the engine holds each credit page / the title-art
   *  logo peak), so a single `bootFrames` reproduces it byte-exact. When `bootCapture`
   *  is set, `steps` is ignored. */
  bootCapture?: {
    /** Frames to advance from a cold boot (no input). */
    bootFrames: number;
    /** Tap `enter` after the boot to dismiss the title page. */
    dismissTitle?: boolean;
    /** Frames to advance after the enter-tap (water-anim phase select for the menu). */
    afterFrames?: number;
  };
}

// Shared creation prologue: MASTER OPTIONS → CHARACTER MENU → CREATE PC.
// (MASTER OPTIONS cursor starts on ADD PARTY MEMBER; down×2 → CHARACTER MENU.
// In CHARACTER MENU the cursor starts on EXIT; up + left×2 → CREATE PC.)
const CREATE_PC_PROLOGUE: readonly string[] = ['down down enter', 'up left left enter'];

// Drain any bonus pool / skill budget: the reducer caps per-attribute and
// ignores excess presses, so a long run of 'right' empties the pool regardless
// of its size, then 'enter' exits the screen.
const DRAIN = 'right right right right right right right right right right enter';

// BONUS allocator drain — the bonus pool is a RANDOM roll of 5..26 and each
// attribute caps at 18 (≈ +9 from the race base), so pumping a single attribute
// can't empty a large pool and the engine won't let you exit while pool > 0.
// This distributes 10 'right' across each of the 7 adjustable attrs (STR..PER,
// 'down' moves the cursor), giving ~63 points of capacity — enough for any roll
// — then 'enter' exits to KARMA. Robust regardless of the rolled pool size.
const FILL10 = 'right right right right right right right right right right';
const BONUS_DRAIN =
  `${FILL10} down ${FILL10} down ${FILL10} down ${FILL10} down ` +
  `${FILL10} down ${FILL10} down ${FILL10} enter`;

// SKILL-train budget drain — the skill budget is rng(9)+10 = 10..18 and a single
// skill has no per-slot cap in the trainer, so 20 'right' into the cursor skill
// always empties it; 'enter' then exits the SKILLS screen.
const SKILL_DRAIN =
  'right right right right right right right right right right ' +
  'right right right right right right right right right right enter';

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

// Fixture-name-matching aliases for the castle MASTER-OPTIONS screens. The
// committed castle-N-members fixtures are RE-MINTED from the pinned roster in
// test-fixtures/original/pcfile.dbs (THESUS/TEMPEST/LYSANDR/NOBAL/TREON/PENTAG,
// slots 0..5). `makeCastleRecipe(n)` drives ADD PARTY MEMBER n times, always
// picking the first available roster char, so the party is the first n pinned
// slots in order (THESUS, TEMPEST, …). `build-state castle-N-members` writes
// the fixture; `--check` re-mints byte-exact (proven 100.00% for N=1..6). The
// castle-parity.test.ts gate decodes the same pinned pcfile data-driven, so the
// fixtures + test data stay consistent and can't go stale.
const CASTLE_MEMBERS_ALIASES: readonly SaveStateRecipe[] = [1, 2, 3, 4, 5, 6].map((n) => ({
  ...makeCastleRecipe(n),
  name: `castle-${n}-members`,
  description:
    `MASTER OPTIONS with ${n} pinned-roster member${n === 1 ? '' : 's'} (THESUS…). ` +
    `Re-mintable byte-exact from the pinned pcfile.`,
}));

// add-party-picker: the ADD PARTY MEMBER roster picker over an EMPTY party. From
// a fresh boot the MASTER OPTIONS cursor sits on ADD PARTY MEMBER (slot 0); a
// single `enter` opens the picker (cursor on the first roster char, THESUS).
// Re-mintable byte-exact from the pinned pcfile.
const ADD_PARTY_PICKER_RECIPE: SaveStateRecipe = {
  name: 'add-party-picker',
  description:
    'ADD PARTY MEMBER roster picker over an empty party (cursor on THESUS, the ' +
    'first pinned roster char). Re-mintable byte-exact from the pinned pcfile.',
  steps: ['enter'],
  settleMs: 300,
};

// character-menu-empty: the CHARACTER MENU over an EMPTY roster (CREATE PC +
// EXIT only, CREATE PC highlighted). The pinned pcfile.dbs roster is non-empty,
// so we boot from a committed 0-char pcfile overlay (empty-roster.pcfile.dbs,
// generated like minimal-roster — header + 16 zeroed slots, all slot_status 0).
// MASTER OPTIONS → CHARACTER MENU = down down enter.
const CHARACTER_MENU_EMPTY_RECIPE: SaveStateRecipe = {
  name: 'character-menu-empty',
  description:
    'CHARACTER MENU over an EMPTY roster (CREATE PC + EXIT, CREATE PC highlighted). ' +
    'Boots from the committed empty-roster.pcfile.dbs overlay (pinned roster is non-empty). ' +
    'Empty party + empty roster MASTER OPTIONS = [RESUME, CHARACTER MENU, GAME CONFIG, …]; ' +
    'cursor starts on RESUME (idx 0), one `down` reaches CHARACTER MENU.',
  pcfileFixture: 'empty-roster',
  // CHARACTER MENU cursor starts on EXIT; `up` lands on CREATE PC (the
  // highlighted option in the committed fixture).
  steps: ['down enter', 'up'],
  settleMs: 300,
};

// character-menu-populated: CHARACTER MENU over a FULL (16-char) roster. With a
// full roster CREATE PC is hidden, so the menu has 5 options (REVIEW/DELETE/
// RENAME/PORTRAIT/EXIT) — matching the committed fixture, which was captured
// from a 16-char save. The pinned pcfile only has 6 chars (CREATE PC would
// still show), so we boot from a committed 16-char overlay (full-roster.pcfile.
// dbs — the 6 pinned records cycled across all 16 slots). MASTER OPTIONS cursor
// on ADD PARTY MEMBER (idx 0); CHARACTER MENU is idx 2 → down down enter. The
// CHARACTER MENU cursor starts on EXIT; `left left` lands on REVIEW PC (the
// top-left option in the 5-option layout), highlighted in the committed fixture.
const CHARACTER_MENU_POPULATED_RECIPE: SaveStateRecipe = {
  name: 'character-menu-populated',
  description:
    'CHARACTER MENU over a FULL 16-char roster (REVIEW/DELETE/RENAME/PORTRAIT/' +
    'EXIT; no CREATE PC; REVIEW PC highlighted). Boots from full-roster.pcfile.dbs.',
  pcfileFixture: 'full-roster',
  steps: ['down down enter', 'left left'],
  settleMs: 300,
};

// review-member-view: WPCVW char-view (state 0x11) of THESUS in a 3-member
// pinned-roster party. THESUS IS the pinned roster char (slot 0), so this
// re-mints BYTE-EXACT vs the committed fixture (proven 100.00%). Drive: form a
// 3-member party (castle-3) → REVIEW MEMBER (down) → open REVIEW WHO? (enter,
// cursor on EXIT) → move to THESUS slot 0 (down) → open the view (enter).
const REVIEW_MEMBER_VIEW_RECIPE: SaveStateRecipe = {
  name: 'review-member-view',
  description:
    'WPCVW REVIEW MEMBER char-view of THESUS in a 3-member pinned-roster party ' +
    '(THESUS/TEMPEST/LYSANDR). Re-mints byte-exact (THESUS is the pinned roster slot 0).',
  steps: [...makeCastleRecipe(3).steps, 'down', 'enter', 'down', 'enter'],
  settleMs: 300,
};

// review-twink-shuriken: WPCVW char-view of TWINK (Faerie Ninja, squad slot 0)
// in a 3-member squad party (TWINK/BEAU/VEXA). TWINK carries SHURIKEN x15, which
// exercises the STACKABLE QUANTITY column the pinned-roster fixtures (all qty<=1)
// can't reach. Same nav as review-member-view, but boots the committed squad
// roster via pcfileFixture. RE: wpcvw-inventory-quantity.json.
const REVIEW_TWINK_SHURIKEN_RECIPE: SaveStateRecipe = {
  name: 'review-twink-shuriken',
  pcfileFixture: 'legendary-squad',
  description:
    'WPCVW char-view of TWINK (squad slot 0) carrying SHURIKEN x15 — exercises ' +
    'the stackable-quantity inventory column. 3-member squad party (TWINK/BEAU/VEXA).',
  steps: [...makeCastleRecipe(3).steps, 'down', 'enter', 'down', 'enter'],
  settleMs: 300,
};

// ── Camp SPELL read-only spellbook viewer (WPCVW SPELL action) ─────────────
// The char-view SPELL action opens a per-school spell browser: a 3×2 SCHOOL
// "grid" of colored school icons (FIRE/WATER/AIR top row, EARTH/MENTAL/DIVINE
// bottom row) with the currently-selected school's KNOWN spell list shown on the
// right + a COST/power bar. Same layout as the creation spell picker
// (creation-spell-* fixtures), just over a saved caster instead of a draft. The
// grid cursor navigates with arrows (down = within a column FIRE→WATER→AIR;
// right = row jump FIRE→EARTH — see SpellPickScreen.gridNextSchool); ENTER drills
// into the selected school's sublist (selects a spell + shows its COST).
//
// Target caster: TREON (pinned roster slot 4, M-Dracon MAGE) — knows Fire-L1
// (ENERGY BLAST). FIRE is grid cell 0 (the default cursor), so the screen opens
// on a NON-EMPTY FIRE list and ENTER immediately drills into the 1-spell FIRE
// sublist — minimal nav, byte-exact re-mint from the pinned roster.
//
// Reach (5-member party so slot 4 = TREON is reachable):
//   makeCastleRecipe(5)  → 5 pinned chars (THESUS/TEMPEST/LYSANDR/NOBAL/TREON),
//                          cursor back on ADD PARTY MEMBER (slot 0)
//   down                 → REVIEW MEMBER (MASTER OPTIONS slot 1)
//   enter                → REVIEW WHO? picker (cursor on EXIT)
//   down down down        → TREON (the picker is 2-col column-major: col0 =
//                          THESUS/LYSANDR/TREON, col1 = TEMPEST/NOBAL; 3 downs
//                          walk col0 to row 2 = TREON)
//   enter                → WPCVW char-view (cursor on EXIT, idx 6)
//   left left left down enter → SPELL action (idx 1): col-major 2-row menu
//                          EQUIP(0)/SPELL(1) col0; from EXIT, left×3 → EQUIP(0),
//                          down → SPELL(1) → opens spellbook on FIRE grid.
const SPELLBOOK_REACH: readonly string[] = [
  ...makeCastleRecipe(5).steps,
  'down', 'enter',                 // REVIEW MEMBER → REVIEW WHO? (cursor EXIT)
  'down down down',                // → TREON (col0 row 2)
  'enter',                         // → WPCVW char-view (cursor EXIT)
  'left left left down enter',     // → SPELL action → FIRE school grid
];

const SPELLBOOK_RECIPES: readonly SaveStateRecipe[] = [
  {
    name: 'spellbook-grid-fire',
    description:
      'Camp SPELL spellbook, SCHOOL grid — TREON (M-Dracon MAGE, pinned slot 4), ' +
      'cursor on FIRE (grid cell 0), FIRE known-spell list (ENERGY BLAST) shown. ' +
      'Re-mints byte-exact from the pinned roster.',
    steps: [...SPELLBOOK_REACH],
    settleMs: 300,
  },
  {
    name: 'spellbook-sublist-fire',
    description:
      'Camp SPELL spellbook, FIRE sublist — TREON, drilled into FIRE (ENTER on the ' +
      'grid): ENERGY BLAST selected, COST bar populated. Byte-exact re-mint.',
    steps: [...SPELLBOOK_REACH, 'enter'],
    settleMs: 300,
  },
  {
    name: 'spellbook-cancel',
    description:
      'Camp SPELL spellbook, CANCEL cell — TREON, cursor walked off the grid onto ' +
      'the CANCEL sentinel. From FIRE (cell 0): RIGHT (row-jump +3 → EARTH/cell 3), ' +
      'RIGHT again (3+3=6 out of range → CANCEL). The realm-label box reads "CANCEL" ' +
      '(gray), the SPELLS list is EMPTY, COST blank, and the CANCEL selection ' +
      'cursor — a solid bright-yellow block in the realm-row power cell ' +
      '(spellOuter col1 row12, screen x168 y128) — is shown in its ON phase. ' +
      'ENTER on CANCEL exits the spellbook (= ESC). Nav confirmed by driving the ' +
      'harness (right/left walk the ±3 row axis; the cancel cell sits past school 3 ' +
      'on the RIGHT axis). ' +
      'BLINK: the engine BLINKS that cursor block (~2 frames ON / ~2-3 OFF, a ' +
      'free-running ~4-5 frame period). The blink phase is a DETERMINISTIC function ' +
      'of the total stepped-frame count, so settleMs selects the phase: settleMs=343 ' +
      'lands the ON (yellow-block) phase reproducibly (verified across boots). The ' +
      'sibling grid-fire/sublist-fire fixtures likewise capture their selected-cell ' +
      'highlight ON. Do NOT change settleMs without re-checking the phase. Byte-exact re-mint.',
    steps: [...SPELLBOOK_REACH, 'right right'],
    settleMs: 343,
  },
  {
    name: 'spellbook-cancel-off',
    description:
      'Camp SPELL spellbook, CANCEL cell — SAME reach/cell as spellbook-cancel, ' +
      'but settleMs tuned to land the cursor\'s blink-OFF phase (the bright-yellow ' +
      'block ABSENT — the realm-row power cell shows BLACK). The engine blinks the ' +
      'cancel cursor ~2-3 frames ON / ~2 OFF; the phase is a deterministic function ' +
      'of the total stepped-frame count, so settleMs selects it. settleMs=300 lands ' +
      'OFF reproducibly (verified by reading the regen PNG: the cursor cell at ' +
      'screen x168 y128 is palette[0] black, not yellow). Gates the composer\'s ' +
      'cursorOn=false render. Do NOT change settleMs without re-checking the phase. ' +
      'Byte-exact re-mint.',
    steps: [...SPELLBOOK_REACH, 'right right'],
    settleMs: 300,
  },
];

// ── WPCVW char-view ACTION sub-screens (state 0x11) ────────────────────────
// All reached over the SAME 3-member pinned-roster party (THESUS/TEMPEST/
// LYSANDR) as review-member-view, then REVIEW MEMBER → REVIEW WHO? → THESUS
// (slot 0). THESUS is the pinned-roster slot-0 char, so these re-mint byte-exact
// against the committed engine fixtures (captured from the same THESUS party).
//
// CHAR-VIEW reach (after castle-3, cursor on ADD PARTY MEMBER):
//   down  → REVIEW MEMBER (slot 1)
//   enter → REVIEW WHO? picker (cursor on EXIT)
//   down  → slot 0 (THESUS)
//   enter → WPCVW char-view (cursor on EXIT, idx 6)
// Action menu is 7-entry column-major 2-row (EQUIP,ASSAY,SKILL,EXIT top /
// SPELL,SWAG,REVIEW bottom). From EXIT (idx 6) the reducer's ArrowLeft does
// idx>=2 ? idx-2 : idx, ArrowDown moves to the bottom row:
//   EQUIP (idx 0): left left left  ; ASSAY (idx 2): left left
//   SKILL (idx 4): left            ; SWAG  (idx 3): left left down
const CHAR_VIEW_REACH: readonly string[] = [
  ...makeCastleRecipe(3).steps, 'down', 'enter', 'down', 'enter',
];

// EQUIP wizard (per-slot picker). EQUIP = action idx 0 (left×3 + enter). The
// wizard opens on body slot 0 (PRIMARY WEAPON), cursor on NONE; ▸ LONGSWORD is
// the only candidate. Enter on slot 0 (cursor on NONE) advances to the next
// populated slot — but the fixtures want SPECIFIC frames:
//   equip-slot0        — body slot 0, cursor on NONE (initial frame)
//   equip-slot1-equipped — body slot 1, after equipping LONGSWORD (slot 0):
//                          cursor on NONE, ✓ LONGSWORD, ▸ BUCKLER
//   equip-slot1-selected — body slot 1, cursor moved onto BUCKLER (the only cand)
// Slot-0 commit per the e2e flow: ArrowDown (NONE→cand0=LONGSWORD) + Enter equips
// LONGSWORD and advances to slot 1 (cursor on NONE). One more ArrowUp lands the
// cursor on BUCKLER (the single slot-1 candidate).
const EQUIP_RECIPES: readonly SaveStateRecipe[] = [
  {
    name: 'equip-slot0',
    description:
      'WPCVW EQUIP wizard, body slot 0 (PRIMARY WEAPON), cursor on NONE, ▸ LONGSWORD. ' +
      'THESUS in a 3-member pinned-roster party — byte-exact re-mint.',
    steps: [...CHAR_VIEW_REACH, 'left left left enter'],
    settleMs: 300,
  },
  {
    name: 'equip-slot1-equipped',
    description:
      'WPCVW EQUIP wizard, body slot 1, after equipping LONGSWORD (slot 0): cursor on ' +
      'NONE, ✓ LONGSWORD, ▸ BUCKLER. THESUS 3-member party — byte-exact re-mint.',
    steps: [...CHAR_VIEW_REACH, 'left left left enter', 'down enter'],
    settleMs: 300,
  },
  {
    name: 'equip-slot1-selected',
    description:
      'WPCVW EQUIP wizard, body slot 1, cursor moved onto BUCKLER (boxed ▸). ' +
      'THESUS 3-member party — byte-exact re-mint.',
    steps: [...CHAR_VIEW_REACH, 'left left left enter', 'down enter', 'up'],
    settleMs: 300,
  },
];

// ASSAY flow. ASSAY = action idx 2 (left×2 + enter). The picker opens with the
// cursor on NONE; ArrowUp → TOP item (LONGSWORD) → Enter inspects it.
//   assay-picker    — carried-item picker, cursor on NONE
//   assay-longsword — read-only LONGSWORD stat popup
const ASSAY_RECIPES: readonly SaveStateRecipe[] = [
  {
    name: 'assay-picker',
    description:
      'WPCVW ASSAY inventory picker, cursor on NONE. THESUS 3-member pinned-roster ' +
      'party — byte-exact re-mint.',
    steps: [...CHAR_VIEW_REACH, 'left left enter'],
    settleMs: 300,
  },
  {
    name: 'assay-longsword',
    description:
      'WPCVW ASSAY read-only stat popup for LONGSWORD. THESUS 3-member party — ' +
      'byte-exact re-mint.',
    steps: [...CHAR_VIEW_REACH, 'left left enter', 'up enter'],
    settleMs: 300,
  },
];

// SKILL viewer (read-only). SKILL = action idx 4 (left + enter → WEAPONRY tab).
// Category tabs cycle: Enter advances the category, then arrows move the tab
// cursor. Per the e2e flow:
//   skill-viewer-weaponry — WEAPONRY (cat 0), tab cursor on PHYSICAL (entry 0)
//   skill-viewer-physical — PHYSICAL (cat 1) via Enter, ArrowDown → ACADEMIA (1)
//   skill-viewer-academia — ACADEMIA (cat 3) via Enter, ArrowRight → EXIT (2)
const SKILL_VIEWER_RECIPES: readonly SaveStateRecipe[] = [
  {
    name: 'skill-viewer-weaponry',
    description:
      'WPCVW SKILL viewer, WEAPONRY (cat 0), tab cursor on PHYSICAL. THESUS 3-member ' +
      'party — byte-exact re-mint.',
    steps: [...CHAR_VIEW_REACH, 'left enter'],
    settleMs: 300,
  },
  {
    name: 'skill-viewer-physical',
    description:
      'WPCVW SKILL viewer, PHYSICAL (cat 1), tab cursor on ACADEMIA. THESUS 3-member ' +
      'party — byte-exact re-mint.',
    steps: [...CHAR_VIEW_REACH, 'left enter', 'enter down'],
    settleMs: 300,
  },
  {
    name: 'skill-viewer-academia',
    description:
      'WPCVW SKILL viewer, ACADEMIA (cat 3), tab cursor on EXIT. THESUS 3-member ' +
      'party — byte-exact re-mint.',
    steps: [...CHAR_VIEW_REACH, 'left enter', 'enter down', 'enter right'],
    settleMs: 300,
  },
];

// SWAG BAG. SWAG = action idx 3 (left×2 + down + enter). The empty-bag menu is
// [ADD, EXIT] with cursor on EXIT; ArrowUp → ADD, Enter → add-picker (cursor on
// NONE), ArrowUp → LONGSWORD, Enter commits the carried→bag move.
//   swag-empty     — empty bag, menu [ADD,EXIT], cursor on EXIT
//   swag-longsword — bag=[LONGSWORD], menu [ADD,REMOVE,DROP,EXIT], cursor on EXIT
const SWAG_RECIPES: readonly SaveStateRecipe[] = [
  {
    name: 'swag-empty',
    description:
      'WPCVW SWAG BAG (empty), menu [ADD,EXIT], cursor on EXIT. THESUS 3-member ' +
      'pinned-roster party — byte-exact re-mint.',
    steps: [...CHAR_VIEW_REACH, 'left left down enter'],
    settleMs: 300,
  },
  {
    name: 'swag-longsword',
    description:
      'WPCVW SWAG BAG with LONGSWORD (after a carried→bag ADD), cursor on EXIT. ' +
      'THESUS 3-member party — byte-exact re-mint.',
    steps: [...CHAR_VIEW_REACH, 'left left down enter', 'up enter', 'up enter'],
    settleMs: 300,
  },
];

// review-member-equipped: SOLO 1-member party (THESUS), post-EQUIP commit — all
// 5 carried items equipped into their body slots. Reach: castle-1 → REVIEW
// MEMBER... but REVIEW WHO? needs 2+ members to even appear? No — REVIEW MEMBER
// (MASTER-OPTIONS slot 1) is available with 1 member; it opens the char-view
// directly (single member). From the char-view, EQUIP (left×? — SOLO menu is
// 6-entry [EQUIP,SPELL,ASSAY,SWAG,SKILL,EXIT], EXIT idx 5; left from 5 → 3, 3 →
// 1, 1 → ... EQUIP is idx 0). Then Enter through every populated body slot to
// equip all 5 items, then exit the wizard back to the char-view.
const REVIEW_MEMBER_EQUIPPED_RECIPE: SaveStateRecipe = {
  name: 'review-member-equipped',
  description:
    'WPCVW char-view of THESUS in a SOLO party, post-EQUIP commit (all 5 carried items ' +
    'equipped). 6-entry menu (no REVIEW), EXIT highlighted. Byte-exact re-mint.',
  // SOLO reach: castle-1 (cursor on ADD) → down (REVIEW MEMBER) → enter (1
  // member ⇒ char-view opens directly, cursor on EXIT). The SOLO menu's action
  // grid is 2-COLUMN (engine nav stride cols=2, verified by driving):
  //   [EQUIP(0),SPELL(1),ASSAY(2),SWAG(3),SKILL(4),EXIT(5)] — Left = idx-2,
  //   Up = idx%2!==0 ? idx-1. EQUIP(0) from EXIT(5): left(5→3) up(3→2) left(2→0).
  // Then EQUIP wizard: each populated body slot (0,1,4,5,7) starts cursor on
  // NONE → down (onto the single candidate) → enter equips + auto-advances; after
  // the 5th item the wizard returns to the char-view (cursor on EXIT) — exactly
  // 5 `down enter` (a 6th would exit the char-view back to MASTER OPTIONS).
  // Verified frame-by-frame: 5 equips → AC "9 (-1)", all items recolored, menu
  // with EXIT highlighted = the committed review-member-equipped fixture.
  steps: [
    ...makeCastleRecipe(1).steps,
    'down', 'enter',                 // REVIEW MEMBER → SOLO char-view (cursor EXIT)
    'left up left enter',            // → EQUIP wizard (slot 0)
    'down enter',                    // slot 0: equip LONGSWORD
    'down enter',                    // slot 1: equip BUCKLER
    'down enter',                    // slot 4: equip CUIRASS
    'down enter',                    // slot 5: equip LEGGING
    'down enter',                    // slot 7: equip SANDALS → back to char-view
  ],
  settleMs: 300,
};

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
  // FIGHTER flow (Human male, class index 0 — ALWAYS at picker position 0, so a
  // bare `enter` selects it regardless of the random bonus roll) — portrait
  // waypoint. The sidecar records the actual rolled/derived draft.
  {
    name: 'creation-portrait-select',
    description: 'NATHAN Human-male FIGHTER portrait picker (serialize-state mint; data-driven sidecar).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'n a t h a n enter',          // NAME
      'enter',                      // RACE: Human
      'enter',                      // SEX: Male
      'enter',                      // CLASS: Fighter (index 0 — always picker pos 0)
      BONUS_DRAIN,                  // BONUS: distribute the random pool across all attrs
      'enter',                      // KARMA → PORTRAIT
    ],
    settleMs: 300,
  },
  // FIGHTER skill-train waypoints (Human male, class 0 — always picker pos 0).
  // WEAPONRY is the default category on SKILLS entry; cursor starts on slot 0.
  {
    name: 'creation-skill-train',
    description: 'NATHAN Human-male FIGHTER skill-train, WEAPONRY, full budget unspent (serialize-state mint).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'n a t h a n enter',
      'enter',        // RACE: Human
      'enter',        // SEX: Male
      'enter',        // CLASS: Fighter (index 0)
      BONUS_DRAIN,    // BONUS: distribute pool
      'enter',        // KARMA
      'enter',        // PORTRAIT → SKILLS (WEAPONRY, cursor 0, full budget)
    ],
    settleMs: 300,
  },
  {
    name: 'creation-skill-train-done',
    description: 'NATHAN Human-male FIGHTER skill-train, budget exhausted (serialize-state mint).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'n a t h a n enter',
      'enter',
      'enter',
      'enter',
      BONUS_DRAIN,
      'enter',
      'enter',        // PORTRAIT → SKILLS
      // Drain the full budget into the cursor skill (no exit enter — stay on screen).
      'right right right right right right right right right right ' +
        'right right right right right right right right right right',
    ],
    settleMs: 300,
  },
  {
    name: 'creation-confirm',
    description: 'NATHAN Human-male FIGHTER "SAVE THIS CHARACTER? YES NO" (serialize-state mint).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'n a t h a n enter',
      'enter',
      'enter',
      'enter',
      BONUS_DRAIN,
      'enter',
      'enter',
      SKILL_DRAIN,    // SKILLS drain + exit → confirm
    ],
    settleMs: 300,
  },
  {
    name: 'creation-skill-train-physical',
    description:
      'NATHAN Human-male FIGHTER skill-train, PHYSICAL category, SCOUTING only (serialize-state mint).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'n a t h a n enter',
      'enter',                                             // RACE: Human
      'enter',                                             // SEX: Male
      'enter',                                             // CLASS: Fighter (index 0)
      BONUS_DRAIN,                                         // BONUS
      'enter',                                             // KARMA
      'enter',                                             // PORTRAIT → SKILLS (WEAPONRY)
      'enter',                                             // → PHYSICAL category (▶ = Enter cycles category while budget > 0)
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
      BONUS_DRAIN,           // BONUS
      'enter',         // KARMA
      'enter',         // PORTRAIT
      SKILL_DRAIN,           // SKILLS → spell pick
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
      BONUS_DRAIN,
      'enter',
      'enter',
      SKILL_DRAIN,
      // School grid is 2 rows × 3 cols — row0 FIRE(0)/WATER(1)/AIR(2),
      // row1 EARTH(3)/MENTAL(4)/DIVINE(5). 'down' moves within a column
      // (FIRE→WATER→AIR); 'right' jumps to the next row (FIRE→EARTH). See
      // SpellPickScreen.gridNextSchool.
      'down', // FIRE → WATER
    ],
    settleMs: 300,
  },
  {
    name: 'creation-spell-grid-air',
    description: 'M-Elf Mage spell picker, AIR grid (empty list — CANCEL only) (serialize-state mint).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'm a g e enter',
      'down enter',
      'enter',
      'down enter',
      BONUS_DRAIN,
      'enter',
      'enter',
      SKILL_DRAIN,
      'down down', // FIRE → WATER → AIR
    ],
    settleMs: 300,
  },
  {
    name: 'creation-spell-grid-earth',
    description: 'M-Elf Mage spell picker, EARTH grid (serialize-state mint).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'm a g e enter',
      'down enter',
      'enter',
      'down enter',
      BONUS_DRAIN,
      'enter',
      'enter',
      SKILL_DRAIN,
      'right', // FIRE → EARTH (row jump)
    ],
    settleMs: 300,
  },
  {
    name: 'creation-spell-sublist-chill',
    description: 'M-Elf Mage WATER sub-list, CHILLING TOUCH selected (serialize-state mint).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'm a g e enter',
      'down enter',
      'enter',
      'down enter',
      BONUS_DRAIN,
      'enter',
      'enter',
      SKILL_DRAIN,
      'down',  // FIRE → WATER grid
      'enter', // open sub-list, first spell (CHILLING TOUCH)
    ],
    settleMs: 300,
  },
  {
    name: 'creation-spell-sublist-terror',
    description: 'M-Elf Mage WATER sub-list, TERROR selected (serialize-state mint).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'm a g e enter',
      'down enter',
      'enter',
      'down enter',
      BONUS_DRAIN,
      'enter',
      'enter',
      SKILL_DRAIN,
      'down',       // FIRE → WATER grid
      'enter',      // open sub-list
      'down',       // CHILLING TOUCH → TERROR
    ],
    settleMs: 300,
  },
  // ── minimal-roster: full creation → SAVE (drives the roll) ──────────────────
  // Drives a FULL creation to completion (NATHAN, Human-male FIGHTER) → SAVE →
  // YES, returning to the CHARACTER MENU. The created NATHAN lands in the
  // EPHEMERAL gameDir's pcfile.dbs (proven persisted on disk) AND in RAM
  // occupancy — but dosbox-pure's savestate does NOT capture host-mounted-file
  // writes, so the disk record is LOST on re-mount and a frozen state can't be
  // reviewed for NATHAN (the picker shows a 7th entry from RAM occupancy but the
  // re-read pcfile slot 6 is zero). See docs/re/findings/creation-save-persistence.json.
  //
  // This recipe is therefore used ONLY by gen-nathan-pcfile.ts, which drives it
  // once and harvests the freshly-created NATHAN record from the gameDir disk to
  // bake the committed 1-char source pcfile (minimal-roster.pcfile.dbs). Review/
  // roster-management fixtures boot from THAT pcfile via `pcfileFixture`, which is
  // fully deterministic (no roll). The SAVE flow: at the confirm screen YES is
  // highlighted; a single `enter` saves + returns to CHARACTER MENU.
  {
    name: 'minimal-roster',
    description:
      'Drives NATHAN/Human-male/FIGHTER creation→SAVE→YES. Used by ' +
      'gen-nathan-pcfile.ts to harvest the created record into the committed ' +
      '1-char source pcfile (savestate cannot persist the disk write itself).',
    steps: [
      ...CREATE_PC_PROLOGUE,
      'n a t h a n enter', // NAME
      'enter',             // RACE: Human
      'enter',             // SEX: Male
      'enter',             // CLASS: Fighter (index 0)
      BONUS_DRAIN,         // BONUS: distribute the random pool
      'enter',             // KARMA
      'enter',             // PORTRAIT → SKILLS
      SKILL_DRAIN,         // SKILLS drain + exit → confirm (SAVE? YES NO, YES highlit)
      'enter',             // YES → SAVE → CHARACTER MENU (cursor on EXIT)
    ],
    settleMs: 300,
  },
  // Roster-management waypoints over the committed 1-char NATHAN roster. Each
  // boots from a fresh image overlaid with minimal-roster.pcfile.dbs (the same
  // baked-in NATHAN/Human-male FIGHTER that creation-review-character reviews) —
  // dosbox-pure savestate cannot persist an in-game SAVE's disk write, so the
  // roster char is baked into the boot image instead (docs/re/findings/
  // creation-save-persistence.json). Fully deterministic (no creation roll).
  // CHARACTER MENU (down down enter) — POPULATED-roster layout (6 options,
  // col-major; cursor STARTS on EXIT, bottom-right):
  //   col0: CREATE PC (r0) | REVIEW PC (r1)
  //   col1: DELETE PC (r0) | RENAME PC (r1)
  //   col2: PORTRAIT  (r0) | EXIT      (r1)  ← cursor start
  // From EXIT: REVIEW=left left ; DELETE=left up ; RENAME=left ; PORTRAIT=up.
  {
    name: 'creation-review-picker',
    description: 'REVIEW WHO? roster picker over the 1-char NATHAN roster (deterministic).',
    pcfileFixture: 'minimal-roster',
    steps: ['down down enter', 'left left enter'], // CHAR MENU (cursor on EXIT) → REVIEW PC
    settleMs: 300,
  },
  {
    name: 'creation-review-character',
    description:
      'REVIEW PC char-sheet of the freshly-CREATED NATHAN (Human-male FIGHTER), the ' +
      'sole roster char. Boots from a 1-char NATHAN pcfile baked into the source ' +
      '(minimal-roster.pcfile.dbs) — dosbox-pure savestate does NOT persist the ' +
      'in-game SAVE disk write, so the created char is baked into the boot image ' +
      'instead (docs/re/findings/creation-save-persistence.json). Read-only sheet → ' +
      'BONUS row hidden (engine *0x56ac = 0xffff sentinel). Deterministic (no roll).',
    pcfileFixture: 'minimal-roster',
    // Fresh boot: MASTER OPTIONS → CHARACTER MENU (down down enter); cursor on EXIT
    // → REVIEW PC (left left enter) → REVIEW WHO? picker (single char) → NATHAN (enter).
    steps: ['down down enter', 'left left enter', 'enter'],
    settleMs: 300,
  },
  {
    name: 'creation-delete-picker',
    description: 'DELETE WHO? roster picker over the 1-char NATHAN roster (deterministic).',
    pcfileFixture: 'minimal-roster',
    steps: ['down down enter', 'left up enter'], // CHAR MENU (cursor on EXIT) → DELETE PC (col1,row0)
    settleMs: 300,
  },
  {
    name: 'creation-delete-confirm',
    description: 'DELETE THIS CHARACTER? YES NO over the 1-char NATHAN roster (deterministic).',
    pcfileFixture: 'minimal-roster',
    steps: ['down down enter', 'left up enter', 'enter'], // DELETE PC → pick first → confirm
    settleMs: 300,
  },
  {
    name: 'creation-rename-picker',
    description: 'RENAME WHO? roster picker over the 1-char NATHAN roster (deterministic).',
    pcfileFixture: 'minimal-roster',
    steps: ['down down enter', 'left enter'], // CHAR MENU (cursor on EXIT) → RENAME PC (col1,row1)
    settleMs: 300,
  },
  {
    name: 'creation-rename-input',
    description: 'RENAME char-sheet + NEW NAME > input over the 1-char NATHAN roster (deterministic).',
    pcfileFixture: 'minimal-roster',
    steps: ['down down enter', 'left enter', 'enter'], // RENAME PC → pick first → input
    settleMs: 300,
  },
  {
    name: 'creation-portrait-target-picker',
    description: 'PORTRAIT FOR WHOM? roster picker over the 1-char NATHAN roster (deterministic).',
    pcfileFixture: 'minimal-roster',
    steps: ['down down enter', 'up enter'], // CHAR MENU (cursor on EXIT) → PORTRAIT (col2,row0)
    settleMs: 300,
  },
  {
    name: 'portrait-picker-squad',
    description:
      'PORTRAIT FOR WHOM? roster picker over the committed 6-char legendary-squad ' +
      'roster (TWINK/BEAU/VEXA/SABLE/EMBER/QUILL). MULTI-CHAR coverage for the ' +
      'wpcmk_show_roster_picker composer: exercises NON-cursor rows above AND below ' +
      'the highlighted row. Cursor moved down to row 2 (VEXA) so rows 0-1 (above) and ' +
      'rows 3-5 (below) are all non-cursor. Deterministic (no creation roll).',
    pcfileFixture: 'legendary-squad',
    // Fresh boot: MASTER OPTIONS → CHARACTER MENU (down down enter); cursor on EXIT
    // → PORTRAIT (up enter) → PORTRAIT FOR WHOM? picker (cursor on row 0) → down down
    // moves cursor to row 2 (VEXA).
    steps: ['down down enter', 'up enter', 'down down'],
    settleMs: 300,
  },
  {
    name: 'creation-portrait-change',
    description: 'PORTRAIT change active — char sheet + picker over the 1-char NATHAN roster (deterministic).',
    pcfileFixture: 'minimal-roster',
    steps: ['down down enter', 'up enter', 'enter'], // PORTRAIT → pick first → change
    settleMs: 300,
  },
  {
    name: 'creation-portrait-done',
    description: 'PORTRAIT post-change preview over the 1-char NATHAN roster (deterministic).',
    pcfileFixture: 'minimal-roster',
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

// ── Maze corridor (wmaze.ovr state 5) — zone-0 first-person dungeon frame ────
// Drives a fresh boot → MASTER OPTIONS → builds a 3-member pinned-roster party
// (castle-3: THESUS/TEMPEST/LYSANDR) → START NEW GAME → scenario → into the
// dungeon, then dismisses the "approaching the gate" narration and walks the
// party forward to the corridor-at-gate frame (party facing the green portcullis
// gate). The proven drive lives in tools/libretro/trace-maze.ts driveToMaze()
// (and is mirrored by the recipe `steps` below).
//
// After castle-3 the MASTER OPTIONS cursor is back on ADD PARTY MEMBER (slot 0);
// `down down down` reaches START NEW GAME, then enter (start) / enter (scenario)
// / enter (→ dungeon, triggers narration). The trailing `enter`s dismiss the
// narration and step the party forward to the gate.
//
// NON-DETERMINISTIC ANIMATION PHASE → COMMITTED SERIALIZE-STATE. The corridor view
// has a FREE-RUNNING per-frame animation (a torch/gate flicker at the gate center,
// pixel x160 y68, toggling palette 5↔8). It advances every frame regardless of
// input and is NOT a function of the stepped-frame count, so the live recipe drive
// lands on a RANDOM phase run-to-run (verified: extra-settle sweeps + 8-rep repeats
// all varied). It is therefore captured via the project's --mint precedent: a
// COMMITTED frozen serialize-state (test-fixtures/states/maze-corridor.state.gz)
// re-renders BYTE-EXACT via unserialize → step → fb (verified 0-pixel diff x6).
// build-state.ts renders the fixture FROM that committed state (deterministic) and
// `--check` gates it at 100%. To re-mint a NEW phase, delete the committed state.gz
// and re-run `build-state maze-corridor` (it then live-drives + re-freezes).
//
// The tap-only recipe drive below reaches the corridor-at-gate frame (verified by
// eyeballing the PNG); it is what was driven to produce the committed state.
// Do NOT run `build-state maze-corridor --mint` on this recipe: --mint calls
// dumpDraft() (creation-screen-specific) and will fail on a state-5 maze frame.
// Re-mint via the bare `build-state maze-corridor` (delete the state.gz first).
const MAZE_CORRIDOR_RECIPE: SaveStateRecipe = {
  name: 'maze-corridor',
  description:
    'wmaze.ovr zone-0 first-person corridor frame (state 5): 3-member pinned-roster ' +
    'party (THESUS/TEMPEST/LYSANDR) facing the green portcullis gate. START NEW GAME ' +
    'over castle-3, narration dismissed + walked forward to the gate. NON-DETERMINISTIC ' +
    'animation phase → fixture re-mints from a committed serialize-state (see note above).',
  steps: [
    ...makeCastleRecipe(3).steps, // build the 3-member party (cursor → ADD PARTY MEMBER)
    'down down down',             // ADD PARTY MEMBER → START NEW GAME
    'enter',                      // START NEW GAME
    'enter',                      // scenario pick
    'enter',                      // → dungeon (game_state 5, triggers narration)
    // Dismiss the "approaching the gate" narration + walk forward to the gate.
    'enter', 'enter', 'enter', 'enter', 'enter', 'enter',
  ],
  settleMs: 300,
};

// ── Additional maze corridor fixtures (Task 10, 2026-06-04) ──────────────────
// Two extra corridor frames derived from maze-corridor.state.gz by input:
//   maze-corridor-turn-left  — one 'left' turn from the gate frame → facing 3,
//                              open corridor ahead (0 wall spans).
//   maze-corridor-lookback   — two 'right' turns (180°) → facing 2, looking
//                              back down the corridor (4 wt=2 spans, depths 0..3).
// These are NOT build-state.ts recipes — they are captured by
// tools/libretro/capture-maze-frames.ts (unserialize maze-corridor.state.gz →
// input → step 40 → fb → idx.gz). Party: same cell (x=5, gx=127, gy=121, z=0)
// as the base frame; only facing and rendered view differ.
// Per-frame party, slot5220, spans + shared cell geometry committed to
// tools/parity/fixtures/engine/maze-frames.json for use by Task-11 parity tests.
// To recapture: pnpm tsx tools/libretro/capture-maze-frames.ts

// ── Boot / intro / title sequence (winit.ovr states 0/1/2 → wbase state 4) ───
// These frames auto-play from a cold boot BEFORE the normal title-dismiss prelude;
// each is captured at a fixed boot-frame count (bootCapture, not steps). The intro
// holds each frame on a multi-frame plateau (sir-tech logo, author credit, title-art
// logo peak, each scroll-paused credit page, the settled title page), so a single
// frame count reproduces it byte-exact. Frame counts picked mid-plateau for slack;
// the engine's per-frame intervals are deterministic under the libretro harness.
//   boot order: sirtech-logo (≈51–159) → author-credit (≈161–205) →
//   title-art logo peak (≈331–338) → credits scroll (title-page ≈1481–1495,
//   title-page-2 ≈1818–1828) → settled title-art-copyright (≈1965+, waits for enter).
// main-menu / main-menu-2 are the empty-party MASTER OPTIONS at the two phases of
// the fountain water animation: after dismissing the title (enter), the water
// settles into phase-0 (main-menu-2) then oscillates to phase-1 (main-menu).
const BOOT_RECIPES: readonly SaveStateRecipe[] = [
  {
    name: 'sirtech-logo',
    description: 'Boot intro: Sir-Tech dragon logo splash (winit state 1).',
    steps: [],
    bootCapture: { bootFrames: 100 },
  },
  {
    name: 'author-credit',
    description: 'Boot intro: "A Fantasy Role-Playing Simulation by D.W.Bradley" author credit.',
    steps: [],
    bootCapture: { bootFrames: 180 },
  },
  {
    name: 'title-art',
    description: 'Boot intro: Wizardry title art over the Bane-of-the-Cosmic-Forge scene (logo fully formed, pre-scroll).',
    steps: [],
    bootCapture: { bootFrames: 335 },
  },
  {
    name: 'title-page',
    description: 'Boot intro: credits scroll mid-roll — "PlayMasters Guide / Sound Effects" page (scroll-paused plateau).',
    steps: [],
    bootCapture: { bootFrames: 1488 },
  },
  {
    name: 'title-page-2',
    description: 'Boot intro: credits scroll mid-roll — "Digitized Sound Programming" page (scroll-paused plateau).',
    steps: [],
    bootCapture: { bootFrames: 1822 },
  },
  {
    name: 'title-art-copyright',
    description: 'Boot intro: settled title page with copyright line (post-scroll hold; waits for enter to advance).',
    steps: [],
    bootCapture: { bootFrames: 2030 },
  },
  {
    name: 'main-menu',
    description: 'MASTER OPTIONS, empty party, fountain water phase 1 (post-title; ADD PARTY MEMBER highlighted).',
    steps: [],
    bootCapture: { bootFrames: 3000, dismissTitle: true, afterFrames: 44 },
  },
  {
    name: 'main-menu-2',
    description: 'MASTER OPTIONS, empty party, fountain water phase 0 (post-title; ADD PARTY MEMBER highlighted).',
    steps: [],
    bootCapture: { bootFrames: 3000, dismissTitle: true, afterFrames: 33 },
  },
];

export const STATE_CATALOG: readonly SaveStateRecipe[] = [
  ...SEED_CATALOG,
  ...BOOT_RECIPES,
  ...CASTLE_RECIPES,
  ...CASTLE_MEMBERS_ALIASES,
  ADD_PARTY_PICKER_RECIPE,
  CHARACTER_MENU_EMPTY_RECIPE,
  CHARACTER_MENU_POPULATED_RECIPE,
  REVIEW_MEMBER_VIEW_RECIPE,
  REVIEW_TWINK_SHURIKEN_RECIPE,
  ...EQUIP_RECIPES,
  ...ASSAY_RECIPES,
  ...SKILL_VIEWER_RECIPES,
  ...SWAG_RECIPES,
  REVIEW_MEMBER_EQUIPPED_RECIPE,
  ...SPELLBOOK_RECIPES,
  ...PICKER_RECIPES,
  ...CREATION_RECIPES,
  MAZE_CORRIDOR_RECIPE,
];

export function findRecipe(name: string): SaveStateRecipe | undefined {
  return STATE_CATALOG.find((r) => r.name === name);
}
