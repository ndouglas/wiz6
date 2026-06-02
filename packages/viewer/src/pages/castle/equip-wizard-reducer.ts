/**
 * Pure navigation helpers for the WPCVW EQUIP wizard's per-slot candidate row.
 * The row is [candidate0..candidateN-1, SKIP] where SKIP index == candidateCount
 * (the engine's "empty/-1" position). The wizard state machine that uses these
 * lives in character-view-reducer.ts. RE: docs/re/findings/wpcvw-equip-action.json.
 */
const BODY_SLOT_MAX = 7;

/**
 * EQUIP per-slot cursor nav. Engine-exact (RE: wpcvw-equip-ux-correction.json):
 * the cursor CYCLES through [candidate0..candidateN-1, NONE] where NONE ==
 * candidateCount, starting on NONE. DOWN: NONE→candidate0, candidateN-1→NONE,
 * else +1. UP is the reverse. (LEFT/RIGHT are accepted as aliases for UP/DOWN.)
 * The ▸ marker is a per-candidate "equippable" indicator, NOT the cursor — the
 * cursor is shown by highlighting NONE (prompt) or boxing the cursored item.
 */
export function nextEquipCursor(cursor: number, key: string, candidateCount: number): number {
  const NONE = candidateCount;
  if (candidateCount <= 0) return NONE; // only the NONE/skip position exists
  if (key === 'ArrowDown' || key === 'ArrowRight') return cursor === NONE ? 0 : cursor + 1;
  if (key === 'ArrowUp' || key === 'ArrowLeft') return cursor === 0 ? NONE : cursor - 1;
  return cursor;
}

export function nextPopulatedSlot(fromExclusive: number, hasCandidates: (slot: number) => boolean): number | null {
  for (let s = fromExclusive + 1; s <= BODY_SLOT_MAX; s++) {
    if (hasCandidates(s)) return s;
  }
  return null;
}
