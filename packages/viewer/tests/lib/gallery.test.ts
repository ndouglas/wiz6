import { describe, expect, it, beforeEach, vi } from 'vitest';
import { loadGallery, importToRoster, isGalleryCharacter } from '../../src/lib/gallery.js';
import { readRoster } from '../../src/lib/roster-store.js';

const FAKE_GALLERY = {
  schemaVersion: 1,
  characters: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Hawkwind',
      race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 100,
      conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      dead: false, paralyzed: false,
      attributes: { str: 14, int: 9, pie: 8, vit: 13, dex: 11, spd: 12, personality: 60, karma: 50 },
      schoolMana: [0, 0, 0, 0, 0, 0],
      skills: [10, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      reaction: 50,
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true,
    json: async () => FAKE_GALLERY,
  } as unknown as Response));
});

describe('gallery', () => {
  it('loadGallery returns the parsed gallery roster', async () => {
    const g = await loadGallery();
    expect(g.characters).toHaveLength(1);
    expect(g.characters[0]!.name).toBe('Hawkwind');
  });

  it('isGalleryCharacter returns true for IDs that came from the gallery', async () => {
    const g = await loadGallery();
    const galleryId = g.characters[0]!.id;
    expect(isGalleryCharacter(galleryId, g)).toBe(true);
    expect(isGalleryCharacter('22222222-2222-4222-8222-222222222222', g)).toBe(false);
  });

  it('importToRoster copies a gallery character into the roster with a NEW uuid', async () => {
    const g = await loadGallery();
    const sourceId = g.characters[0]!.id;
    const newId = await importToRoster(sourceId);
    expect(newId).not.toBe(sourceId);
    expect(newId).toMatch(/^[0-9a-f-]{36}$/);
    const r = readRoster();
    expect(r.characters).toHaveLength(1);
    expect(r.characters[0]!.id).toBe(newId);
    expect(r.characters[0]!.name).toBe('Hawkwind');
  });

  it('importToRoster throws on unknown gallery id', async () => {
    await expect(importToRoster('00000000-0000-4000-8000-999999999999')).rejects.toThrow();
  });
});
