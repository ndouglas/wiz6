import { describe, it, expect } from 'vitest';
import { DOOR_MENU } from '../../src/maze/door-menu.js';

describe('DOOR_MENU', () => {
  it('has FORCE/PICK/EXIT labels and the PARTY OPTIONS header', () => {
    expect(DOOR_MENU.labels).toEqual(['FORCE', 'PICK', 'EXIT']);
    expect(DOOR_MENU.header).toBe('PARTY OPTIONS');
    expect(DOOR_MENU.strip).toEqual({ x: 0, y: 144, w: 160, h: 40 });
  });
});
