/**
 * screen-parity.test.ts — full-resolution RGB parity vs committed engine fixtures.
 *
 * For each ported screen we render our 320×200 frame and compare it pixel-for-
 * pixel (tolerance 0, full RGB) against the engine's real framebuffer, committed
 * under `fixtures/engine/<name>.idx.gz` (see that dir's README). No `.sav` is
 * read at test time — the fixtures are permanent derivatives of the DOSBox saves.
 *
 * The assertion is a **regression floor**, not the goal: each screen records its
 * current match % and we fail if a change drops below it. The TARGET is 100% and
 * we're there — all three creation screens (character-menu empty + populated,
 * name-input) are pixel-exact. On a shortfall, inspect the diff PNG in /tmp.
 *
 * Getting here required fixing a 16-scanline vertical offset in decode-screen.ts
 * (VRAM_OFFSET_IN_BLOB): the fixtures used to be shifted down 16px, which pinned
 * the comparison at ~80% even though our tile placement was already byte-exact
 * (cell-grid parity is blind to a uniform pixel shift).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIZ6_MAIN, FontSchema, Font4bppSchema, MessageDbSchema, PortraitSetSchema, ScenarioDbSchema, classOffered, resolveCarryCapacityMax, CreationDraftSidecarSchema, availableSkillSlots } from '../../packages/data/src/index.js';
import type { Font, Font4bpp, Palette, MessageDb, PortraitSet } from '../../packages/data/src/index.js';
import { setCursor, puts, type FontSet } from '../../packages/parser/src/index.js';
import { loadCreationFontSet } from '../../packages/viewer/src/pages/roster/creation/ega/assets.js';
import { renderCreationFrame } from '../../packages/viewer/src/pages/roster/creation/ega/render-frame.js';
import { createPersistentWindows } from '../../packages/viewer/src/pages/roster/creation/ega/windows.js';
import { composeSkillTrainFrame, patchFontSetWithPortrait, SKILL_CATEGORIES } from '../../packages/viewer/src/pages/roster/creation/ega/skill-train-frame.js';
import { composeReviewPickerFrame } from '../../packages/viewer/src/pages/roster/creation/ega/review-picker-frame.js';
import { highlightRange } from '../../packages/viewer/src/pages/roster/creation/ega/highlight.js';
import { drawCharSheet } from '../../packages/viewer/src/pages/roster/creation/ega/char-sheet.js';
import { composeCharacterViewFrame } from '../../packages/viewer/src/pages/castle/compose-character-view-frame.js';
import { composeMainPanel } from '../../packages/viewer/src/pages/castle/compose-main-panel.js';
import { composeEquipPicker } from '../../packages/viewer/src/pages/castle/compose-equip-picker.js';
import { composeInventoryPicker } from '../../packages/viewer/src/pages/castle/compose-inventory-picker.js';
import { composeAssayDisplay } from '../../packages/viewer/src/pages/castle/compose-assay-display.js';
import { composeSkillViewer } from '../../packages/viewer/src/pages/castle/compose-skill-viewer.js';
import { composeSwagBag } from '../../packages/viewer/src/pages/castle/compose-swag-bag.js';
import { skillTabEntries } from '../../packages/viewer/src/pages/castle/character-view-reducer.js';
import { buildInventoryItems, scenarioItemName } from '../../packages/viewer/src/pages/castle/item-display.js';
import { equipCandidates, assayItem, skillViewerRows, applyEquipSelections } from '../../packages/data/src/index.js';
import { blankDraft } from '../../packages/viewer/src/pages/roster/creation/state.js';
import { draftFromCharacter } from '../../packages/viewer/src/pages/roster/creation/lib/draft-from-character.js';
import { draftFromEngineDump } from '../../packages/viewer/src/pages/roster/creation/lib/draft-from-engine-dump.js';
import type { ActivePartyMember, Character } from '../../packages/data/src/index.js';
import { raceName, className, creationString, MSG, skillName } from '../../packages/viewer/src/pages/roster/creation/messages.js';
import { encodePngRgba } from '../../packages/cli/src/lib/png.js';
import { compareRgba, writeDiffPng } from './diff-image.js';
import { indicesToRgba } from './decode-screen.js';

// ─── Paths (worktree-aware) ────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function mainRoot(): string {
  try {
    const g = readFileSync(join(REPO_ROOT, '.git'), 'utf-8');
    const m = /gitdir:\s*(.+)/.exec(g);
    if (m) return resolve(m[1]!.trim().replace(/\/worktrees\/[^/]+$/, ''), '..');
  } catch {
    /* not a worktree */
  }
  return REPO_ROOT;
}

const EXTRACTED_FONTS = join(mainRoot(), 'extracted', 'fonts');
const EXTRACTED_MESSAGES = join(mainRoot(), 'extracted', 'messages');
const EXTRACTED_PORTRAITS = join(mainRoot(), 'extracted', 'portraits');
const EXTRACTED_SCENARIO = join(mainRoot(), 'extracted', 'scenario');
const FIXTURES_ENGINE = join(mainRoot(), 'tools', 'parity', 'fixtures', 'engine');

// ─── Loaders ───────────────────────────────────────────────────────────────────

async function diskLoadFont(url: string): Promise<Font> {
  return FontSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_FONTS, url.replace(/^\/fonts\//, '')), 'utf-8')),
  );
}
async function diskLoadFont4bpp(url: string): Promise<Font4bpp> {
  return Font4bppSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_FONTS, url.replace(/^\/fonts\//, '')), 'utf-8')),
  );
}

/** Load a committed engine fixture as a 320×200 RGBA buffer (no .sav read). */
function engineRgba(name: string): Uint8Array {
  const raw = gunzipSync(readFileSync(join(FIXTURES_ENGINE, `${name}.idx.gz`)));
  if (raw.length !== 64000) {
    throw new Error(`fixture "${name}": expected 64000 index bytes, got ${raw.length}`);
  }
  return indicesToRgba(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength));
}

// ─── CHARACTER MENU helper (column-major, cols [4,16,28], rows [1,2]) ──────────
// Authoritative layout: packages/viewer/tests/.../cell-parity.test.ts.

const COL_X = [4, 16, 28];
const ROW_Y = [1, 2];

function renderCharacterMenu(
  fontSet: FontSet,
  palette: Palette,
  labels: string[],
  selected: number | null,
): Uint8ClampedArray {
  const { top, bottomBar, menuPanel } = createPersistentWindows();
  labels.forEach((label, i) => {
    setCursor(bottomBar, COL_X[Math.floor(i / 2)]!, ROW_Y[i % 2]!);
    puts(bottomBar, label, 0x03);
  });
  if (selected !== null) {
    const c = Math.floor(selected / 2);
    const r = selected % 2;
    highlightRange(bottomBar, COL_X[c]!, ROW_Y[r]!, labels[selected]!.length, 5);
  }
  return renderCreationFrame([top, bottomBar, menuPanel], fontSet, palette);
}

// ─── NAME INPUT helper (empty buffer + cursor) ─────────────────────────────────

function renderNameInput(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Engine fixture state (empty input — single-letter blink-off state at the
  // start of typing). Per the live struct dump from the save:
  //   col 17:    char 'a' (97) attr 0x10 — wfont0 glyph 97 is the SOLID-BLOCK
  //              cursor sprite (not a lowercase letter).
  //   col 18..24: spaces attr 0x00 (empty field).
  const { top, bottomBar, menuPanel } = createPersistentWindows();
  // Name-input renders typed text + cursor in COLORED highlight mode (yellow
  // text on black, white cursor block on black) — override the bottomBar's
  // default invertHighlight=true (which is right for the character-menu
  // selection cursor, wrong here).
  bottomBar.invertHighlight = false;
  const PROMPT = 'CHARACTER NAME >';
  const NAME_MAX_LENGTH = 7;
  setCursor(bottomBar, 1, 1);
  puts(bottomBar, PROMPT, 0x03);
  setCursor(bottomBar, 1 + PROMPT.length, 1);
  puts(bottomBar, 'a', 0x10); // wfont0 0x61 = cursor block sprite
  puts(bottomBar, ' '.repeat(NAME_MAX_LENGTH), 0x00);
  return renderCreationFrame([top, bottomBar, menuPanel], fontSet, palette);
}

// ─── RACE SELECT helper (char-sheet + race list + prompt) ──────────────────────
// Engine state: draft.name='NATHAN', race=null (not yet picked), HUMAN selected.

let msgDb: MessageDb;

function renderRaceSelect(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  const { top, bottomBar, menuPanel } = createPersistentWindows();
  const draft = { ...blankDraft(), name: 'NATHAN' };
  drawCharSheet(top, draft, msgDb, creationString(msgDb, MSG.raceTitle));
  const prompt = creationString(msgDb, MSG.racePrompt);
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - prompt.length) / 2), 1);
  puts(bottomBar, prompt, 0x03);
  for (let i = 0; i < 11; i++) {
    const label = raceName(msgDb, i);
    setCursor(menuPanel, 1, i + 1);
    puts(menuPanel, label, 0x03);
    if (i === 0) highlightRange(menuPanel, 1, i + 1, label.length, 5);
  }
  return renderCreationFrame([top, bottomBar, menuPanel], fontSet, palette);
}

// ─── CLASS / PROFESSION SELECT helper (post-sex, bonus rolled) ─────────────────
// State: NATHAN, Human male. Stats + bonusPool come from the COMMITTED sidecar
// (the engine's decoded draft at the class-screen waypoint), re-minted byte-exact
// from test-fixtures/states/creation-class-select.state.gz — NOT hardcoded. The
// qualifying-class list is derived from those LIVE stats via classOffered, so
// the rendered list always matches whatever roll the fixture froze.

function loadDraftSidecar(name: string) {
  return CreationDraftSidecarSchema.parse(
    JSON.parse(readFileSync(join(FIXTURES_ENGINE, `${name}.character.json`), 'utf-8')),
  );
}

function renderClassSelect(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  const { top, bottomBar, menuPanel } = createPersistentWindows();
  // On the class-SELECT screen no class is committed yet, so the char-sheet
  // shows no class title (the engine record carries a default class byte that
  // the screen doesn't display). Force class=null to match — the picker below
  // is what offers the choice.
  const draft = { ...draftFromEngineDump(loadDraftSidecar('creation-class-select')), class: null };
  drawCharSheet(top, draft, msgDb, creationString(msgDb, MSG.classTitle));
  const prompt = creationString(msgDb, MSG.classPrompt);
  setCursor(bottomBar, Math.ceil((bottomBar.widthCells - prompt.length) / 2), 1);
  puts(bottomBar, prompt, 0x03);
  // Two-column profession list — see MenuPickerScreen.menuCellOf.
  const ROWS_PER_COL = 11;
  const COL_STRIDE = 10;
  let n = 0;
  for (let i = 0; i < 14; i++) {
    if (!classOffered(draft.attributes, draft.bonusPool, draft.sex!, i)) continue;
    const label = className(msgDb, i);
    const col = Math.floor(n / ROWS_PER_COL);
    const x = 1 + col * COL_STRIDE;
    const row = (n % ROWS_PER_COL) + 1;
    setCursor(menuPanel, x, row);
    puts(menuPanel, label, 0x03);
    if (n === 0) highlightRange(menuPanel, x, row, label.length, 5);
    n++;
  }
  return renderCreationFrame([top, bottomBar, menuPanel], fontSet, palette);
}

/** Load all three wport portrait files (idx 0-13 / 14-27 / 28-41). */
function loadAllPortraits(): PortraitSet[] {
  return ['wport1', 'wport2', 'wport3'].map((f) =>
    PortraitSetSchema.parse(JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, `${f}.json`), 'utf-8'))),
  );
}

// ─── PORTRAIT SELECT helper (post-karma; portrait sub-window open) ────────────
// Re-minted via serialize-state (test-fixtures/states/creation-portrait-select.
// state.gz); stats + bonusPool(=0, drained) + derived HP/STM/age come from the
// COMMITTED sidecar, NOT hardcoded. The portrait sprite is a 3×3 tile grid at
// menuPanel cells (8,3)..(10,5) drawn at attr 0x02 (wfont2). The engine loads
// the character's portrait into the wfont2 slot; the wfont2 patch is DATA-DRIVEN
// from the sidecar's rendered_portrait_index (patchFontSetWithPortrait resolves
// wport1/2/3 by index/14).

function renderPortraitSelect(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  const { top, bottomBar, menuPanel } = createPersistentWindows();
  const dumped = draftFromEngineDump(loadDraftSidecar('creation-portrait-select'));
  // The PORTRAIT screen's char sheet renders HP/STM (data-driven) but shows the
  // AGE / LVL / second-age counters as 0 — those header fields are only filled
  // in on the later SKILL/CONFIRM sheet, even though the engine record already
  // carries the derived values at this waypoint (confirmed: record age=6769/
  // lvl=1 but the sheet draws 0). Force them to 0 to match the engine framebuffer.
  const draft = { ...dumped, derived: { ...dumped.derived, age: 0, secondAge: 0, level: 0 } };
  drawCharSheet(top, draft, msgDb, creationString(msgDb, MSG.portraitTitle));

  // bottomBar prompts — engine centers with Math.ceil padding (row 1: "◄► TO
  // REVIEW PORTRAITS" len 22 at col 9; row 2: "PRESS ▶ TO SELECT" len 17 at col 12).
  const review = creationString(msgDb, MSG.portraitReview);
  setCursor(bottomBar, Math.ceil((bottomBar.widthCells - review.length) / 2), 1);
  puts(bottomBar, review, 0x03);
  const select = creationString(msgDb, MSG.portraitSelect);
  setCursor(bottomBar, Math.ceil((bottomBar.widthCells - select.length) / 2), 2);
  puts(bottomBar, select, 0x03);

  // menuPanel: 9 portrait tile chars at (8..10, 3..5), attr 0x02.
  for (let r = 0; r < 3; r++) {
    setCursor(menuPanel, 8, 3 + r);
    for (let c = 0; c < 3; c++) {
      puts(menuPanel, String.fromCharCode(0x48 + r * 3 + c), 0x02);
    }
  }

  // Inject the character's portrait tiles (data-driven by rendered_portrait_index).
  const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, loadAllPortraits(), draft.portrait);
  return renderCreationFrame([top, bottomBar, menuPanel], fontSetWithPortrait, palette);
}

// ─── SKILL TRAIN helper (screen-13; post-portrait) ───────────────────────────
// This test renders through the SHARED `composeSkillTrainFrame` module that the
// live `SkillTrainScreen.tsx` also calls — pixel parity here is the regression
// guard for that viewer screen too.

/** Trainable skill slots for `classIdx` in category `categoryIdx` (slot order),
 *  mirroring SkillTrainScreen.trainableInCategory. */
function trainableSlots(classIdx: number, categoryIdx: number): number[] {
  const cat = SKILL_CATEGORIES[categoryIdx]!;
  return availableSkillSlots(classIdx).filter((s) => s >= cat.startSlot && s <= cat.endSlot);
}

/**
 * Remaining "SKILL POINTS" the skill-train screen displays. The sidecar's
 * `skillPool` is the INITIAL rolled budget at DGROUP 0x5618 (it does NOT
 * decrement as you train — verified: skill-train-done reads 0x5618=14 with all
 * 14 spent, yet shows 0 on screen). Remaining = initial − points trained. For a
 * FIGHTER (no class skill grants) the trained total is simply the sum of the
 * skill values, so remaining = skillPool − Σ skills. (Probe 2026-06-02: train
 * 14−0=14, done 14−14=0, physical 11−0=11 — all match the on-screen value.)
 */
function skillPointsRemaining(sidecar: { skillPool?: number; draft: { skills: number[] } }): number {
  const initial = sidecar.skillPool ?? 0;
  const spent = sidecar.draft.skills.reduce((a, b) => a + b, 0);
  return Math.max(0, initial - spent);
}

// ─── SKILL TRAIN helpers (screen-13) — DATA-DRIVEN from the committed sidecar ──
// Re-minted via serialize-state. The draft (stats / HP / STM / AGE / LVL — all
// DISPLAYED on the skills screen, unlike the portrait screen) + the skill pool
// ("SKILL POINTS") + the granted/trained skill values come from the per-fixture
// sidecar. WEAPONRY is the default category on entry; cursor starts on slot 0.
// All these fixtures are NATHAN Human-male FIGHTER (class 0 — always picker pos
// 0). Fighter grants no skills, so the WEAPONRY slots start at 0 and the only
// non-zero skills are whatever the recipe trained.

function renderSkillTrain(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Full budget unspent: SKILL POINTS = sidecar.skillPool, WEAPONRY, cursor 0.
  const sidecar = loadDraftSidecar('creation-skill-train');
  const draft = draftFromEngineDump(sidecar);
  const windows = composeSkillTrainFrame(
    {
      draft,
      categoryIdx: 0,
      trainableInCategory: trainableSlots(draft.class ?? 0, 0),
      cursorIdx: 0,
      skillPoints: skillPointsRemaining(sidecar),
    },
    msgDb,
  );
  const fs = patchFontSetWithPortrait(fontSet, loadAllPortraits(), draft.portrait);
  return renderCreationFrame(windows, fs, palette);
}

function renderConfirm(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Confirm screen: skillTrain panel persists with the residual cursor marker;
  // SKILL POINTS = 0; bottomBar swapped to "SAVE THIS CHARACTER? YES NO" with
  // YES highlighted (attr 0x50). Skills (post-drain) come from the sidecar.
  const sidecar = loadDraftSidecar('creation-confirm');
  const draft = draftFromEngineDump(sidecar);
  const windows = composeSkillTrainFrame(
    {
      draft,
      categoryIdx: 0, // WEAPONRY (last visited)
      trainableInCategory: trainableSlots(draft.class ?? 0, 0),
      cursorIdx: 0,
      cursorState: 'residual',
      skillPoints: skillPointsRemaining(sidecar),
    },
    msgDb,
    (bb) => {
      const prompt = creationString(msgDb, MSG.confirmPrompt);
      const yes = creationString(msgDb, MSG.confirmYes);
      const no = creationString(msgDb, MSG.confirmNo);
      const full = `${prompt} ${yes} ${no}`;
      const startCol = Math.floor((bb.widthCells - full.length) / 2);
      setCursor(bb, startCol, 1);
      puts(bb, full, 0x03);
      // YES highlighted (selected): attr 0x50 over the YES cells.
      const yesCol = startCol + prompt.length + 1;
      setCursor(bb, yesCol, 1);
      puts(bb, yes, 0x50);
    },
  );
  const fs = patchFontSetWithPortrait(fontSet, loadAllPortraits(), draft.portrait);
  return renderCreationFrame(windows, fs, palette);
}

function renderSkillTrainPhysical(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // NATHAN Human-male FIGHTER, PHYSICAL category. Fighter has only one PHYSICAL
  // trainable skill (SCOUTING = slot 11). Verifies per-category icon brackets:
  // PHYSICAL uses 0x25/0x26 (vs WEAPONRY's 0x02/0x02).
  const sidecar = loadDraftSidecar('creation-skill-train-physical');
  const draft = draftFromEngineDump(sidecar);
  const windows = composeSkillTrainFrame(
    {
      draft,
      categoryIdx: 1, // PHYSICAL
      trainableInCategory: trainableSlots(draft.class ?? 0, 1), // SCOUTING only
      cursorIdx: 0,
      cursorState: 'active',
      skillPoints: skillPointsRemaining(sidecar),
    },
    msgDb,
  );
  const fs = patchFontSetWithPortrait(fontSet, loadAllPortraits(), draft.portrait);
  return renderCreationFrame(windows, fs, palette);
}

function renderSkillTrainDone(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Exhausted state: SKILL POINTS = 0; bottom prompt toggles to "PRESS ▶ TO
  // EXIT" — the engine does NOT auto-advance; Enter (▶) is the exit key. The
  // drained skill values come from the sidecar.
  const sidecar = loadDraftSidecar('creation-skill-train-done');
  const draft = draftFromEngineDump(sidecar);
  const windows = composeSkillTrainFrame(
    {
      draft,
      categoryIdx: 0,
      trainableInCategory: trainableSlots(draft.class ?? 0, 0),
      cursorIdx: 0,
      skillPoints: skillPointsRemaining(sidecar),
    },
    msgDb,
  );
  const fs = patchFontSetWithPortrait(fontSet, loadAllPortraits(), draft.portrait);
  return renderCreationFrame(windows, fs, palette);
}

// ─── REVIEW CHARACTER helper (read-only char-sheet view; BONUS hidden) ────────
// Engine: wpcmk_view_character on the sole roster char — the freshly-CREATED
// NATHAN (Human-male FIGHTER), baked into the boot pcfile. Same drawCharSheet
// machinery as creation; the only UI difference is bonusPool = -1 (hides BONUS
// row — the engine writes *0x56ac = 0xffff, which draftFromEngineDump maps to
// -1). Re-minted via a fresh-boot forward-drive over the committed 1-char NATHAN
// pcfile (minimal-roster.pcfile.dbs) — dosbox-pure savestate cannot persist the
// in-game SAVE disk write, so the created char is baked into the source instead
// (docs/re/findings/creation-save-persistence.json). Stats come from the sidecar,
// NOT hardcoded. Verified: BONUS label absent at row 11, "PRESS ▶ TO EXIT" centered.

const NATHAN_RAWULF_FIGHTER: Character = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'NATHAN',
  race: 9,    // Rawulf
  class: 0,   // Fighter
  sex: 0,     // Male
  level: 1,
  savedOldLevel: 0,
  xp: 0,
  gold: 0,
  conditions: new Array(10).fill(0) as number[],
  dead: false,
  paralyzed: false,
  attributes: { str: 16, int: 8, pie: 12, vit: 10, dex: 8, spd: 8, per: 10, kar: 18 },
  schoolMana: new Array(6).fill(0) as number[],
  schoolManaMax: new Array(6).fill(0) as number[],
  skills: new Array(30).fill(0) as number[],
  reaction: 50,
  portraitIndex: 1,
  hpCurrent: 7,
  hpMax: 7,
  staminaCurrent: 108,
  staminaMax: 108,
  age: 6925,  // 18 years (engine save 2 *0x5478 = 6925)
};

function renderReviewPicker(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Engine slot 1: single-character roster (NATHAN Rawulf Fighter).
  const windows = composeReviewPickerFrame(
    { roster: [NATHAN_RAWULF_FIGHTER], cursorIdx: 0 },
    msgDb,
  );
  return renderCreationFrame(windows, fontSet, palette);
}

function renderDeletePicker(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Engine slot 3: same single-character roster, but the picker title is
  // "DELETE WHO?" (msg 0x0461) instead of "REVIEW WHO?". Everything else
  // (scrollbar, entry row, CANCEL prompt) is identical.
  const windows = composeReviewPickerFrame(
    { roster: [NATHAN_RAWULF_FIGHTER], cursorIdx: 0, titleMsgId: MSG.deleteWho },
    msgDb,
  );
  return renderCreationFrame(windows, fontSet, palette);
}

function renderRenamePicker(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Engine slot 5: same single-character roster, picker title = "RENAME WHO?".
  const windows = composeReviewPickerFrame(
    { roster: [NATHAN_RAWULF_FIGHTER], cursorIdx: 0, titleMsgId: MSG.renameWho },
    msgDb,
  );
  return renderCreationFrame(windows, fontSet, palette);
}

function renderPortraitTargetPicker(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Engine slot 7: picker title = "PORTRAIT FOR WHOM?".
  const windows = composeReviewPickerFrame(
    { roster: [NATHAN_RAWULF_FIGHTER], cursorIdx: 0, titleMsgId: MSG.portraitForWhom },
    msgDb,
  );
  return renderCreationFrame(windows, fontSet, palette);
}

function renderPortraitChange(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Engine slot 8: portrait-change active. Char sheet of NATHAN Rawulf Fighter
  // on the left + portrait picker (CHARACTER PORTRAIT title + 3x3 tiles) on
  // the right. wfont2 is loaded with the character's CURRENT portrait (= 1) —
  // the picker has just started.
  const wport1: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport1.json'), 'utf-8')),
  );
  const empty: PortraitSet = { ...wport1, portraits: [] };
  const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, [wport1, empty, empty], 1);

  const { top, bottomBar, menuPanel } = createPersistentWindows();
  const draft = draftFromCharacter(NATHAN_RAWULF_FIGHTER);
  drawCharSheet(top, draft, msgDb, creationString(msgDb, MSG.portraitTitle));

  // Small portrait tiles at top (1..3, 1..3) attr 0x02.
  for (let r = 0; r < 3; r++) {
    setCursor(top, 1, 1 + r);
    puts(top,
      String.fromCharCode(0x48 + r * 3) +
      String.fromCharCode(0x48 + r * 3 + 1) +
      String.fromCharCode(0x48 + r * 3 + 2),
      0x02,
    );
  }

  // menuPanel big portrait 3×3 at (8,3)..(10,5) attr 0x02.
  for (let r = 0; r < 3; r++) {
    setCursor(menuPanel, 8, 3 + r);
    for (let c = 0; c < 3; c++) {
      puts(menuPanel, String.fromCharCode(0x48 + r * 3 + c), 0x02);
    }
  }

  // bottomBar prompts (ceil centering, same as creation portrait picker).
  const review = creationString(msgDb, MSG.portraitReview);
  setCursor(bottomBar, Math.ceil((bottomBar.widthCells - review.length) / 2), 1);
  puts(bottomBar, review, 0x03);
  const select = creationString(msgDb, MSG.portraitSelect);
  setCursor(bottomBar, Math.ceil((bottomBar.widthCells - select.length) / 2), 2);
  puts(bottomBar, select, 0x03);

  return renderCreationFrame([top, bottomBar, menuPanel], fontSetWithPortrait, palette);
}

function renderPortraitDone(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Engine slot 9: post-change preview. Char sheet with the NEW portrait
  // (index 21 — same as the earlier samurai save) baked into wfont2.
  // bottomBar row 1: "PRESS ▶ TO EXIT" centered (same as ReviewScreen).
  const wport2: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport2.json'), 'utf-8')),
  );
  const empty: PortraitSet = { ...wport2, portraits: [] };
  const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, [empty, wport2, empty], 21);

  // Use the existing fighter character but with portraitIndex updated to 21.
  const updatedCharacter = { ...NATHAN_RAWULF_FIGHTER, portraitIndex: 21 };

  const { top, bottomBar, menuPanel } = createPersistentWindows();
  const draft = draftFromCharacter(updatedCharacter);
  drawCharSheet(top, draft, msgDb);

  for (let r = 0; r < 3; r++) {
    setCursor(top, 1, 1 + r);
    puts(top,
      String.fromCharCode(0x48 + r * 3) +
      String.fromCharCode(0x48 + r * 3 + 1) +
      String.fromCharCode(0x48 + r * 3 + 2),
      0x02,
    );
  }

  const exitPrompt = creationString(msgDb, MSG.skillExit);
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - exitPrompt.length) / 2), 1);
  puts(bottomBar, exitPrompt, 0x03);

  return renderCreationFrame([top, bottomBar, menuPanel], fontSetWithPortrait, palette);
}

function renderRenameInput(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Engine slot 6: char sheet of NATHAN Rawulf Fighter (BONUS hidden) with
  // " NEW NAME >a       " at bottomBar row 1 — empty buffer, cursor at col 11.
  const wport1: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport1.json'), 'utf-8')),
  );
  const empty: PortraitSet = { ...wport1, portraits: [] };
  const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, [wport1, empty, empty], 1);

  const { top, bottomBar, menuPanel } = createPersistentWindows();
  const draft = draftFromCharacter(NATHAN_RAWULF_FIGHTER);
  drawCharSheet(top, draft, msgDb);

  for (let r = 0; r < 3; r++) {
    setCursor(top, 1, 1 + r);
    puts(top,
      String.fromCharCode(0x48 + r * 3) +
      String.fromCharCode(0x48 + r * 3 + 1) +
      String.fromCharCode(0x48 + r * 3 + 2),
      0x02,
    );
  }

  // bottomBar — empty buffer (cursor block 'a' at col 11, 7 spaces after).
  bottomBar.invertHighlight = false;
  const promptText = creationString(msgDb, MSG.newNamePrompt); // "NEW NAME >"
  setCursor(bottomBar, 1, 1);
  puts(bottomBar, promptText, 0x03);
  setCursor(bottomBar, 1 + promptText.length, 1);
  puts(bottomBar, 'a', 0x10);
  puts(bottomBar, ' '.repeat(7), 0x00);

  return renderCreationFrame([top, bottomBar, menuPanel], fontSetWithPortrait, palette);
}

function renderDeleteConfirm(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Engine slot 4: char-sheet of NATHAN Rawulf Fighter with the
  // "DELETE THIS CHARACTER? YES NO" prompt at bottomBar row 1, NO selected.
  const wport1: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport1.json'), 'utf-8')),
  );
  const empty: PortraitSet = { ...wport1, portraits: [] };
  const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, [wport1, empty, empty], 1);

  const { top, bottomBar, menuPanel } = createPersistentWindows();
  const draft = draftFromCharacter(NATHAN_RAWULF_FIGHTER);
  drawCharSheet(top, draft, msgDb);

  for (let r = 0; r < 3; r++) {
    setCursor(top, 1, 1 + r);
    puts(top,
      String.fromCharCode(0x48 + r * 3) +
      String.fromCharCode(0x48 + r * 3 + 1) +
      String.fromCharCode(0x48 + r * 3 + 2),
      0x02,
    );
  }

  // bottomBar row 1: "DELETE THIS CHARACTER? YES NO" centered. NO selected
  // (attr 0x50). 29-char string; floor((40-29)/2) = 5 start col.
  const prompt = creationString(msgDb, MSG.deleteThisCharacter);
  const yes = creationString(msgDb, MSG.confirmYes);
  const no = creationString(msgDb, MSG.confirmNo);
  const full = `${prompt} ${yes} ${no}`;
  const startCol = Math.floor((bottomBar.widthCells - full.length) / 2);
  setCursor(bottomBar, startCol, 1);
  puts(bottomBar, full, 0x03);
  // Overwrite NO at attr 0x50.
  const yesCol = startCol + prompt.length + 1;
  const noCol = yesCol + yes.length + 1;
  setCursor(bottomBar, noCol, 1);
  puts(bottomBar, no, 0x50);

  return renderCreationFrame([top, bottomBar, menuPanel], fontSetWithPortrait, palette);
}

function renderReviewCharacter(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  // Re-minted via a fresh-boot forward-drive over the committed 1-char NATHAN
  // pcfile (minimal-roster.pcfile.dbs → REVIEW PC → sole char). The reviewed char
  // (NATHAN, Human-male FIGHTER) + all stats come from the COMMITTED sidecar,
  // NOT hardcoded. dumpDraft reads *0x56ac = 0xffff on the read-only sheet;
  // draftFromEngineDump maps that sentinel to -1 so the BONUS row stays hidden.
  const dumped = draftFromEngineDump(loadDraftSidecar('creation-review-character'));
  const { top, bottomBar, menuPanel } = createPersistentWindows();
  const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, loadAllPortraits(), dumped.portrait);
  drawCharSheet(top, dumped, msgDb);

  // Portrait tiles at top (1..3, 1..3) attr 0x02.
  for (let r = 0; r < 3; r++) {
    setCursor(top, 1, 1 + r);
    puts(top,
      String.fromCharCode(0x48 + r * 3) +
      String.fromCharCode(0x48 + r * 3 + 1) +
      String.fromCharCode(0x48 + r * 3 + 2),
      0x02,
    );
  }

  // bottomBar: "PRESS ▶ TO EXIT" centered at row 1.
  const exitPrompt = creationString(msgDb, MSG.skillExit);
  setCursor(bottomBar, Math.floor((bottomBar.widthCells - exitPrompt.length) / 2), 1);
  puts(bottomBar, exitPrompt, 0x03);

  return renderCreationFrame([top, bottomBar, menuPanel], fontSetWithPortrait, palette);
}

// ─── REVIEW MEMBER (WPCVW state 0x11) helper ───────────────────────────────────
// Engine fixture state (save 2): NATHAN, FIGHTER, M-RAWULF; cursor on EXIT
// (action idx 11). The scaffold renders a 2-col × 6-row action menu with all 12
// entries (EQUIP..REVIEW + EXIT), most disabled — engine actually renders 3-col
// × 2-row with the camp context mask hiding TRADE/MERGE/USE/DROP/EDIT/REVIEW.
// This case is the REGRESSION FLOOR — current match % is much less than 100,
// driving the Phase B layout/portrait/inventory iterations tracked in TODO
// #042/#043/#044/#045.

function renderCreationReviewMember(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  const member: ActivePartyMember = {
    ...NATHAN_RAWULF_FIGHTER,
    portraitSlotId: 0,
    rosterCharacterId: NATHAN_RAWULF_FIGHTER.id,
  };
  // Patch wfont2 with NATHAN's portrait — chars 0x48..0x50 get rewritten to
  // the 9 portrait tiles. Load all 3 portrait files (wport1/2/3 cover
  // indices 0-13/14-27/28-41 respectively).
  const wport1: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport1.json'), 'utf-8')),
  );
  const wport2: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport2.json'), 'utf-8')),
  );
  const wport3: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport3.json'), 'utf-8')),
  );
  // Engine save 2 character record (NATHAN) was stored with portraitIndex=21.
  // Brute-force pixel match against the engine fixture's 24×24 portrait region
  // confirmed idx 21 = 576/576 pixels exact; next-best (idx 20) was 343/576.
  // Schema's NATHAN_RAWULF_FIGHTER has portraitIndex=1 (default fighter pick);
  // we override for the parity test only to match the actual save state.
  const fontSetWithPortrait = patchFontSetWithPortrait(
    fontSet,
    [wport1, wport2, wport3], 21,
  );
  const windows = composeCharacterViewFrame({
    members: [member],
    currentSlot: 0,
    cursorIdx: 5, // EXIT in the camp-mask-packed action menu (6 enabled actions)
    db: msgDb,
    // NATHAN's equipped inventory in engine save 2, in display order. Each
    // row pairs the item name with the wfont0 body-slot glyph the engine
    // renders at col 38. TODO: derive from scenario.dbs item lookup.
    inventory: [
      { name: 'LONGSWORD',       iconChar: 0x02 },
      { name: 'LEATHER CUIRASS', iconChar: 0x2a },
      { name: 'FUR LEGGING',     iconChar: 0x2d },
      { name: 'SANDALS',         iconChar: 0x2f },
      { name: 'BUCKLER SHIELD',  iconChar: 0x27 },
    ],
    // CC = current carry weight / max derived from STR (engine: 29/213).
    cc: { current: 29, max: 213 },
    // Age glyphs: row 2 = 18 years, row 3 = 1 (engine "secondAge" counter).
    age: { years: 18, second: 1 },
  });
  return renderCreationFrame(windows, fontSetWithPortrait, palette);
}

// ─── REVIEW MEMBER (3-member party; WPCVW state 0x11, in-castle) helper ────────
// Engine fixture (save slot 9): THESUS in a 3-member party (THESUS/TEMPEST/
// LYSANDR). Only THESUS (slot 0) is rendered by the character sheet; the other
// two exist solely so members.length === 3, which makes REVIEW appear in the
// action menu (7 entries: EQUIP/SPELL/ASSAY/SWAG/SKILL/REVIEW/EXIT, column-major
// EQUIP,ASSAY,SKILL,EXIT top / SPELL,SWAG,REVIEW bottom). Cursor on EXIT (idx 6).
//
// Inventory is resolved through buildInventoryItems(thesus, scenarioDb) — the
// real itemId→name + equipSlot→icon lookup, NOT a hardcoded list. THESUS's 5
// equipped items are LONGSWORD/LEATHER CUIRASS/FUR LEGGING/SANDALS/BUCKLER SHIELD.
//
// Portrait: rendered index 0 (the +0x19c selector; the +0x1ac portrait_index
// field is 10 — the SP1 NATHAN gotcha — verified by pixel-matching the portrait
// region). cc = 29/270 (encumbranceCurrent 295 → 29; encumbranceMax 2700 → 270).

function makeStubMember(name: string, portraitSlotId: number): ActivePartyMember {
  return {
    id: `00000000-0000-0000-0000-00000000000${portraitSlotId + 2}`,
    name,
    race: 0,
    class: 0,
    sex: 0,
    level: 1,
    savedOldLevel: 0,
    xp: 0,
    gold: 0,
    conditions: new Array(10).fill(0) as number[],
    dead: false,
    paralyzed: false,
    attributes: { str: 15, int: 11, pie: 8, vit: 12, dex: 12, spd: 14, per: 8, kar: 0 },
    schoolMana: new Array(6).fill(0) as number[],
    schoolManaMax: new Array(6).fill(0) as number[],
    skills: new Array(30).fill(0) as number[],
    reaction: 50,
    portraitIndex: 0,
    hpCurrent: 8,
    hpMax: 8,
    staminaCurrent: 100,
    staminaMax: 100,
    age: 6570,
    portraitSlotId,
  };
}

function renderReviewMemberView(
  fontSet: FontSet,
  palette: Palette,
  equipped = false,
): Uint8ClampedArray {
  // THESUS's 5 equipped items, in the on-disk inventory slot shape so
  // buildInventoryItems resolves name (scenario.dbs items[id].name1) + icon
  // (equipSlot→wfont0 glyph). The schema requires exactly 22 slots; pad the rest.
  const emptySlot = { itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 };
  const inventory = [
    { itemId: 8, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 },   // LONGSWORD
    { itemId: 135, weight: 0, equipSlot: 7, spriteIdx: 0, quantity: 0, flags: 0 },  // LEATHER CUIRASS
    { itemId: 132, weight: 0, equipSlot: 8, spriteIdx: 0, quantity: 0, flags: 0 },  // FUR LEGGING
    { itemId: 130, weight: 0, equipSlot: 10, spriteIdx: 0, quantity: 0, flags: 0 }, // SANDALS
    { itemId: 141, weight: 0, equipSlot: 11, spriteIdx: 0, quantity: 0, flags: 0 }, // BUCKLER SHIELD
    ...Array.from({ length: 17 }, () => ({ ...emptySlot })),
  ];

  const thesus: ActivePartyMember = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'THESUS',
    race: 0,    // Human
    class: 0,   // Fighter
    sex: 0,     // Male
    level: 1,
    savedOldLevel: 0,
    xp: 0,
    gold: 0,
    conditions: new Array(10).fill(0) as number[],
    dead: false,
    paralyzed: false,
    attributes: { str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 8, kar: 14 },
    schoolMana: new Array(6).fill(0) as number[],
    schoolManaMax: new Array(6).fill(0) as number[],
    skills: new Array(30).fill(0) as number[],
    reaction: 50,
    portraitIndex: 10, // +0x1ac field (not the rendered portrait — see below)
    hpCurrent: 8,
    hpMax: 8,
    staminaCurrent: 126,
    staminaMax: 126,
    encumbranceCurrent: 295,
    encumbranceMax: 2700, // 2700 tenths → 270 lb cc max (matches fixture)
    age: 18 * 365 + 100,  // 18 years on the char-sheet
    portraitSlotId: 0,
    rosterCharacterId: '00000000-0000-0000-0000-000000000001',
  };

  const members = [thesus, makeStubMember('TEMPEST', 1), makeStubMember('LYSANDR', 2)];

  // wfont2 gets THESUS's rendered portrait (the +0x19c selector = 0), not the
  // +0x1ac portrait_index field (10). Load all 3 portrait files; slot 0 → wport1.
  const wport1: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport1.json'), 'utf-8')),
  );
  const wport2: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport2.json'), 'utf-8')),
  );
  const wport3: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport3.json'), 'utf-8')),
  );
  const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, [wport1, wport2, wport3], 0);

  const scenarioDb = ScenarioDbSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_SCENARIO, 'scenario.json'), 'utf-8')),
  );

  // For the post-equip fixture, run the real EQUIP commit: equip each item in
  // its body slot (weapon/off-hand/chest/legs/feet) — the engine physically
  // reorders the carried region to body-slot order, sets equipment[], and folds
  // the shield AC into the displayed grid. selections index the pickup-order
  // inventory above: LONGSWORD=0→body0, CUIRASS=1→body4, LEGGING=2→body5,
  // SANDALS=3→body7, BUCKLER=4→body1.
  const baseMember: ActivePartyMember = { ...thesus, inventory };
  const member: ActivePartyMember = equipped
    ? (applyEquipSelections(baseMember as Character, [0, 4, null, null, 1, 2, null, 3], scenarioDb) as ActivePartyMember)
    : baseMember;

  // The post-equip fixture (save 5) is a SOLO party (1 member) — REVIEW is gated
  // on 2+ members, so its menu is 6 entries (EQUIP,SPELL,ASSAY,SWAG,SKILL,EXIT)
  // with EXIT at idx 5; the unequipped fixture is a 3-member party (7 entries,
  // REVIEW present, EXIT at idx 6). Both show EXIT highlighted.
  const partyMembers = equipped ? [member] : [member, members[1]!, members[2]!];
  const carryMax = resolveCarryCapacityMax(thesus, false);
  const windows = composeCharacterViewFrame({
    members: partyMembers,
    currentSlot: 0,
    cursorIdx: equipped ? 5 : 6,
    db: msgDb,
    inventory: buildInventoryItems(member, scenarioDb),
    cc: { current: Math.floor((thesus.encumbranceCurrent ?? 0) / 10), max: Math.floor(carryMax / 10) },
    age: { years: 18, second: 1 },
  });
  return renderCreationFrame(windows, fontSetWithPortrait, palette);
}

// ─── EQUIP SLOT-PICKER (WPCVW state 0x11, body slot 0) helper ──────────────────
// Engine fixture (save slot 9, same base state as review-member-view): THESUS
// after choosing EQUIP and entering the per-slot wizard for body slot 0 (PRIMARY
// WEAPON). The character sheet is identical to review-member-view; the EQUIP
// overlay adds (1) a candidate-row highlight on LONGSWORD (the only slot-0
// candidate) in the inventory list, and (2) a bottom prompt bar reading
// "SELECT PRIMARY WEAPON > NONE" (the row-cursor hovers candidate 0 while the
// committed selection is still NONE). Verified vs the equip-slot0 fixture, which
// differs from review-member-view in exactly two regions (inventory row 9 +
// the bottom strip).

function renderEquip(
  fontSet: FontSet,
  palette: Palette,
  bodySlot: number,
  selections: (number | null)[],
  cursor: number,
): Uint8ClampedArray {
  const emptySlot = { itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 };
  const inventory = [
    { itemId: 8, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 },   // LONGSWORD
    { itemId: 135, weight: 0, equipSlot: 7, spriteIdx: 0, quantity: 0, flags: 0 },  // LEATHER CUIRASS
    { itemId: 132, weight: 0, equipSlot: 8, spriteIdx: 0, quantity: 0, flags: 0 },  // FUR LEGGING
    { itemId: 130, weight: 0, equipSlot: 10, spriteIdx: 0, quantity: 0, flags: 0 }, // SANDALS
    { itemId: 141, weight: 0, equipSlot: 11, spriteIdx: 0, quantity: 0, flags: 0 }, // BUCKLER SHIELD
    ...Array.from({ length: 17 }, () => ({ ...emptySlot })),
  ];

  const thesus: ActivePartyMember = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'THESUS',
    race: 0, class: 0, sex: 0,
    level: 1, savedOldLevel: 0, xp: 0, gold: 0,
    conditions: new Array(10).fill(0) as number[],
    dead: false, paralyzed: false,
    attributes: { str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 8, kar: 14 },
    schoolMana: new Array(6).fill(0) as number[],
    schoolManaMax: new Array(6).fill(0) as number[],
    skills: new Array(30).fill(0) as number[],
    reaction: 50,
    portraitIndex: 10,
    hpCurrent: 8, hpMax: 8, staminaCurrent: 126, staminaMax: 126,
    encumbranceCurrent: 295, encumbranceMax: 2700,
    age: 18 * 365 + 100,
    portraitSlotId: 0,
    rosterCharacterId: '00000000-0000-0000-0000-000000000001',
    inventory,
  };

  const wport1: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport1.json'), 'utf-8')),
  );
  const wport2: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport2.json'), 'utf-8')),
  );
  const wport3: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport3.json'), 'utf-8')),
  );
  const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, [wport1, wport2, wport3], 0);

  const scenarioDb = ScenarioDbSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_SCENARIO, 'scenario.json'), 'utf-8')),
  );

  const carryMax = resolveCarryCapacityMax(thesus, false);

  // Main panel (character sheet) — identical to review-member-view, but no
  // action-menu strip (the EQUIP prompt bar replaces it).
  const mainPanel = composeMainPanel({
    member: thesus,
    db: msgDb,
    inventory: buildInventoryItems(thesus, scenarioDb),
    cc: { current: Math.floor((thesus.encumbranceCurrent ?? 0) / 10), max: Math.floor(carryMax / 10) },
    age: { years: 18, second: 1 },
  });

  // Build per-row markers exactly like CharacterViewPage's equip-wizard branch.
  const candidateIdxs = equipCandidates(thesus, bodySlot, scenarioDb, selections);
  const candidateSet = new Set(candidateIdxs);
  const equippedSet = new Set(selections.filter((x): x is number => x != null));
  const cursorInvIdx = cursor < candidateIdxs.length ? candidateIdxs[cursor] : null;
  const rows: { name: string; state: 'equipped' | 'candidate' | 'normal'; cursored: boolean }[] = [];
  for (let i = 0; i < Math.min(inventory.length, 10); i++) {
    const it = inventory[i]!;
    if (it.itemId <= 0) continue;
    const rowState = equippedSet.has(i) ? 'equipped' : candidateSet.has(i) ? 'candidate' : 'normal';
    rows.push({ name: scenarioItemName(scenarioDb, it.itemId), state: rowState, cursored: i === cursorInvIdx });
  }

  const equip = composeEquipPicker({
    db: msgDb,
    bodySlot,
    slotTitle: ['PRIMARY WEAPON', 'SECONDARY ITEM'][bodySlot] ?? 'ITEM',
    rows,
    cursorOnNone: cursor >= candidateIdxs.length,
  });

  return renderCreationFrame([mainPanel, ...equip], fontSetWithPortrait, palette);
}

// ─── ASSAY PICKER (ui_pick_inventory_item; ASSAY/USE/DROP family) helper ───────
// Engine fixture (save slot 9, same base state as equip-slot0): THESUS after
// choosing ASSAY. The character sheet is identical to review-member-view; the
// inventory-picker overlay replaces the action menu with a "ASSAY WHICH ITEM?
// NONE" bar (NONE highlighted — the cursor defaults to the NONE/skip position,
// so no carried item is highlighted in this initial frame).

function renderAssayPicker(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  const emptySlot = { itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 };
  const inventory = [
    { itemId: 8, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 },   // LONGSWORD
    { itemId: 135, weight: 0, equipSlot: 7, spriteIdx: 0, quantity: 0, flags: 0 },  // LEATHER CUIRASS
    { itemId: 132, weight: 0, equipSlot: 8, spriteIdx: 0, quantity: 0, flags: 0 },  // FUR LEGGING
    { itemId: 130, weight: 0, equipSlot: 10, spriteIdx: 0, quantity: 0, flags: 0 }, // SANDALS
    { itemId: 141, weight: 0, equipSlot: 11, spriteIdx: 0, quantity: 0, flags: 0 }, // BUCKLER SHIELD
    ...Array.from({ length: 17 }, () => ({ ...emptySlot })),
  ];

  const thesus: ActivePartyMember = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'THESUS',
    race: 0, class: 0, sex: 0,
    level: 1, savedOldLevel: 0, xp: 0, gold: 0,
    conditions: new Array(10).fill(0) as number[],
    dead: false, paralyzed: false,
    attributes: { str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 8, kar: 14 },
    schoolMana: new Array(6).fill(0) as number[],
    schoolManaMax: new Array(6).fill(0) as number[],
    skills: new Array(30).fill(0) as number[],
    reaction: 50,
    portraitIndex: 10,
    hpCurrent: 8, hpMax: 8, staminaCurrent: 126, staminaMax: 126,
    encumbranceCurrent: 295, encumbranceMax: 2700,
    age: 18 * 365 + 100,
    portraitSlotId: 0,
    rosterCharacterId: '00000000-0000-0000-0000-000000000001',
    inventory,
  };

  const wport1: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport1.json'), 'utf-8')),
  );
  const wport2: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport2.json'), 'utf-8')),
  );
  const wport3: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport3.json'), 'utf-8')),
  );
  const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, [wport1, wport2, wport3], 0);

  const scenarioDb = ScenarioDbSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_SCENARIO, 'scenario.json'), 'utf-8')),
  );

  const carryMax = resolveCarryCapacityMax(thesus, false);

  const mainPanel = composeMainPanel({
    member: thesus,
    db: msgDb,
    inventory: buildInventoryItems(thesus, scenarioDb),
    cc: { current: Math.floor((thesus.encumbranceCurrent ?? 0) / 10), max: Math.floor(carryMax / 10) },
    age: { years: 18, second: 1 },
  });

  // THESUS's 5 carried items, names resolved via scenario.dbs. Cursor on NONE
  // (index === items.length === 5) — matches the fixture's initial frame.
  const items = (thesus.inventory ?? [])
    .filter((s) => s.itemId > 0)
    .map((s) => ({ name: scenarioItemName(scenarioDb, s.itemId) }));
  const picker = composeInventoryPicker({
    prompt: 'ASSAY WHICH ITEM?',
    items,
    cursor: items.length, // NONE
  });

  return renderCreationFrame([mainPanel, ...picker], fontSetWithPortrait, palette);
}

// ─── ASSAY DISPLAY (wpcvw_item_inspect_display; read-only stat popup) helper ───
// Engine fixture (save slot 9, same base state as assay-picker): THESUS after
// choosing ASSAY and picking LONGSWORD (item 8). The char sheet is identical to
// review-member-view; the ASSAY overlay adds (1) a 20×12 stat-block popup at
// (col 20, row 8) over the right half of the sheet, and (2) a "PRESS ↵ TO EXIT"
// bottom strip replacing the action menu. Stat block driven by
// assayItem(8, thesus, scenarioDb).

function renderAssayDisplay(fontSet: FontSet, palette: Palette): Uint8ClampedArray {
  const emptySlot = { itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 };
  const inventory = [
    { itemId: 8, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 },   // LONGSWORD
    { itemId: 135, weight: 0, equipSlot: 7, spriteIdx: 0, quantity: 0, flags: 0 },  // LEATHER CUIRASS
    { itemId: 132, weight: 0, equipSlot: 8, spriteIdx: 0, quantity: 0, flags: 0 },  // FUR LEGGING
    { itemId: 130, weight: 0, equipSlot: 10, spriteIdx: 0, quantity: 0, flags: 0 }, // SANDALS
    { itemId: 141, weight: 0, equipSlot: 11, spriteIdx: 0, quantity: 0, flags: 0 }, // BUCKLER SHIELD
    ...Array.from({ length: 17 }, () => ({ ...emptySlot })),
  ];

  const thesus: ActivePartyMember = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'THESUS',
    race: 0, class: 0, sex: 0,
    level: 1, savedOldLevel: 0, xp: 0, gold: 0,
    conditions: new Array(10).fill(0) as number[],
    dead: false, paralyzed: false,
    attributes: { str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 8, kar: 14 },
    schoolMana: new Array(6).fill(0) as number[],
    schoolManaMax: new Array(6).fill(0) as number[],
    skills: new Array(30).fill(0) as number[],
    reaction: 50,
    portraitIndex: 10,
    hpCurrent: 8, hpMax: 8, staminaCurrent: 126, staminaMax: 126,
    encumbranceCurrent: 295, encumbranceMax: 2700,
    age: 18 * 365 + 100,
    portraitSlotId: 0,
    rosterCharacterId: '00000000-0000-0000-0000-000000000001',
    inventory,
  };

  const wport1: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport1.json'), 'utf-8')),
  );
  const wport2: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport2.json'), 'utf-8')),
  );
  const wport3: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport3.json'), 'utf-8')),
  );
  const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, [wport1, wport2, wport3], 0);

  const scenarioDb = ScenarioDbSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_SCENARIO, 'scenario.json'), 'utf-8')),
  );

  const carryMax = resolveCarryCapacityMax(thesus, false);

  const mainPanel = composeMainPanel({
    member: thesus,
    db: msgDb,
    inventory: buildInventoryItems(thesus, scenarioDb),
    cc: { current: Math.floor((thesus.encumbranceCurrent ?? 0) / 10), max: Math.floor(carryMax / 10) },
    age: { years: 18, second: 1 },
  });

  const popup = composeAssayDisplay({
    descriptor: assayItem(8, thesus, scenarioDb),
  });

  return renderCreationFrame([mainPanel, ...popup], fontSetWithPortrait, palette);
}

// ─── SKILL VIEWER (wpcvw camp SKILL; read-only skill-level browser) helper ─────
// Engine fixtures (saves 5/6/7): THESUS in a 3-member party, SKILL viewer open
// on each available category. The left char sheet is composeMainPanel; the right
// half is the 20×16 skill panel (covering the AC grid + inventory), and the
// action-menu strip is replaced by the dynamic category-tab picker. THESUS has
// SWORD(slot1)=10 + SHIELD(slot8)=2; all other skills 0; skill points 0.
// RE: docs/re/findings/wpcvw-skill-action.json + wpcvw-skill-names.json.

function renderSkillViewer(
  fontSet: FontSet,
  palette: Palette,
  category: number,
  cursor: number,
): Uint8ClampedArray {
  const skills = new Array(30).fill(0) as number[];
  skills[1] = 10; // SWORD
  skills[8] = 2;  // SHIELD

  const emptySlot = { itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 };
  const inventory = [
    { itemId: 8, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 },
    { itemId: 135, weight: 0, equipSlot: 7, spriteIdx: 0, quantity: 0, flags: 0 },
    { itemId: 132, weight: 0, equipSlot: 8, spriteIdx: 0, quantity: 0, flags: 0 },
    { itemId: 130, weight: 0, equipSlot: 10, spriteIdx: 0, quantity: 0, flags: 0 },
    { itemId: 141, weight: 0, equipSlot: 11, spriteIdx: 0, quantity: 0, flags: 0 },
    ...Array.from({ length: 17 }, () => ({ ...emptySlot })),
  ];

  const thesus: ActivePartyMember = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'THESUS',
    race: 0, class: 0, sex: 0,
    level: 1, savedOldLevel: 0, xp: 0, gold: 0,
    conditions: new Array(10).fill(0) as number[],
    dead: false, paralyzed: false,
    attributes: { str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 8, kar: 14 },
    schoolMana: new Array(6).fill(0) as number[],
    schoolManaMax: new Array(6).fill(0) as number[],
    skills,
    reaction: 50,
    portraitIndex: 10,
    hpCurrent: 8, hpMax: 8, staminaCurrent: 126, staminaMax: 126,
    encumbranceCurrent: 295, encumbranceMax: 2700,
    age: 18 * 365 + 100,
    portraitSlotId: 0,
    rosterCharacterId: '00000000-0000-0000-0000-000000000001',
    inventory,
  };

  const wport1: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport1.json'), 'utf-8')),
  );
  const wport2: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport2.json'), 'utf-8')),
  );
  const wport3: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport3.json'), 'utf-8')),
  );
  const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, [wport1, wport2, wport3], 0);

  const scenarioDb = ScenarioDbSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_SCENARIO, 'scenario.json'), 'utf-8')),
  );

  const carryMax = resolveCarryCapacityMax(thesus, false);
  const mainPanel = composeMainPanel({
    member: thesus,
    db: msgDb,
    inventory: buildInventoryItems(thesus, scenarioDb),
    cc: { current: Math.floor((thesus.encumbranceCurrent ?? 0) / 10), max: Math.floor(carryMax / 10) },
    age: { years: 18, second: 1 },
  });

  const hasPersonalSkills = skills.slice(17, 22).some((v) => v > 0); // false for THESUS
  const rows = skillViewerRows(thesus, category).map((r) => ({
    slot: r.slot,
    name: skillName(msgDb, r.slot) || r.name,
    level: r.level,
  }));
  const viewer = composeSkillViewer({
    category,
    rows,
    skillPoints: 0,
    tabEntries: skillTabEntries(category, hasPersonalSkills),
    cursor,
    db: msgDb,
  });

  return renderCreationFrame([mainPanel, ...viewer], fontSetWithPortrait, palette);
}

// ─── SWAG BAG (wpcvw camp SWAG; interactive stash manager) helper ──────────────
// Engine fixtures (saves 5/6): THESUS SWAG BAG. `swag-empty` = empty bag, menu
// [ADD, EXIT]; `swag-longsword` = bag [LONGSWORD] after an ADD, menu
// [ADD,REMOVE,DROP,EXIT]. Cursor on EXIT in both. Left = composeMainPanel; the
// popup covers the right panel (AC grid + inventory). Cells byte-exact from
// dump-cells.py --header 0x14,0x10,0x14,4,0x19.

function renderSwagBag(
  fontSet: FontSet,
  palette: Palette,
  bagItems: { name: string; icon: number }[],
  menu: { label: string; enabled: boolean }[],
  cursor: number,
): Uint8ClampedArray {
  const emptySlot = { itemId: 0, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 };
  const inventory = [
    { itemId: 8, weight: 0, equipSlot: 0, spriteIdx: 0, quantity: 0, flags: 0 },
    { itemId: 135, weight: 0, equipSlot: 7, spriteIdx: 0, quantity: 0, flags: 0 },
    { itemId: 132, weight: 0, equipSlot: 8, spriteIdx: 0, quantity: 0, flags: 0 },
    { itemId: 130, weight: 0, equipSlot: 10, spriteIdx: 0, quantity: 0, flags: 0 },
    { itemId: 141, weight: 0, equipSlot: 11, spriteIdx: 0, quantity: 0, flags: 0 },
    ...Array.from({ length: 17 }, () => ({ ...emptySlot })),
  ];
  const thesus: ActivePartyMember = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'THESUS',
    race: 0, class: 0, sex: 0,
    level: 1, savedOldLevel: 0, xp: 0, gold: 0,
    conditions: new Array(10).fill(0) as number[],
    dead: false, paralyzed: false,
    attributes: { str: 18, int: 8, pie: 8, vit: 12, dex: 10, spd: 9, per: 8, kar: 14 },
    schoolMana: new Array(6).fill(0) as number[],
    schoolManaMax: new Array(6).fill(0) as number[],
    skills: new Array(30).fill(0) as number[],
    reaction: 50,
    portraitIndex: 10,
    hpCurrent: 8, hpMax: 8, staminaCurrent: 126, staminaMax: 126,
    encumbranceCurrent: 295, encumbranceMax: 2700,
    age: 18 * 365 + 100,
    portraitSlotId: 0,
    rosterCharacterId: '00000000-0000-0000-0000-000000000001',
    inventory,
  };
  const wport1: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport1.json'), 'utf-8')),
  );
  const wport2: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport2.json'), 'utf-8')),
  );
  const wport3: PortraitSet = PortraitSetSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_PORTRAITS, 'wport3.json'), 'utf-8')),
  );
  const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, [wport1, wport2, wport3], 0);
  const scenarioDb = ScenarioDbSchema.parse(
    JSON.parse(readFileSync(join(EXTRACTED_SCENARIO, 'scenario.json'), 'utf-8')),
  );
  const carryMax = resolveCarryCapacityMax(thesus, false);
  const mainPanel = composeMainPanel({
    member: thesus,
    db: msgDb,
    inventory: buildInventoryItems(thesus, scenarioDb),
    cc: { current: Math.floor((thesus.encumbranceCurrent ?? 0) / 10), max: Math.floor(carryMax / 10) },
    age: { years: 18, second: 1 },
  });
  const swag = composeSwagBag({ bagItems, menu, cursor });
  return renderCreationFrame([mainPanel, ...swag], fontSetWithPortrait, palette);
}

// ─── Screen table ──────────────────────────────────────────────────────────────
// `floor` = current measured match % minus a small margin. TARGET is 100.

interface ScreenCase {
  fixture: string;
  floor: number;
  render: (fontSet: FontSet, palette: Palette) => Uint8ClampedArray;
}

const SCREENS: ScreenCase[] = [
  {
    fixture: 'character-menu-empty',
    floor: 100, // pixel-exact (0 px differ) — fixture has CREATE PC highlighted
    render: (f, p) => renderCharacterMenu(f, p, ['CREATE PC', 'EXIT'], 0),
  },
  {
    fixture: 'character-menu-populated',
    floor: 100, // pixel-exact (0 px differ)
    render: (f, p) =>
      renderCharacterMenu(f, p, ['REVIEW PC', 'DELETE PC', 'RENAME PC', 'PORTRAIT', 'EXIT'], 0),
  },
  {
    fixture: 'creation-name-input',
    floor: 100, // pixel-exact (0 px differ)
    render: renderNameInput,
  },
  {
    fixture: 'creation-race-select',
    floor: 100, // pixel-exact — char-sheet + race list with HUMAN selected
    render: renderRaceSelect,
  },
  {
    fixture: 'creation-class-select',
    floor: 100, // pixel-exact — NATHAN, pool 17, 12 qualifying classes
    render: renderClassSelect,
  },
  {
    fixture: 'creation-portrait-select',
    floor: 100, // pixel-exact — NATHAN/SAMURAI char sheet + portrait 0 tile grid
    render: renderPortraitSelect,
  },
  {
    fixture: 'creation-skill-train',
    floor: 100, // pixel-exact — mid-allocation; row 3 = "PRESS ▶ FOR NEXT CATEGORY"
    render: renderSkillTrain,
  },
  {
    fixture: 'creation-skill-train-done',
    floor: 100, // pixel-exact — budget = 0; row 3 = "PRESS ▶ TO EXIT"
    render: renderSkillTrainDone,
  },
  {
    fixture: 'creation-confirm',
    floor: 100, // pixel-exact — "SAVE THIS CHARACTER? YES NO" with YES selected
    render: renderConfirm,
  },
  {
    fixture: 'creation-skill-train-physical',
    floor: 100, // pixel-exact — PHYSICAL category (Fighter SCOUTING only); 0x25/0x26 brackets + 0xe0 name attr
    render: renderSkillTrainPhysical,
  },
  {
    fixture: 'creation-review-character',
    floor: 100, // pixel-exact — REVIEW PC char-sheet of NATHAN Rawulf Fighter; BONUS row hidden, EXIT prompt at row 1
    render: renderReviewCharacter,
  },
  {
    fixture: 'creation-review-picker',
    floor: 100, // pixel-exact — REVIEW WHO? roster picker (1 character; scrollbar + COLORED highlight)
    render: renderReviewPicker,
  },
  {
    fixture: 'creation-delete-picker',
    floor: 100, // pixel-exact — DELETE WHO? picker (same layout as REVIEW WHO?, different title msg)
    render: renderDeletePicker,
  },
  {
    fixture: 'creation-delete-confirm',
    floor: 100, // pixel-exact — "DELETE THIS CHARACTER? YES NO" with NO selected by default
    render: renderDeleteConfirm,
  },
  {
    fixture: 'creation-rename-picker',
    floor: 100, // pixel-exact — RENAME WHO? picker
    render: renderRenamePicker,
  },
  {
    fixture: 'creation-rename-input',
    floor: 100, // pixel-exact — char-sheet + " NEW NAME >a       " input (empty buffer)
    render: renderRenameInput,
  },
  {
    fixture: 'creation-portrait-target-picker',
    floor: 100, // pixel-exact — PORTRAIT FOR WHOM? picker
    render: renderPortraitTargetPicker,
  },
  {
    fixture: 'creation-portrait-change',
    floor: 100, // pixel-exact — portrait-change active (char sheet + creation-style picker)
    render: renderPortraitChange,
  },
  {
    fixture: 'creation-portrait-done',
    floor: 100, // pixel-exact — post-change preview (char sheet with new portrait + "PRESS ▶ TO EXIT")
    render: renderPortraitDone,
  },
  {
    fixture: 'creation-review-member',
    floor: 100,
    render: renderCreationReviewMember,
  },
  {
    fixture: 'review-member-view',
    floor: 100, // 3-member party — THESUS char sheet + resolved equipment + 7-entry menu, EXIT highlighted
    render: renderReviewMemberView,
  },
  {
    // Post-EQUIP char view (save 5): THESUS after equipping all 5 items. The
    // inventory is reordered to body-slot order with ✓ markers, equipped names
    // recolored (weapon/shield 0x60, armor 0x70), AC "9 (-1)" with the shield AC
    // folded into the grid, and the equipped-armor AC-grid icons.
    fixture: 'review-member-equipped',
    floor: 100,
    render: (f, p) => renderReviewMemberView(f, p, true),
  },
  {
    // EQUIP slot 0, initial: cursor on NONE, ▸ LONGSWORD (candidate), prompt
    // "SELECT PRIMARY WEAPON > NONE" (NONE highlighted). cursor 99 = NONE.
    fixture: 'equip-slot0',
    floor: 100,
    render: (f, p) => renderEquip(f, p, 0, Array(8).fill(null), 99),
  },
  {
    // EQUIP slot 1, after equipping LONGSWORD (slot 0): ✓ LONGSWORD, ▸ BUCKLER
    // (candidate), cursor on NONE. selections[0]=0 (LONGSWORD inv idx).
    fixture: 'equip-slot1-equipped',
    floor: 100,
    render: (f, p) => renderEquip(f, p, 1, [0, null, null, null, null, null, null, null], 99),
  },
  {
    // EQUIP slot 1, cursor moved onto BUCKLER (boxed) — ✓ LONGSWORD, BUCKLER
    // boxed+▸, NONE not highlighted. cursor 0 = first (only) candidate.
    fixture: 'equip-slot1-selected',
    floor: 100,
    render: (f, p) => renderEquip(f, p, 1, [0, null, null, null, null, null, null, null], 0),
  },
  {
    fixture: 'assay-picker',
    floor: 100, // ASSAY inventory-picker — char sheet + "ASSAY WHICH ITEM?   NONE" bar (cursor on NONE)
    render: renderAssayPicker,
  },
  {
    fixture: 'assay-longsword',
    floor: 100, // ASSAY stat popup — 20×12 LONGSWORD inspect block + "PRESS ↵ TO EXIT" strip
    render: renderAssayDisplay,
  },
  {
    // SKILL viewer, WEAPONRY (cat 0). Tabs [PHYSICAL,ACADEMIA,EXIT], cursor on
    // PHYSICAL. THESUS WEAPONRY: SWORD=10, SHIELD=2, rest of slots 0-8 = 0.
    fixture: 'skill-viewer-weaponry',
    floor: 100,
    render: (f, p) => renderSkillViewer(f, p, 0, 0),
  },
  {
    // SKILL viewer, PHYSICAL (cat 1). Tabs [WEAPONRY,ACADEMIA,EXIT], cursor on
    // ACADEMIA (entry 1). Fighter PHYSICAL = SCOUTING only (slot 11), level 0.
    fixture: 'skill-viewer-physical',
    floor: 100,
    render: (f, p) => renderSkillViewer(f, p, 1, 1),
  },
  {
    // SKILL viewer, ACADEMIA (cat 3). Tabs [WEAPONRY,PHYSICAL,EXIT], cursor on
    // EXIT (entry 2). Fighter ACADEMIA = ARTIFACTS/MYTHOLOGY/SCRIBE, all 0.
    fixture: 'skill-viewer-academia',
    floor: 100,
    render: (f, p) => renderSkillViewer(f, p, 3, 2),
  },
  {
    // SWAG BAG, empty. Menu [ADD, EXIT] (REMOVE/DROP hidden), cursor on EXIT
    // (visible index 1).
    fixture: 'swag-empty',
    floor: 100,
    render: (f, p) => renderSwagBag(f, p, [], [
      { label: 'ADD', enabled: true }, { label: 'REMOVE', enabled: false },
      { label: 'DROP', enabled: false }, { label: 'EXIT', enabled: true },
    ], 1),
  },
  {
    // SWAG BAG with LONGSWORD (icon 0x02). Menu [ADD,REMOVE,DROP,EXIT], cursor
    // on EXIT (visible index 3).
    fixture: 'swag-longsword',
    floor: 100,
    render: (f, p) => renderSwagBag(f, p, [{ name: 'LONGSWORD', icon: 0x02 }], [
      { label: 'ADD', enabled: true }, { label: 'REMOVE', enabled: true },
      { label: 'DROP', enabled: true }, { label: 'EXIT', enabled: true },
    ], 3),
  },
];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('screen pixel-parity vs committed engine fixtures (target 100%)', () => {
  let fontSet: FontSet;
  beforeAll(async () => {
    fontSet = await loadCreationFontSet({ loadFont: diskLoadFont, loadFont4bpp: diskLoadFont4bpp });
    msgDb = MessageDbSchema.parse(
      JSON.parse(readFileSync(join(EXTRACTED_MESSAGES, 'msg.json'), 'utf-8')),
    );
  });

  for (const sc of SCREENS) {
    it(`${sc.fixture}: RGB match ≥ ${sc.floor}% (regression floor; target 100)`, () => {
      const ours = sc.render(fontSet, WIZ6_MAIN);
      const eng = engineRgba(sc.fixture);
      const result = compareRgba(ours, eng, { tolerance: 0 });

      // Diagnostics on a shortfall (and always, cheaply): write our render + diff.
      try {
        writeFileSync(
          join('/tmp', `parity-ours-${sc.fixture}.png`),
          encodePngRgba(320, 200, new Uint8Array(ours.buffer)),
        );
        writeDiffPng(ours, eng, join('/tmp', `parity-diff-${sc.fixture}.png`), { tolerance: 0 });
      } catch {
        /* diagnostics are non-fatal */
      }

      expect(
        result.matchPct,
        `${sc.fixture}: ${result.matchPct.toFixed(2)}% (${result.diffCount} px differ) — see /tmp/parity-diff-${sc.fixture}.png`,
      ).toBeGreaterThanOrEqual(sc.floor);
    });
  }
});
