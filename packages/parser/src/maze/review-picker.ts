/**
 * review-picker.ts — pure navigation for the in-dungeon "REVIEW WHO?" member picker
 * (OPTIONS → REVIEW). The cursor is a single number: -1 = EXIT (header row), 0..5 = a
 * party-panel slot (0-2 = left column rows 0-2; 3-5 = right column rows 0-2). Only the
 * occupied member slots + EXIT are navigable. CLAMP at edges (no wrap). Layout lives in
 * @wiz6/data (review-picker.ts, measured from the engine).
 */

/** EXIT sentinel cursor value (the header-row EXIT cell). */
export const REVIEW_EXIT = -1;

/** First occupied slot in display order (slots ordered 0,1,2,3,4,5). */
function firstOccupied(occupied: readonly number[]): number {
  let best = REVIEW_EXIT;
  for (const s of occupied) {
    if (best === REVIEW_EXIT || s < best) best = s;
  }
  return best;
}

/**
 * Move the cursor over the REVIEW WHO? picker. Navigable cells = the occupied member
 * slots + EXIT (-1). Clamps (stays put) when a move has no valid target.
 *
 * @param cursor       -1 = EXIT, else 0..5 (a party-panel slot)
 * @param dir          arrow direction
 * @param occupiedSlots present slot indices (e.g. [0,1,3]); display order is numeric
 */
export function moveReviewCursor(
  cursor: number,
  dir: 'up' | 'down' | 'left' | 'right',
  occupiedSlots: readonly number[],
): number {
  if (cursor === REVIEW_EXIT) {
    // From EXIT: down → first occupied member; everything else stays on EXIT.
    if (dir === 'down') {
      const first = firstOccupied(occupiedSlots);
      return first === REVIEW_EXIT ? REVIEW_EXIT : first;
    }
    return REVIEW_EXIT;
  }

  const col = cursor < 3 ? 0 : 1; // 0 = left, 1 = right
  const row = cursor % 3;
  const occ = (s: number) => occupiedSlots.includes(s);

  if (dir === 'up') {
    if (row === 0) return REVIEW_EXIT;
    const target = cursor - 1; // one row up, same column
    return occ(target) ? target : cursor;
  }
  if (dir === 'down') {
    if (row === 2) return cursor;
    const target = cursor + 1; // one row down, same column
    return occ(target) ? target : cursor;
  }
  if (dir === 'right') {
    if (col === 1) return cursor; // already right column
    const target = cursor + 3; // same row, right column
    return occ(target) ? target : cursor;
  }
  // left
  if (col === 0) return cursor; // already left column
  const target = cursor - 3; // same row, left column
  return occ(target) ? target : cursor;
}
