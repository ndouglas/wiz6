import {
  ActivePartySchema,
  type ActiveParty,
  type ActivePartyMember,
  type Character,
} from '@wiz6/data';

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

/** Filter a roster down to characters not currently in the active party. */
export function availableRosterFor(
  roster: ReadonlyArray<Character>,
  activeParty: ActiveParty,
): Character[] {
  const inParty = new Set(activeParty.members.map((m) => m.id));
  return roster.filter((c) => !inParty.has(c.id));
}
