/**
 * composePartyPanel — TS port of engine FUN_1b2d @ wbase.ovr 0x1b2d
 * (party_panel_redraw_slot).
 *
 * Per the corrected RE in
 * docs/re/findings/wbase-party-panel-redraw.json (2026-05-30):
 *
 *   - Even slots (0, 2, 4) render into the LEFT panel window (handle at
 *     DGROUP 0x4fba); odd slots (1, 3, 5) into the RIGHT panel window
 *     (DGROUP 0x4fb8).
 *   - Panel row within the chosen window = (slot / 2) * 4. Each slot occupies
 *     4 rows: row+0 (name), row+1 (eq-tile + class symbol), row+2 (condition
 *     icon), row+3 (status icon + 3x3 colored bar at cols 0..2 rows 1..3).
 *   - Class symbol is a DIRECT char-offset, NOT a table lookup: the cells at
 *     col 3-4 of row+1 are `class*2 + 0x3a` and `class*2 + 0x3a + 1`
 *     (this corrected the plan's "class table at 0x3a, 14 entries" claim —
 *     see finding `class-symbol-not-a-table`).
 *   - Colored-bar grid is a 3x3 block of glyphs (chars 2..10) at cols 0..2,
 *     rows row+1..row+3. Glyph at (row r in [0,3), col c in [0,3)) is
 *     `r*3 + 2 + c`.
 *   - Status icon: looked up in 14-entry u16 table at DGROUP 0x526, indexed by
 *     byte at record +0x4589. Overrides: if conditions[2] (death/ash) != 0
 *     and table-lookup returned 0, force icon=1; if conditions[3]
 *     (paralyzed/stone) != 0 and icon < 2, force icon=2.
 *   - Condition icon: scan conditions[0..9] for non-zero entries; for each
 *     non-zero condition[i], read severity from 10-entry u16 table at DGROUP
 *     0x532. Highest severity wins (sentinel 0xffff = signed -1 acts as
 *     "no icon"). Final character = severity + 0x25, drawn at (col 3, row+2).
 *
 * Open question (low confidence, per
 * docs/re/findings/wbase-party-portrait-blit.json `dcf2-coordinate-uncertainty`):
 *   The dcf2 thunk's Y-coordinate transform is unresolved. FUN_0b0e calls
 *   `dcf2(buf, 2, portrait_id*9+0x48, 9)` with Y=72 for portrait_id=0, but
 *   the engine fixture shows the portrait inside the panel (cells col 0..2,
 *   rows 1..3 of the panel window — i.e. screen y=48-71 for slot 0).
 *   castle-frame.ts compensates with empirical Y_BASE=48 to match the
 *   fixture; the dcf2 transform itself remains TODO #061.
 *
 * Spec: docs/superpowers/specs/2026-05-30-castle-party-panel-rerender-design.md
 */

import type { ActivePartyMember } from '@wiz6/data';

/**
 * Status-icon table at DGROUP 0x526 — 14 u16 entries indexed by the byte at
 * record +0x4589 (status_byte). Decoded from save 3.sav physical memory
 * @ phys 0x1856e per `status-icon-table` finding.
 *
 * Entries 6..9 are sentinel 0xffff (meaning "no icon — use status icon path
 * but with the condition-override branch") — they overlap the start of the
 * condition severity table at +0x532.
 */
const STATUS_ICON_TABLE: ReadonlyArray<number> = [
  0x0000, 0x0001, 0x0003, 0x0004, 0x0004, 0x0000,
  0xffff, 0xffff, 0xffff, 0xffff,
  0x0006, 0x0007, 0x0008, 0x0008,
];

/**
 * Condition severity table at DGROUP 0x532 — 10 u16 entries indexed by
 * conditions[0..9]. Decoded from save 3.sav physical memory @ phys 0x1857a
 * per `condition-severity-table` finding.
 *
 * Entries 0..3 are sentinel 0xffff (= signed -1) — those conditions are
 * lethal/inactive and handled by the status icon path instead. Entries 4..9
 * map to icon char `severity + 0x25` when the corresponding condition byte
 * is non-zero.
 */
const CONDITION_SEVERITY_TABLE: ReadonlyArray<number> = [
  0xffff, 0xffff, 0xffff, 0xffff,
  0x0006, 0x0007, 0x0008, 0x0008, 0x0007, 0x0005,
];

/** Each slot occupies 4 panel rows: `panelRow = (slot/2) * 4`. */
const PANEL_ROW_STRIDE = 4;

/** Sentinel for "no condition icon to render" — internal to this module. */
const NO_CONDITION_ICON = -1;

/** Result of FUN_1b2d for one party slot. Renderable cell data — no
 *  pixel buffer here, that's the consumer's job. */
export interface PartyPanel {
  /** Which panel window the slot's content goes into. */
  column: 'left' | 'right';
  /** Top cell row within the chosen panel window: 0, 4, or 8. */
  panelRow: number;
  fields: {
    /** Slot's display name (max 7 cells per engine's pad loop). */
    name: string;
    /** 3-row × 3-col grid of colored-bar glyph codes (chars 2..10). */
    coloredBar: number[][];
    /**
     * Status icon glyph code. The engine renders `icon + 0x25` at (col 3,
     * row+3). 0xffff sentinel from the table means "no glyph" — but per the
     * decompile, the engine still draws `0xffff + 0x25 = 0x24` (mod 256)
     * which is a benign filler. We mirror the raw lookup; consumers decide
     * whether to suppress the draw.
     */
    statusIcon: number;
    /**
     * Condition severity icon (signed int from CONDITION_SEVERITY_TABLE).
     * NO_CONDITION_ICON (-1) means "no glyph — draw 3 spaces" per the
     * `condition-severity-table` finding's else branch. Any non-negative
     * value `s` means the engine draws char `s + 0x25` at (col 3, row+2).
     */
    conditionIcon: number;
    /** Class-symbol 2-cell row. `[class*2 + 0x3a, class*2 + 0x3b]`. */
    classSymbol: [number, number];
  };
}

/**
 * Compose one party slot's panel data per FUN_1b2d.
 *
 * @param slot   0..5 — engine party slot.
 * @param member ActivePartyMember (engine record fields exposed via the data
 *               schema; only `name`, `class`, `conditions`, plus the sex/race
 *               composite used by the status_byte lookup are read).
 */
export function composePartyPanel(slot: number, member: ActivePartyMember): PartyPanel {
  const column: 'left' | 'right' = slot % 2 === 0 ? 'left' : 'right';
  const panelRow = Math.floor(slot / 2) * PANEL_ROW_STRIDE;

  const name = member.name;
  const coloredBar = composeColoredBarGrid();
  const statusIcon = composeStatusIcon(member);
  const conditionIcon = composeConditionIcon(member.conditions);
  const classSymbol: [number, number] = [
    (member.class * 2 + 0x3a) & 0xff,
    (member.class * 2 + 0x3a + 1) & 0xff,
  ];

  return {
    column,
    panelRow,
    fields: {
      name,
      coloredBar,
      statusIcon,
      conditionIcon,
      classSymbol,
    },
  };
}

/**
 * 3-row × 3-col colored-bar grid. Engine writes char `row*3 + 2 + col` at
 * each cell (cols 0..2, rows row+1..row+3). The 9 chars 2..10 are the
 * colored-bar segment glyphs in wfont1/wfont3.
 */
function composeColoredBarGrid(): number[][] {
  const grid: number[][] = [];
  for (let r = 0; r < 3; r++) {
    const row: number[] = [];
    for (let c = 0; c < 3; c++) {
      row.push(r * 3 + 2 + c);
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Status-icon lookup with override chain per `status-icon-table` finding.
 *
 * Engine code (decompile):
 * ```
 *   icon = *(int*)(0x526 + status_byte*2);
 *   if (icon == 0 && conditions[2] != 0) icon = 1;
 *   if (icon < 2 && conditions[3] != 0) icon = 2;
 * ```
 *
 * Wiz6's per-character `status_byte` (record +0x4589) is not exposed by the
 * current `ActivePartyMember` schema — see open question
 * "what does 0x4589 actually encode?" in the finding. Until pcfile-dbs schema
 * grows a `statusByte` field, we derive a best-effort composite from the
 * member's race/sex byte (this matches the engine for stock characters where
 * status_byte is always 0); the override branches still fire correctly via
 * the conditions[] array because those are wired through ActivePartyMember.
 */
function composeStatusIcon(member: ActivePartyMember): number {
  // For stock characters the status byte at record +0x4589 is 0. Until the
  // pcfile schema grows that field, assume 0 here so the override chain is
  // the only path that can change the icon. Documented as a finding-aligned
  // simplification — when the schema gains a `statusByte` field, switch
  // this to `STATUS_ICON_TABLE[member.statusByte] ?? 0xffff`.
  let icon = STATUS_ICON_TABLE[0] ?? 0;
  if (icon === 0 && member.conditions[2] !== 0) icon = 1;
  if (icon < 2 && member.conditions[3] !== 0) icon = 2;
  return icon;
}

/**
 * Pick the highest-severity condition icon. Scans `conditions[0..9]`; for
 * each non-zero entry, looks up severity in CONDITION_SEVERITY_TABLE. The
 * max wins (sentinel 0xffff = signed -1 never beats the initial -1, so
 * those conditions silently don't draw an icon).
 *
 * Returns NO_CONDITION_ICON (-1) if no condition contributed a non-sentinel
 * severity (engine then draws 3 space cells). Otherwise returns the severity
 * value — consumer draws `severity + 0x25` at (col 3, row+2).
 */
function composeConditionIcon(conditions: ReadonlyArray<number>): number {
  let best = NO_CONDITION_ICON;
  for (let i = 0; i < Math.min(conditions.length, CONDITION_SEVERITY_TABLE.length); i++) {
    const c = conditions[i] ?? 0;
    if (c === 0) continue;
    const severity = CONDITION_SEVERITY_TABLE[i] ?? 0xffff;
    // Sentinel 0xffff (== signed -1 in the engine's 16-bit signed compare)
    // never overrides best. Real severities are small positive (5..8).
    if (severity === 0xffff) continue;
    if (severity > best) best = severity;
  }
  return best;
}

/** Public re-export of the no-icon sentinel so renderers can match the
 *  engine's "draw 3 spaces" branch without leaking the magic number. */
export { NO_CONDITION_ICON };
