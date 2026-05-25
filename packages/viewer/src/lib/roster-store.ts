import { encodeRosterBase64, decodeRosterBase64 } from '@wiz6/parser';
import { RosterSchema, type Character, type Roster, type Save } from '@wiz6/data';

const KEY = 'wiz6:roster';

function emptyRoster(): Roster {
  return { schemaVersion: 1, characters: [] };
}

/** Read the roster from localStorage. Returns an empty roster on first
 *  visit OR when stored data is corrupt (warns to console). */
export function readRoster(): Roster {
  const b64 = window.localStorage.getItem(KEY);
  if (b64 === null) return emptyRoster();
  try {
    return decodeRosterBase64(b64);
  } catch (e) {
    console.warn('[roster-store] roster data invalid, returning empty', e);
    return emptyRoster();
  }
}

/** Replace the entire roster. */
export function writeRoster(roster: Roster): void {
  const validated = RosterSchema.parse(roster);
  window.localStorage.setItem(KEY, encodeRosterBase64(validated));
}

/** Append a character. Throws if `c.id` already exists in the roster. */
export function addCharacter(c: Character): void {
  const r = readRoster();
  if (r.characters.some((x) => x.id === c.id)) {
    throw new Error(`roster already contains character ${c.id}`);
  }
  writeRoster({ ...r, characters: [...r.characters, c] });
}

/** Remove the character with the given id. No-op if missing. */
export function removeCharacter(id: string): void {
  const r = readRoster();
  const next = r.characters.filter((c) => c.id !== id);
  if (next.length === r.characters.length) return;
  writeRoster({ ...r, characters: next });
}

/** Replace the character with the given id. No-op if missing. */
export function updateCharacter(c: Character): void {
  const r = readRoster();
  const idx = r.characters.findIndex((x) => x.id === c.id);
  if (idx < 0) return;
  const next = [...r.characters];
  next[idx] = c;
  writeRoster({ ...r, characters: next });
}

/**
 * Sync roster entries from a save's party members. For each member that
 * carries a `rosterCharacterId`, find the matching roster entry by id and
 * replace it with the member's snapshot (stripped of `rosterCharacterId`).
 * Members without a back-reference are ignored (they're one-off snapshots —
 * e.g. an imported save from another visitor).
 */
export function syncFromSave(save: Save): void {
  const r = readRoster();
  const next = [...r.characters];
  let changed = false;
  for (const member of save.party) {
    if (!member.rosterCharacterId) continue;
    const idx = next.findIndex((c) => c.id === member.rosterCharacterId);
    if (idx < 0) continue;
    const { rosterCharacterId, ...character } = member;
    void rosterCharacterId;
    next[idx] = { ...character, id: next[idx]!.id };
    changed = true;
  }
  if (changed) writeRoster({ ...r, characters: next });
}
