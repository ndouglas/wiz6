// packages/viewer/src/lib/presets-store.ts
import { PresetsFileSchema, PcFileJsonSchema, type Preset, type Character } from '@wiz6/data';
import { readRoster, writeRoster, PC_FILE_CAPACITY } from './roster-store.js';

const KEY = 'wiz6:presets';
const STOCK_ID = 'stock';
const STOCK_ASSET_URL = '/presets/stock.json';

let stockCharacters: Character[] = [];

/** Install the built-in Stock characters (loaded from /presets/stock.json at app start). */
export function setStockPreset(characters: Character[]): void {
  stockCharacters = characters;
}

/**
 * Fetch + install the built-in Stock preset from the served asset. Idempotent:
 * a no-op once Stock is populated. Safe to call from both the app shell (at
 * startup) and any page that needs Stock present — pages must call this and
 * then re-read, because `setStockPreset` resolves asynchronously and a page
 * that read `readPresets()` at mount would otherwise show Stock empty.
 */
export async function loadStockFromAsset(): Promise<void> {
  if (stockCharacters.length > 0) return;
  try {
    const res = await fetch(STOCK_ASSET_URL);
    if (!res.ok) throw new Error(`${STOCK_ASSET_URL} → HTTP ${res.status}`);
    const json = await res.json();
    setStockPreset(PcFileJsonSchema.parse(json).characters);
  } catch (e) {
    console.warn('[presets-store] stock preset load failed', e);
  }
}

function stockPreset(): Preset {
  return { schemaVersion: 1, id: STOCK_ID, name: 'Stock Characters', readOnly: true, characters: stockCharacters };
}

function readStored(): Preset[] {
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return [];
  try {
    return PresetsFileSchema.parse(JSON.parse(raw)).presets;
  } catch (e) {
    console.warn('[presets-store] data invalid, returning none', e);
    return [];
  }
}

function writeStored(presets: Preset[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(PresetsFileSchema.parse({ schemaVersion: 1, presets })));
}

/** All presets: built-in Stock first, then stored custom/imported. */
export function readPresets(): Preset[] {
  return [stockPreset(), ...readStored()];
}

/** Create + persist a new custom preset (id derived from name + index). */
export function addPreset(name: string, characters: Character[]): Preset {
  const stored = readStored();
  const id = `p-${Date.now().toString(36)}-${stored.length}`; // Date.now is fine at runtime (not a workflow script)
  const preset: Preset = { schemaVersion: 1, id, name, characters: characters.slice(0, 16) };
  writeStored([...stored, preset]);
  return preset;
}

export function deletePreset(id: string): void {
  if (id === STOCK_ID) throw new Error('the Stock preset is read-only and cannot be deleted');
  writeStored(readStored().filter((p) => p.id !== id));
}

/**
 * Remove one character (by id) from a custom preset. The built-in Stock preset
 * is read-only and cannot be edited. No-op if the preset or character is absent.
 */
export function removeCharacterFromPreset(presetId: string, characterId: string): void {
  if (presetId === STOCK_ID) throw new Error('the Stock preset is read-only and cannot be edited');
  const stored = readStored();
  const idx = stored.findIndex((p) => p.id === presetId);
  if (idx < 0) return;
  const preset = stored[idx]!;
  const next = [...stored];
  next[idx] = { ...preset, characters: preset.characters.filter((c) => c.id !== characterId) };
  writeStored(next);
}

export interface CopyResult { added: string[]; skippedDuplicate: string[]; skippedFull: string[]; }

/** Copy characters into the PC File: de-dupe by name (skip), respect the 16 cap.
 *  Fresh UUIDs are NOT minted here — callers pass characters with the desired id;
 *  the page mints a new id per copied character before calling. */
export function copyCharactersToPcFile(characters: Character[]): CopyResult {
  const roster = readRoster();
  const names = new Set(roster.characters.map((c) => c.name));
  const next = [...roster.characters];
  const res: CopyResult = { added: [], skippedDuplicate: [], skippedFull: [] };
  for (const c of characters) {
    if (names.has(c.name)) { res.skippedDuplicate.push(c.name); continue; }
    if (next.length >= PC_FILE_CAPACITY) { res.skippedFull.push(c.name); continue; }
    next.push(c); names.add(c.name); res.added.push(c.name);
  }
  writeRoster({ schemaVersion: 1, characters: next });
  return res;
}
