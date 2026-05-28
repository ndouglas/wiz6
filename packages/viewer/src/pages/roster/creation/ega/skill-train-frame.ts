/**
 * composeSkillTrainFrame — pure layout for screen-13 (skill bonus assignment).
 *
 * Shared by `SkillTrainScreen.tsx` (live viewer) and the parity test in
 * `tools/parity/screen-parity.test.ts`. Reproduces the exact tile-window cells
 * the engine builds for this screen, verified byte-exact against save slot 1
 * (NATHAN samurai, WEAPONRY, portrait 21, 5 skill points).
 *
 * Engine windows:
 *   - top       — char sheet w/ persistent portrait baked at (1..3, 1..3)
 *                 (chars 0x48..0x50 attr 0x02 → wfont2 with portrait tiles
 *                 injected at those glyph indices). Age fields populated.
 *   - bottomBar — 3 prompt rows (centered, floor-padding):
 *                   row 1: MSG.skillAssign        (0x0262)
 *                   row 2: MSG.skillAdjusts + "   " + MSG.skillSelects
 *                   row 3: MSG.skillNextCategory  (0x0260)
 *   - menuPanel — left as default (gray fill); covered by skillTrain.
 *   - skillTrain — 20×16 @ (160,32). Frame + category header + N skill rows
 *                  + selection cursor 'd' (0x64 attr 0x40) at (15, 3+cursorIdx)
 *                  + "SKILL POINTS  N" at row 14. The skillTrain struct lives
 *                  at DGROUP+0x7e26 in the engine; cells dumped via
 *                  `tools/parity/dump-cells.py`.
 *
 * The category cycle (WEAPONRY → PHYSICAL → PERSONAL → ACADEMIA) is the
 * caller's concern — `view.category` selects which to show; only skills
 * filtered by `view.trainableInCategory` are rendered.
 */

import { clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb, PortraitSet } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { DraftState } from '../state.js';
import { createPersistentWindows, createSkillTrainWindow } from './windows.js';
import { drawCharSheet } from './char-sheet.js';
import { creationString, MSG, skillName, skillCatName } from '../messages.js';

// ---------------------------------------------------------------------------
// Constants — engine-verified byte values
// ---------------------------------------------------------------------------

/**
 * Skill categories per `docs/re/wpcmk-screens.md` §5.
 *
 * Fields:
 *   - `iconLeft` / `iconRight` — wfont4 glyph chars at row-1 col 2 / col 17
 *     (always attr 0x04). WEAPONRY uses the same glyph both sides; PHYSICAL
 *     uses a mirrored pair. PERSONAL/ACADEMIA are inferred pending engine RE.
 *   - `nameAttr` — attr applied to the skill name cells (col 1..N). WEAPONRY
 *     uses 0x20 (palette 2 = light blue); PHYSICAL uses 0xe0 (palette 14 =
 *     yellow). PERSONAL/ACADEMIA inferred — see TODO #022.
 */
export const SKILL_CATEGORIES = [
  { msgOffset: 0, startSlot: 0,  endSlot: 9,  iconLeft: 0x02, iconRight: 0x02, nameAttr: 0x20 }, // WEAPONRY ✓
  { msgOffset: 1, startSlot: 10, endSlot: 16, iconLeft: 0x25, iconRight: 0x26, nameAttr: 0xe0 }, // PHYSICAL ✓
  { msgOffset: 2, startSlot: 17, endSlot: 21, iconLeft: 0x27, iconRight: 0x27, nameAttr: 0x60 }, // PERSONAL — TODO RE
  { msgOffset: 3, startSlot: 22, endSlot: 29, iconLeft: 0x29, iconRight: 0x2a, nameAttr: 0x90 }, // ACADEMIA — TODO RE
] as const;

/** Font slot for the persistent portrait baked into wfont2 glyphs 0x48..0x50. */
const PORTRAIT_GLYPH_BASE = 0x48;
const PORTRAITS_PER_FILE = 14;

/** Selection-cursor glyph + attr (a 'd' shape in wfont0 at palette-4 highlight). */
const CURSOR_CHAR = 0x64;
const CURSOR_ATTR = 0x40;

// ---------------------------------------------------------------------------
// View model
// ---------------------------------------------------------------------------

export interface SkillTrainView {
  /** Character-sheet draft (passed through to drawCharSheet). */
  draft: DraftState;
  /** Index into SKILL_CATEGORIES (0..3). */
  categoryIdx: number;
  /** Skill slot indices to display in this category, in display order. */
  trainableInCategory: number[];
  /** Cursor: index into trainableInCategory (0..length-1). */
  cursorIdx: number;
  /**
   * Cursor render mode (default = `'active'`):
   *   - 'active'   → 'd' (0x64) at attr 0x40 — the live selection cursor.
   *   - 'residual' → ' ' (0x20) at attr 0x70 — the gray-space residual the
   *     engine leaves on the previously-selected row after exit (e.g. the
   *     confirm screen still shows the skill panel with the residual marker).
   *   - 'none'     → cursor cell stays as the default black-fill (0x00 @ 0x01).
   */
  cursorState?: 'active' | 'residual' | 'none';
  /** Remaining skill points (rendered at row 14). */
  skillPoints: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeCell(win: TileWindow, x: number, y: number, ch: number, attr: number): void {
  const idx = (y * win.widthCells + x) * 2;
  win.cells[idx] = ch & 0xff;
  win.cells[idx + 1] = attr & 0xff;
}

/** Resolve which wport file + internal index holds the given portrait. */
function portraitTilesFor(
  portraits: PortraitSet[],
  portraitIdx: number,
): number[][] | null {
  const fileIdx = Math.floor(portraitIdx / PORTRAITS_PER_FILE);
  const inFile = portraitIdx % PORTRAITS_PER_FILE;
  const set = portraits[fileIdx];
  const portrait = set?.portraits[inFile];
  return portrait?.tiles ?? null;
}

/**
 * Clone fontSet.font2 with the given portrait's 9 tiles injected at the engine's
 * persistent slots (0x48..0x50). Returns the original fontSet if the portrait
 * can't be resolved (e.g., portraits array empty in tests).
 */
export function patchFontSetWithPortrait(
  fontSet: FontSet,
  portraits: PortraitSet[],
  portraitIdx: number,
): FontSet {
  const tiles = portraitTilesFor(portraits, portraitIdx);
  const baseFont2 = fontSet.font2;
  if (!tiles || !baseFont2) return fontSet;
  const glyphs = baseFont2.glyphs.map((g, i) =>
    i >= PORTRAIT_GLYPH_BASE && i < PORTRAIT_GLYPH_BASE + 9
      ? tiles[i - PORTRAIT_GLYPH_BASE]!
      : g,
  );
  return { ...fontSet, font2: { ...baseFont2, glyphs } };
}

// ---------------------------------------------------------------------------
// composeSkillTrainFrame
// ---------------------------------------------------------------------------

/**
 * Build the four TileWindows for screen-13 in paint order.
 *
 * Layout is byte-exact per the slot-1 cell dump:
 *   - skillTrain row 0/15: frame top/bottom (wfont1 box chars)
 *   - row 1: category header (e.g. "WEAPONRY" at cols 6-13 attr 0x03) flanked
 *     by attr-0x04 bracket glyphs at cols 2 + 17
 *   - row 2: T-junction separator (col 0 = 0x21 — a left-T in wfont1)
 *   - rows 3..N: N skill rows; left vert glyph 0x0d (or 0x0f on engine-reserved
 *     rows 9 + 11; this idiosyncrasy is reproduced from the dump and reflects
 *     either iteration parity or per-row decoration we haven't pinned down)
 *   - row 12: empty divider
 *   - row 13: T-junction separator
 *   - row 14: "SKILL POINTS  N" — label attr 0x90, value attr 0x10
 *
 * Selection cursor: a 'd' (0x64) at attr 0x40 (= wfont0 highlight path,
 * palette-4 inverted) is overlaid at (15, 3 + cursorIdx).
 *
 * The skill bonus value rendered in col 18 is the digit `0..9` from
 * `draft.skills[slot]`. Values >9 would overflow this 1-column field; the
 * engine UI relies on per-class budgets keeping values in range.
 */
export function composeSkillTrainFrame(
  view: SkillTrainView,
  db: MessageDb,
  /**
   * Optional bottomBar renderer. When provided, REPLACES the default skill-
   * train prompts ("ASSIGN INITIAL SKILL BONUS" / "ADJUSTS/SELECTS" / "NEXT
   * CATEGORY|TO EXIT"). The confirm screen uses this to keep the skillTrain
   * panel + char sheet while swapping the bottomBar for "SAVE THIS CHARACTER?".
   * The bottomBar is already cleared by createPersistentWindows.
   */
  renderBottomBar?: (bb: TileWindow) => void,
): TileWindow[] {
  const { top, bottomBar, menuPanel } = createPersistentWindows();

  // --- top window: char sheet + persistent portrait + age fields ---
  drawCharSheet(top, view.draft, db);

  // Overlay portrait tiles HIJ / KLM / NOP at (1..3, 1..3) attr 0x02. The cells
  // were just written by drawCharSheet as gray spaces (in the empty-name path);
  // we paint over.
  for (let r = 0; r < 3; r++) {
    setCursor(top, 1, 1 + r);
    puts(top,
      String.fromCharCode(PORTRAIT_GLYPH_BASE + r * 3) +
      String.fromCharCode(PORTRAIT_GLYPH_BASE + r * 3 + 1) +
      String.fromCharCode(PORTRAIT_GLYPH_BASE + r * 3 + 2),
      0x02,
    );
  }

  // Engine populates a second age-cache field at top (5, 3) — purpose unknown
  // (TODO: RE; not in draft.derived). Slot-1 observed value = 1. drawCharSheet
  // writes "  0" here so we paint over for parity. Once derived, this should
  // come from draft.derived.
  // Render width-3 right-aligned at attr 0xc0 (matches drawCharSheet's choice).
  setCursor(top, 5, 3);
  puts(top, '  1', 0xc0);

  // --- bottomBar: caller override or default 3 prompts ---
  if (renderBottomBar) {
    renderBottomBar(bottomBar);
  } else {
    const assign = creationString(db, MSG.skillAssign);
    setCursor(bottomBar, Math.floor((bottomBar.widthCells - assign.length) / 2), 1);
    puts(bottomBar, assign, 0x03);

    const adjusts = creationString(db, MSG.skillAdjusts);
    const selects = creationString(db, MSG.skillSelects);
    const combined = adjusts + '   ' + selects;
    setCursor(bottomBar, Math.floor((bottomBar.widthCells - combined.length) / 2), 2);
    puts(bottomBar, combined, 0x03);

    // Row 3 toggles by budget: while points remain, "PRESS ▶ FOR NEXT CATEGORY"
    // (Enter cycles category). When budget hits 0, the prompt becomes
    // "PRESS ▶ TO EXIT" — Enter dispatches SKILLS_DONE. The engine does NOT
    // auto-advance on budget 0; the player must press the exit key.
    const exitPrompt = view.skillPoints <= 0
      ? creationString(db, MSG.skillExit)
      : creationString(db, MSG.skillNextCategory);
    setCursor(bottomBar, Math.floor((bottomBar.widthCells - exitPrompt.length) / 2), 3);
    puts(bottomBar, exitPrompt, 0x03);
  }

  // --- skillTrain window: frame + category header + skill rows + footer ---
  const skillTrain = createSkillTrainWindow();
  clearWindow(skillTrain, 0x20, 0x03);

  // Row 0: frame top.
  writeCell(skillTrain, 0, 0, 0x0e, 0x01);
  for (let x = 1; x < 19; x++) writeCell(skillTrain, x, 0, 0x0c, 0x01);
  writeCell(skillTrain, 19, 0, 0x0a, 0x01);

  // Row 1: category header with per-category icon brackets (attr 0x04, wfont4).
  const cat = SKILL_CATEGORIES[view.categoryIdx]!;
  writeCell(skillTrain, 0, 1, 0x0d, 0x01);
  writeCell(skillTrain, 2, 1, cat.iconLeft, 0x04);
  const catName = skillCatName(db, cat.msgOffset);
  // Engine centers the category name in cols 3..16 (14-cell field between the
  // two icon brackets). floor padding.
  const catStart = 3 + Math.floor((14 - catName.length) / 2);
  setCursor(skillTrain, catStart, 1);
  puts(skillTrain, catName, 0x03);
  writeCell(skillTrain, 17, 1, cat.iconRight, 0x04);
  writeCell(skillTrain, 19, 1, 0x05, 0x01);

  // Row 2: T-junction separator (col 0 = wfont1 glyph 0x21, drawn as left-T).
  writeCell(skillTrain, 0, 2, 0x21, 0x01);
  for (let x = 1; x < 19; x++) writeCell(skillTrain, x, 2, 0x0c, 0x01);
  writeCell(skillTrain, 19, 2, 0x0a, 0x01);

  // Engine pre-fills rows 3..11 with the empty skeleton (left/right vert + 18
  // cells of black-fill) BEFORE drawing skill content. This shows in categories
  // with fewer than 9 trainable skills (e.g. Fighter PHYSICAL has only SCOUTING —
  // rows 4..11 remain as the empty skeleton). Also note rows 9 + 11 use the
  // alternate left-vert glyph 0x0f (origin still unknown — reproduced).
  for (let y = 3; y <= 11; y++) {
    const leftVert = (y === 9 || y === 11) ? 0x0f : 0x0d;
    writeCell(skillTrain, 0, y, leftVert, 0x01);
    for (let x = 1; x <= 18; x++) writeCell(skillTrain, x, y, 0x00, 0x01);
    writeCell(skillTrain, 19, y, 0x05, 0x01);
  }

  // Rows 3..(3 + N - 1): skill entries. Name attr is per-category. Bonus is
  // right-aligned in cols 16..18 (width 3) at attr 0x10.
  const nameAttr = cat.nameAttr;
  for (let i = 0; i < view.trainableInCategory.length; i++) {
    const y = 3 + i;
    const slot = view.trainableInCategory[i]!;
    const name = skillName(db, slot) || `SKILL ${slot}`;
    const bonus = view.draft.skills[slot] ?? 0;
    setCursor(skillTrain, 1, y);
    puts(skillTrain, name, nameAttr);
    // Cols name.length+1..15 stay as the black-fill skeleton already written.
    // Cols 16..18: width-3 right-aligned bonus value (spaces + digits) at attr 0x10.
    const bonusStr = String(Math.max(0, bonus)).padStart(3, ' ');
    for (let x = 0; x < 3; x++) {
      writeCell(skillTrain, 16 + x, y, bonusStr.charCodeAt(x), 0x10);
    }
  }

  // Selection cursor — see SkillTrainView.cursorState. After the player exits
  // skill-train (e.g. confirm screen), the engine clears the 'd' but keeps a
  // gray-space at attr 0x70 marking the last position; we reproduce that.
  if (view.cursorIdx >= 0 && view.cursorIdx < view.trainableInCategory.length) {
    const mode = view.cursorState ?? 'active';
    if (mode === 'active') {
      writeCell(skillTrain, 15, 3 + view.cursorIdx, CURSOR_CHAR, CURSOR_ATTR);
    } else if (mode === 'residual') {
      writeCell(skillTrain, 15, 3 + view.cursorIdx, 0x20, 0x70);
    }
    // 'none' leaves the default black-fill cell in place.
  }

  // Pad any unused row slots (after the last skill, before row 12) with the
  // default gray fill — clearWindow already did this; nothing to do.

  // Row 12: empty spacer.
  writeCell(skillTrain, 0, 12, 0x0d, 0x01);
  for (let x = 1; x < 19; x++) writeCell(skillTrain, x, 12, 0x00, 0x01);
  writeCell(skillTrain, 19, 12, 0x05, 0x01);

  // Row 13: T-junction separator above SKILL POINTS.
  writeCell(skillTrain, 0, 13, 0x10, 0x01);
  for (let x = 1; x < 19; x++) writeCell(skillTrain, x, 13, 0x0c, 0x01);
  writeCell(skillTrain, 19, 13, 0x0a, 0x01);

  // Row 14: SKILL POINTS label + value (value width-3 right-aligned).
  writeCell(skillTrain, 0, 14, 0x0d, 0x01);
  setCursor(skillTrain, 1, 14);
  puts(skillTrain, 'SKILL POINTS', 0x90);
  for (let x = 13; x < 16; x++) writeCell(skillTrain, x, 14, 0x00, 0x01);
  const ptsStr = String(Math.max(0, view.skillPoints)).padStart(3, ' ');
  for (let x = 0; x < 3; x++) {
    writeCell(skillTrain, 16 + x, 14, ptsStr.charCodeAt(x), 0x10);
  }
  writeCell(skillTrain, 19, 14, 0x05, 0x01);

  // Row 15: frame bottom.
  writeCell(skillTrain, 0, 15, 0x0b, 0x01);
  for (let x = 1; x < 19; x++) writeCell(skillTrain, x, 15, 0x07, 0x01);
  writeCell(skillTrain, 19, 15, 0x08, 0x01);

  return [top, bottomBar, menuPanel, skillTrain];
}
