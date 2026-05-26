/**
 * Starter spells — RE finding summary for wpcmk.ovr character creation.
 *
 * **Finding**: There is NO static per-class starter-spell pool.
 * Spells are chosen interactively by the player during character creation
 * in the spell-selection UI at wpcmk.ovr file offset 0x1ae9.
 *
 * **Evidence (wpcmk.ovr 0x1b28):**
 * ```
 * e8 8b a0   ; call 0xbbb6  →  ui_window_create (wroot 0x011a)
 * ```
 * Thunk at 0xbbb6: 0xbbb6 − 0xBA9C = 0x011a → `ui_window_create` in wroot.exe.
 * The spell-selection UI opens a window at 0x1b28, meaning spells are picked
 * dynamically — not assigned from a static table.
 *
 * **Cross-validation against stock characters (pcfile.dbs):**
 * TREON (Mage) and PENTAG (Mage) — the same class — have different
 * spell/school-slot contents at record offset +0x188:
 *
 * | Character | Class | spellSlotsKnown[0..19] (hex)             |
 * |-----------|-------|------------------------------------------|
 * | TREON     | Mage  | 0100000000000100000000000000000000000000 |
 * | PENTAG    | Mage  | 0002000020000000000000000000000000000000 |
 *
 * Two Mages with different spell selections proves the data is player-chosen,
 * not class-derived from a static table.
 *
 * **What `spellSlotsKnown` actually is:**
 * The 20-byte field at pcfile +0x188 (DGROUP 0x4570 during runtime) holds
 * per-school spell-known counts or spell-slot tracking. The exact byte encoding
 * per school is not yet fully decoded (follow-up RE task), but the player-selection
 * nature is confirmed by the stock-character divergence above.
 *
 * **Implication for the TS port:**
 * The character-creation port should present a spell-selection UI for
 * spell-capable classes, not pre-populate from a table. The school allocation
 * at wpcmk 0x3e51 (14 schools × per-class allocation) initialises the
 * spell-school rank thresholds, but does not select specific spells.
 *
 * **Asm cross-ref:**
 * - wpcmk 0x1ae9: function prologue of the spell-selection entry
 * - wpcmk 0x1b28: `e8 8b a0` call to `ui_window_create` thunk at 0xbbb6
 * - wpcmk 0x3e51: `spell_school_init` — initialises rank thresholds, NOT spell selection
 */

/**
 * Starter spells are player-selected, not class-static.
 *
 * The character creation overlay (wpcmk.ovr) opens an interactive spell
 * picker UI for spell-capable classes; there is no fixed per-class starter pool.
 * This constant is a documentary placeholder, not data.
 *
 * `hasInteractiveSpellPicker[classIndex]` is true if the class opens the
 * spell-selection window during character creation. Spell-capable classes are:
 * Mage (1), Priest (2), Alchemist (5), Bard (6), Psionic (7), Bishop (9).
 * Other classes do not have a spell picker.
 *
 * **Status:** Which class indices open the picker is inferred from the class
 * schema and the magic-system design (3 spell-capable + hybrid classes).
 * The exact branch condition gating the picker call at wpcmk 0x1ae9 has not
 * been independently verified by reading the branch bytes. Treat as medium
 * confidence.
 */
export const SPELL_PICKER_CLASSES: ReadonlySet<number> = new Set([
  1,  // Mage
  2,  // Priest
  5,  // Alchemist
  6,  // Bard
  7,  // Psionic
  9,  // Bishop
]);

/**
 * Returns true if the given class index has an interactive spell picker
 * during character creation (no static starter pool).
 */
export function classHasSpellPicker(classIndex: number): boolean {
  return SPELL_PICKER_CLASSES.has(classIndex);
}

/**
 * Marker constant documenting the RE finding.
 * The spell-selection UI opens at wpcmk 0x1ae9, confirmed by the
 * `call ui_window_create` at 0x1b28.
 */
export const STARTER_SPELLS_ARE_PLAYER_SELECTED = true;
