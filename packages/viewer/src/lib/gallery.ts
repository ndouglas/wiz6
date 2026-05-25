import { RosterSchema, type Character, type Roster } from '@wiz6/data';
import { addCharacter, readRoster } from './roster-store.js';

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

const ORIGINS_KEY = 'wiz6:gallery-origins';

function readOrigins(): string[] {
  try {
    const raw = window.localStorage.getItem(ORIGINS_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function writeOrigins(ids: string[]): void {
  window.localStorage.setItem(ORIGINS_KEY, JSON.stringify(ids));
}

export function getGalleryOriginIds(): string[] {
  return readOrigins();
}

export function isFromGallery(rosterCharacterId: string): boolean {
  return readOrigins().includes(rosterCharacterId);
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
  // Record that this new roster id originated in the gallery.
  const origins = readOrigins();
  if (!origins.includes(fresh.id)) {
    writeOrigins([...origins, fresh.id]);
  }
  return fresh.id;
}

/** True if `id` matches a character in the loaded gallery. */
export function isGalleryCharacter(id: string, gallery: Roster): boolean {
  return gallery.characters.some((c) => c.id === id);
}

/**
 * If the visitor's roster is empty, import every gallery character.
 * Safe to call on every page load — does nothing once the roster has
 * any content.
 */
export async function seedRosterIfEmpty(): Promise<void> {
  const r = readRoster();
  if (r.characters.length > 0) return;
  const gallery = await loadGallery();
  for (const c of gallery.characters) {
    await importToRoster(c.id);
  }
}
