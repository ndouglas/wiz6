import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { WIZ6_MAIN } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import type { ActivePartyMember } from '@wiz6/data';
import { PartyMemberPicker } from '../../src/components/PartyMemberPicker.js';

const STUB_FONT_SET: FontSet = {
  font0: null, font1: null, font2: null, font3: null, font4: null,
};

function mockMember(name: string, slot: number): ActivePartyMember {
  return {
    id: `aaaaaaaa-aaaa-aaaa-aaaa-${slot.toString().padStart(12, '0')}`,
    name,
    race: 0, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
    portraitSlotId: slot,
    rosterCharacterId: `aaaaaaaa-aaaa-aaaa-aaaa-${slot.toString().padStart(12, '0')}`,
  };
}

describe('PartyMemberPicker', () => {
  it('Enter on the initial grid cursor (slot 0) commits with slotIndex=0', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <PartyMemberPicker
        title="REVIEW WHO?"
        members={[mockMember('NATHAN', 0), mockMember('GANDALF', 1)]}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        onCommit={onCommit}
        onCancel={onCancel}
        skipCanvas
      />,
    );
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(0);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('ArrowDown moves cursor from slot 0 to slot 2 (column-major: %2=0 means down to s+2)', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <PartyMemberPicker
        title="REVIEW WHO?"
        members={[
          mockMember('M0', 0), mockMember('M1', 1),
          mockMember('M2', 2), mockMember('M3', 3),
        ]}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        onCommit={onCommit}
        onCancel={onCancel}
        skipCanvas
      />,
    );
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith(2);
  });

  it('ArrowLeft on grid toggles to CANCEL; Enter then fires onCancel', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <PartyMemberPicker
        title="REVIEW WHO?"
        members={[mockMember('NATHAN', 0)]}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        onCommit={onCommit}
        onCancel={onCancel}
        skipCanvas
      />,
    );
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onCancel).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Escape always fires onCancel', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <PartyMemberPicker
        title="REVIEW WHO?"
        members={[mockMember('NATHAN', 0)]}
        fontSet={STUB_FONT_SET}
        palette={WIZ6_MAIN}
        onCommit={onCommit}
        onCancel={onCancel}
        skipCanvas
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
