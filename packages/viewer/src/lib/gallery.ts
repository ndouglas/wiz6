import { RosterSchema, type Character, type Roster } from '@wiz6/data';
import { addCharacter } from './roster-store.js';

const GALLERY_URL = '/gallery/characters.json';

let cached: Roster | null = null;

/**
 * Load the curated gallery from `/gallery/characters.json`. The gallery is a
 * read-only Roster — visitors don't edit it, they import individual entries
 * into their private roster.
 *
 * Cached after first load. Validates against RosterSchema; throws on a
 * malformed gallery (engineering bug, not user-facing).
 */
export async function loadGallery(): Promise<Roster> {
  if (cached) return cached;
  const res = await fetch(GALLERY_URL);
  if (!res.ok) throw new Error(`gallery fetch failed: ${res.status}`);
  const json: unknown = await res.json();
  cached = RosterSchema.parse(json);
  return cached;
}

function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Tiny RFC-4122-ish fallback (jsdom and very old browsers).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Copy a gallery character into the visitor's roster under a NEW UUID.
 * Returns the new id (so callers can highlight / select the freshly-added
 * roster entry). The gallery character's name and stats are duplicated as-is.
 */
export async function importToRoster(galleryCharId: string): Promise<string> {
  const gallery = await loadGallery();
  const source = gallery.characters.find((c) => c.id === galleryCharId);
  if (!source) throw new Error(`gallery has no character with id ${galleryCharId}`);
  const fresh: Character = { ...source, id: newUuid() };
  addCharacter(fresh);
  return fresh.id;
}

/** True if `id` matches a character in the loaded gallery. */
export function isGalleryCharacter(id: string, gallery: Roster): boolean {
  return gallery.characters.some((c) => c.id === id);
}
