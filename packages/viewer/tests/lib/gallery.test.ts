import { describe, expect, it, beforeEach, vi } from 'vitest';
import { loadGallery, importToRoster, isGalleryCharacter, getGalleryOriginIds, isFromGallery } from '../../src/lib/gallery.js';
import { readRoster } from '../../src/lib/roster-store.js';

const FAKE_GALLERY = {
  schemaVersion: 1,
  characters: [
    {
      id: '00000000-0000-4000-8000-000000000000',
      name: 'THESUS',
      race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 0,
      conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      dead: false, paralyzed: false,
      attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
      schoolMana: [0, 0, 0, 0, 0, 0],
      schoolManaMax: [0, 0, 0, 0, 0, 0],
      skills: new Array(30).fill(0),
      reaction: 50,
    },
    {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'TEMPEST',
      race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 0,
      conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      dead: false, paralyzed: false,
      attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
      schoolMana: [0, 0, 0, 0, 0, 0],
      schoolManaMax: [0, 0, 0, 0, 0, 0],
      skills: new Array(30).fill(0),
      reaction: 50,
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'LYSANDR',
      race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 0,
      conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      dead: false, paralyzed: false,
      attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
      schoolMana: [0, 0, 0, 0, 0, 0],
      schoolManaMax: [0, 0, 0, 0, 0, 0],
      skills: new Array(30).fill(0),
      reaction: 50,
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'NOBAL',
      race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 0,
      conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      dead: false, paralyzed: false,
      attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
      schoolMana: [0, 0, 0, 0, 0, 0],
      schoolManaMax: [0, 0, 0, 0, 0, 0],
      skills: new Array(30).fill(0),
      reaction: 50,
    },
    {
      id: '00000000-0000-4000-8000-000000000004',
      name: 'TREON',
      race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 0,
      conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      dead: false, paralyzed: false,
      attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
      schoolMana: [0, 0, 0, 0, 0, 0],
      schoolManaMax: [0, 0, 0, 0, 0, 0],
      skills: new Array(30).fill(0),
      reaction: 50,
    },
    {
      id: '00000000-0000-4000-8000-000000000005',
      name: 'PENTAG',
      race: 0, class: 0, level: 1, savedOldLevel: 0, xp: 0, gold: 0,
      conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      dead: false, paralyzed: false,
      attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
      schoolMana: [0, 0, 0, 0, 0, 0],
      schoolManaMax: [0, 0, 0, 0, 0, 0],
      skills: new Array(30).fill(0),
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
    expect(g.characters).toHaveLength(6);
    expect(g.characters[0]!.name).toBe('THESUS');
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
    expect(r.characters[0]!.name).toBe('THESUS');
  });

  it('importToRoster throws on unknown gallery id', async () => {
    await expect(importToRoster('00000000-0000-4000-8000-999999999999')).rejects.toThrow();
  });
});

describe('seedRosterIfEmpty', () => {
  it('imports every gallery character when the roster is empty', async () => {
    const { seedRosterIfEmpty } = await import('../../src/lib/gallery.js');
    await seedRosterIfEmpty();
    const r = readRoster();
    expect(r.characters).toHaveLength(6);
    expect(r.characters.map((c) => c.name)).toEqual([
      'THESUS', 'TEMPEST', 'LYSANDR', 'NOBAL', 'TREON', 'PENTAG',
    ]);
  });

  it('is a no-op when the roster already has characters', async () => {
    const { seedRosterIfEmpty } = await import('../../src/lib/gallery.js');
    const g = await loadGallery();
    await importToRoster(g.characters[0]!.id);
    const before = readRoster().characters.length;
    await seedRosterIfEmpty();
    const after = readRoster().characters.length;
    expect(after).toBe(before);
  });
});

describe('gallery-origin tracking', () => {
  it('importToRoster records the new roster id as gallery-originated', async () => {
    const g = await loadGallery();
    const newId = await importToRoster(g.characters[0]!.id);
    expect(getGalleryOriginIds()).toContain(newId);
    expect(isFromGallery(newId)).toBe(true);
    expect(isFromGallery('00000000-0000-4000-8000-999999999999')).toBe(false);
  });
});
