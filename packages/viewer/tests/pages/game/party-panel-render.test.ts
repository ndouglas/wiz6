/**
 * composePartyPanel unit tests — verify the TS port of FUN_1b2d's layout
 * decisions against the lookup tables and formulas decoded in
 * docs/re/findings/wbase-party-panel-redraw.json.
 */

import { describe, it, expect } from 'vitest';
import { composePartyPanel } from '../../../src/pages/game/party-panel-render.js';
import type { ActivePartyMember } from '@wiz6/data';

function nathanFighter(overrides: Partial<ActivePartyMember> = {}): ActivePartyMember {
  // From engine save 1 inspect: portrait_index=9, class=0 (Fighter), race=9 (Human),
  // sex=0 (M), level=1, hp 7/7, sp 108/108, gold=0, conditions all zero.
  const base: ActivePartyMember = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'NATHAN',
    race: 9,
    class: 0,
    level: 1,
    savedOldLevel: 0,
    xp: 0,
    gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: { str: 16, int: 8, pie: 12, vit: 10, dex: 8, spd: 8, per: 10, kar: 18 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    reaction: 4,
    sex: 0,
    portraitSlotId: 0,
    rosterCharacterId: '00000000-0000-4000-8000-000000000001',
    portraitIndex: 9,
    hpCurrent: 7,
    hpMax: 7,
    staminaCurrent: 108,
    staminaMax: 108,
    age: 6925,
  };
  return { ...base, ...overrides };
}

describe('composePartyPanel', () => {
  it('slot 0 -> LEFT column, panel row 0', () => {
    const p = composePartyPanel(0, nathanFighter());
    expect(p.column).toBe('left');
    expect(p.panelRow).toBe(0);
  });

  it('slot 1 -> RIGHT column, panel row 0', () => {
    const p = composePartyPanel(1, nathanFighter());
    expect(p.column).toBe('right');
    expect(p.panelRow).toBe(0);
  });

  it('slot 2 -> LEFT column, panel row 4', () => {
    expect(composePartyPanel(2, nathanFighter()).panelRow).toBe(4);
  });

  it('slot 5 -> RIGHT column, panel row 8', () => {
    const p = composePartyPanel(5, nathanFighter());
    expect(p.column).toBe('right');
    expect(p.panelRow).toBe(8);
  });

  it('produces a name field', () => {
    expect(composePartyPanel(0, nathanFighter()).fields.name).toBe('NATHAN');
  });

  it('produces class symbol bytes (direct formula, not table)', () => {
    const p = composePartyPanel(0, nathanFighter());
    // class*2 + 0x3a + i for i in 0..1. class=0 -> bytes are 0x3a and 0x3b.
    expect(p.fields.classSymbol).toEqual([0x3a, 0x3b]);
  });

  it('class=3 produces classSymbol [0x40, 0x41]', () => {
    const p = composePartyPanel(0, nathanFighter({ class: 3 }));
    expect(p.fields.classSymbol).toEqual([0x40, 0x41]);
  });

  it('produces a 3x3 colored-bar grid (9 glyph codes)', () => {
    const p = composePartyPanel(0, nathanFighter());
    // Per finding `colored-bar-3x3`: cell at row iVar2, col iVar3 gets char
    // (iVar2*3 + 2 + iVar3) for iVar2 in [0,3), iVar3 in [0,3).
    expect(p.fields.coloredBar).toEqual([
      [2, 3, 4],
      [5, 6, 7],
      [8, 9, 10],
    ]);
  });

  it('dead override picks status icon 1 even when status_byte is 0', () => {
    // conditions[2] (the death/ash flag) non-zero forces icon=1 per
    // status-icon-table finding.
    const p = composePartyPanel(0, nathanFighter({ conditions: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0], dead: true }));
    expect(p.fields.statusIcon).toBe(1);
  });

  it('paralyzed override picks status icon 2 when icon < 2 and conditions[3] set', () => {
    const p = composePartyPanel(0, nathanFighter({ conditions: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0], paralyzed: true }));
    expect(p.fields.statusIcon).toBe(2);
  });

  it('healthy character has status icon 0 (table lookup at index 0)', () => {
    const p = composePartyPanel(0, nathanFighter());
    expect(p.fields.statusIcon).toBe(0);
  });
});
