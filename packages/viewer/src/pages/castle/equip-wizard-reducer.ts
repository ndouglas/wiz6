/**
 * Pure navigation helpers for the WPCVW EQUIP wizard's per-slot candidate row.
 * The row is [candidate0..candidateN-1, SKIP] where SKIP index == candidateCount
 * (the engine's "empty/-1" position). The wizard state machine that uses these
 * lives in character-view-reducer.ts. RE: docs/re/findings/wpcvw-equip-action.json.
 */
const BODY_SLOT_MAX = 7;

export function nextEquipCursor(cursor: number, key: string, candidateCount: number): number {
  const max = candidateCount; // SKIP is at index candidateCount
  if (key === 'ArrowRight') return Math.min(max, cursor + 1);
  if (key === 'ArrowLeft') return Math.max(0, cursor - 1);
  return cursor;
}

export function nextPopulatedSlot(fromExclusive: number, hasCandidates: (slot: number) => boolean): number | null {
  for (let s = fromExclusive + 1; s <= BODY_SLOT_MAX; s++) {
    if (hasCandidates(s)) return s;
  }
  return null;
}
