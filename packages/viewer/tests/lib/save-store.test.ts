import { describe, expect, it, beforeEach } from 'vitest';
import {
  listSlots,
  readSlot,
  writeSlot,
  deleteSlot,
  NUM_SLOTS,
} from '../../src/lib/save-store.js';
import type { Save } from '@wiz6/data';

function makeSave(name = 'My adventure'): Save {
  return {
    schemaVersion: 1,
    metadata: { slotName: name, timestamp: '2026-05-25T12:00:00.000Z', portVersion: '0.0.0' },
    party: [],
    position: { zone: 0, level: 0, x: 0, y: 0, globalX: 0, globalY: 0, facing: 0 },
    scenarioFlags: {},
    mazeState: {},
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('save-store', () => {
  it('exposes NUM_SLOTS = 6', () => {
    expect(NUM_SLOTS).toBe(6);
  });

  it('listSlots returns 6 entries, all null when empty', () => {
    const slots = listSlots();
    expect(slots).toHaveLength(6);
    expect(slots.every((s) => s === null)).toBe(true);
  });

  it('writeSlot then readSlot round-trips the save', () => {
    const save = makeSave('alpha');
    writeSlot(0, save);
    const out = readSlot(0);
    expect(out).toEqual(save);
  });

  it('writeSlot updates listSlots summary', () => {
    writeSlot(2, makeSave('beta'));
    const slots = listSlots();
    expect(slots[0]).toBeNull();
    expect(slots[2]).not.toBeNull();
    expect(slots[2]!.metadata.slotName).toBe('beta');
  });

  it('deleteSlot removes the entry', () => {
    writeSlot(3, makeSave('gamma'));
    expect(readSlot(3)).not.toBeNull();
    deleteSlot(3);
    expect(readSlot(3)).toBeNull();
  });

  it('readSlot returns null for unset slot', () => {
    expect(readSlot(5)).toBeNull();
  });

  it('readSlot returns null and logs a warning on corrupt data', () => {
    window.localStorage.setItem('wiz6:save:1', 'not-base64-or-json!!!');
    expect(readSlot(1)).toBeNull();
  });

  it('writeSlot throws on out-of-range slot index', () => {
    expect(() => writeSlot(6, makeSave())).toThrow();
    expect(() => writeSlot(-1, makeSave())).toThrow();
  });
});
