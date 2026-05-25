import { encodeSaveBase64, decodeSaveBase64 } from '@wiz6/parser';
import type { Save } from '@wiz6/data';

/** Number of save slots — matches the original Wiz6 (6 slots). */
export const NUM_SLOTS = 6;

const slotKey = (n: number): string => `wiz6:save:${n}`;

function assertSlotInRange(n: number): void {
  if (!Number.isInteger(n) || n < 0 || n >= NUM_SLOTS) {
    throw new Error(`save slot out of range: ${n} (valid 0..${NUM_SLOTS - 1})`);
  }
}

/**
 * Read a save from the given slot. Returns `null` if the slot is empty
 * or the stored data is corrupt (logged as a console.warn, not thrown,
 * so a single bad slot doesn't break the saves UI).
 */
export function readSlot(n: number): Save | null {
  assertSlotInRange(n);
  const b64 = window.localStorage.getItem(slotKey(n));
  if (b64 === null) return null;
  try {
    return decodeSaveBase64(b64);
  } catch (e) {
    console.warn(`[save-store] slot ${n} contained invalid data, returning null`, e);
    return null;
  }
}

/** Write `save` to the given slot. Overwrites any prior content. */
export function writeSlot(n: number, save: Save): void {
  assertSlotInRange(n);
  window.localStorage.setItem(slotKey(n), encodeSaveBase64(save));
}

/** Delete the given slot. No-op if it was already empty. */
export function deleteSlot(n: number): void {
  assertSlotInRange(n);
  window.localStorage.removeItem(slotKey(n));
}

/** List all slots as a parallel array (index = slot number). */
export function listSlots(): Array<Save | null> {
  return new Array(NUM_SLOTS).fill(null).map((_, i) => readSlot(i));
}
