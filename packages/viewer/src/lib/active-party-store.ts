import {
  ActivePartySchema,
  type ActiveParty,
  type ActivePartyMember,
  type Character,
} from '@wiz6/data';
import { syncMemberToRoster } from './roster-store.js';

const KEY = 'wiz6:active-party';

function emptyParty(): ActiveParty {
  return { schemaVersion: 1, members: [] };
}

/** Read the active party from localStorage. Empty on first visit OR when
 *  stored data is corrupt (logs to console). */
export function readActiveParty(): ActiveParty {
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return emptyParty();
  try {
    return ActivePartySchema.parse(JSON.parse(raw));
  } catch (e) {
    console.warn('[active-party-store] data invalid, returning empty', e);
    return emptyParty();
  }
}

/** Replace the entire active party. */
export function writeActiveParty(p: ActiveParty): void {
  const validated = ActivePartySchema.parse(p);
  window.localStorage.setItem(KEY, JSON.stringify(validated));
}

/** Allocate the smallest unused portraitSlotId in 0..5. Mirrors engine FUN_0c2c. */
function allocatePortraitSlotId(members: ReadonlyArray<ActivePartyMember>): number {
  const used = new Set(members.map((m) => m.portraitSlotId));
  for (let id = 0; id <= 5; id++) {
    if (!used.has(id)) return id;
  }
  throw new Error('no free portraitSlotId — party should not exceed 6 members');
}

/** Add a roster character to the active party. Throws on full or duplicate. */
export function addMember(rosterChar: Character): void {
  const p = readActiveParty();
  if (p.members.length >= 6) throw new Error('active party is full');
  if (p.members.some((m) => m.id === rosterChar.id)) {
    throw new Error(`character ${rosterChar.id} already in active party`);
  }
  const portraitSlotId = allocatePortraitSlotId(p.members);
  const member: ActivePartyMember = {
    ...rosterChar,
    portraitSlotId,
    rosterCharacterId: rosterChar.id,
  };
  writeActiveParty({ ...p, members: [...p.members, member] });
}

/** Empty the active party. */
export function dismissAllMembers(): void {
  writeActiveParty(emptyParty());
}

/**
 * Dismiss the party member at `slotIndex` (0..members.length-1). Splices the
 * array and writes back. No-op if `slotIndex` is out of range.
 *
 * Engine reference: dismiss helper @ wbase.ovr 0x25cc. The engine marks the
 * PCFILE entry available + decrements party_size + rep-movsw shifts the
 * 0x1b0-byte character records down to fill the gap. In our model the roster
 * character stays untouched in `wiz6:roster`; we just splice the active-party
 * array. The dismissed member's `portraitSlotId` is implicitly freed —
 * `allocatePortraitSlotId` reclaims the smallest available id on the next
 * `addMember` call.
 *
 * Findings: docs/re/findings/wbase-party-pickers-and-dismiss.json
 * (dismiss-helper-memmove-math, dismiss-helper-no-equipment-or-spell-side-effects).
 */
export function dismissMember(slotIndex: number): void {
  const p = readActiveParty();
  if (slotIndex < 0 || slotIndex >= p.members.length) return;
  // Persist the member's current state (incl. any EDIT/equip changes) back to its
  // roster entry before removing it from the party — else those edits are lost.
  syncMemberToRoster(p.members[slotIndex]!);
  const next = [...p.members];
  next.splice(slotIndex, 1);
  writeActiveParty({ ...p, members: next });
}

/**
 * Patch a subset of fields on the active-party member at `slotIndex`.
 * No-op when out of range. Throws if the resulting record fails the
 * ActivePartySchema validation (e.g., empty name).
 *
 * Used by the WPCVW EDIT submenu sub-flows (rename, portrait change,
 * profession change) to write through to localStorage. The corresponding
 * roster character is NOT updated by this helper — that's tracked as
 * TODO #056 (active ↔ roster sync).
 */
export function updateActiveMember(
  slotIndex: number,
  patch: Partial<ActivePartyMember>,
): void {
  const p = readActiveParty();
  if (slotIndex < 0 || slotIndex >= p.members.length) return;
  const current = p.members[slotIndex]!;
  const next = [...p.members];
  const updated = { ...current, ...patch };
  next[slotIndex] = updated;
  writeActiveParty({ ...p, members: next });
  // Write the edit through to the linked roster entry immediately, mirroring the
  // engine's single-record model (the active party IS the PCFILE record).
  syncMemberToRoster(updated);
}

/** Filter a roster down to characters not currently in the active party. */
export function availableRosterFor(
  roster: ReadonlyArray<Character>,
  activeParty: ActiveParty,
): Character[] {
  const inParty = new Set(activeParty.members.map((m) => m.id));
  return roster.filter((c) => !inParty.has(c.id));
}
