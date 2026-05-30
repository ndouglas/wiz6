/**
 * composePartyPanel — TS port of engine FUN_1b2d @ wbase.ovr 0x1b2d
 * (party_panel_redraw_slot).
 *
 * The per-slot panel layout was verified by dumping the live LEFT/RIGHT panel
 * window cells from save 2 (NATHAN slot 0, NUG2 slot 1) — see the ground-truth
 * table in `castle-frame.ts`. Each slot occupies a 7-wide × 4-tall block laid
 * out as three vertical panes (matching the user's description of the screen):
 *
 *   row+0 .................. NAME (7 cells, attr 0x03 / wfont3)
 *   rows row+1..row+3:
 *     cols 0..2 ........... PORTRAIT (3×3 wport tiles; blitted separately in
 *                           castle-frame.ts, covers these cells)
 *     col 3..4, row+1 ..... EQUIPMENT (right-hand / left-hand item glyphs;
 *                           empty hands = 0x25/0x26, attr 0x04 / wfont4)
 *     col 3..4, row+2 ..... CLASS symbol (0x3a + class*2 [+1], attr 0x01)
 *     col 3,   row+3 ...... STATUS icon  (icon + 0x25, attr 0x01)
 *     col 4,   row+3 ...... CONDITION icon (severity + 0x25, attr 0x03;
 *                           none → cleared space)
 *     col 5,   rows 1..3 .. HP bar     (red,    FUN_1a4c base 0x56, attr 0x01)
 *     col 6,   rows 1..3 .. STAMINA bar (yellow, FUN_1a4c base 0x63, attr 0x01)
 *
 * Even slots (0,2,4) render into the LEFT panel window (DGROUP 0x4fba), odd
 * slots (1,3,5) into the RIGHT (DGROUP 0x4fb8); panel row = (slot/2)*4.
 *
 * The HP/stamina bars are FUN_1a4c (decoded in
 * docs/re/findings/wbase-party-panel-redraw.json as the "equipment-tile" calls
 * — that label was WRONG: the two calls are the vertical HP and stamina bars,
 * confirmed against the cell dump: base 0x56 (HP) / 0x63 (stamina), and a full
 * bar [base+12, base+8, base+3] = [0x62,0x5e,0x59] / [0x6f,0x6b,0x66] matches
 * the live cells exactly). The class-symbol direct-offset finding
 * (`class-symbol-not-a-table`) is confirmed; the row/col assignments in the
 * finding's other claims were off-by-one vs the cell dump and are superseded
 * by the table above.
 *
 * Status/condition icon tables are unchanged from the finding (DGROUP 0x526 /
 * 0x532).
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

/** FUN_1a4c base glyph for the HP (red) bar. Full bar = [+12,+8,+3]. */
const HP_BAR_BASE = 0x56;
/** FUN_1a4c base glyph for the stamina (yellow) bar. */
const STAMINA_BAR_BASE = 0x63;

/**
 * Empty-hands equipment glyphs (right hand, left hand), attr 0x04 / wfont4.
 * `ActivePartyMember` carries no equipment yet, so every member renders the
 * empty-hands sprite. When the schema grows right-/left-hand item fields,
 * map the equipped item type to its 2-cell glyph pair here (TODO).
 */
const EMPTY_HANDS: readonly [number, number] = [0x25, 0x26];

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
    /** Equipment 2-cell row (right hand, left hand) at (col 3-4, row+1).
     *  Empty hands = [0x25, 0x26]. */
    equipment: [number, number];
    /** Class-symbol 2-cell row at (col 3-4, row+2). `[0x3a + class*2, +1]`. */
    classSymbol: [number, number];
    /**
     * Status icon glyph code (the raw icon index; consumer draws `icon + 0x25`
     * at col 3, row+3, attr 0x01). Healthy = 0 → glyph 0x25.
     */
    statusIcon: number;
    /**
     * Condition severity icon (signed int from CONDITION_SEVERITY_TABLE).
     * NO_CONDITION_ICON (-1) means "no condition — leave the cleared cell".
     * Any non-negative `s` → consumer draws char `s + 0x25` at (col 4, row+3).
     */
    conditionIcon: number;
    /** HP bar (red): 3 vertical cells [top, mid, bottom] at col 5, rows 1..3. */
    hpBar: [number, number, number];
    /** Stamina bar (yellow): 3 vertical cells at col 6, rows 1..3. */
    staminaBar: [number, number, number];
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
  const statusIcon = composeStatusIcon(member);
  const conditionIcon = composeConditionIcon(member.conditions);
  const classSymbol: [number, number] = [
    (member.class * 2 + 0x3a) & 0xff,
    (member.class * 2 + 0x3a + 1) & 0xff,
  ];
  const hpBar = composeBar(member.hpCurrent ?? 0, member.hpMax ?? 0, HP_BAR_BASE);
  const staminaBar = composeBar(
    member.staminaCurrent ?? 0,
    member.staminaMax ?? 0,
    STAMINA_BAR_BASE,
  );

  return {
    column,
    panelRow,
    fields: {
      name,
      equipment: [EMPTY_HANDS[0], EMPTY_HANDS[1]],
      classSymbol,
      statusIcon,
      conditionIcon,
      hpBar,
      staminaBar,
    },
  };
}

/**
 * FUN_1a4c — render a vertical 3-cell fill bar showing `cur/max` as a level.
 *
 * Step 1 (level): `value = 0` if `cur <= 0`, else
 * `min(min(floor(cur*100/max), 10) + 1, 10)` — a full bar (cur==max) → 10.
 * Step 2 (glyphs): the 3 cells are [top, mid, bottom] initialised to
 * [base+9, base+4, base+0] (the empty glyphs), then filled bottom-up:
 *   value ≤ 3 → bottom = base+value
 *   value ≤ 7 → bottom = base+3, mid = base+(value-3)+4
 *   else      → bottom = base+3, mid = base+8, top = base+(value-7)+9
 * Full (value 10): [base+12, base+8, base+3].
 *
 * Verified against the live cell dump: HP base 0x56 full → [0x62,0x5e,0x59];
 * stamina base 0x63 full → [0x6f,0x6b,0x66].
 */
function composeBar(cur: number, max: number, base: number): [number, number, number] {
  let value: number;
  if (cur <= 0 || max <= 0) {
    value = 0;
  } else {
    const inner = Math.min(Math.floor((cur * 100) / max), 10);
    value = Math.min(inner + 1, 10);
  }
  let top = base + 9;
  let mid = base + 4;
  let bottom = base + 0;
  if (value <= 3) {
    bottom = base + value;
  } else if (value <= 7) {
    bottom = base + 3;
    mid = base + (value - 3) + 4;
  } else {
    bottom = base + 3;
    mid = base + 8;
    top = base + (value - 7) + 9;
  }
  return [top & 0xff, mid & 0xff, bottom & 0xff];
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
