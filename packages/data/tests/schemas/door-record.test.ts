import { describe, it, expect } from 'vitest';
import { DoorRecordSchema } from '../../src/schemas/door-record.js';

describe('DoorRecordSchema', () => {
  it('accepts a closed door record', () => {
    const r = { gx: 128, gy: 131, facing: 1, lockStrength: 12, welded: false };
    expect(DoorRecordSchema.parse(r)).toEqual(r);
  });
  it('rejects lockStrength out of 0..31', () => {
    expect(() => DoorRecordSchema.parse({ gx: 0, gy: 0, facing: 0, lockStrength: 32, welded: false })).toThrow();
  });
});
