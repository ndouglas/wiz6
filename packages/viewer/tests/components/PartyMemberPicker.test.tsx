import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { ActivePartyMember } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import { nextCursor, PartyMemberPicker } from '../../src/components/PartyMemberPicker.js';

const M = (name: string): ActivePartyMember => ({ name } as unknown as ActivePartyMember);
const members = [M('THESUS'), M('TEMPEST'), M('LYSANDR')];
const STUB_FONT_SET = {} as FontSet;

describe('PartyMemberPicker callbacks', () => {
  it('Enter on EXIT (cursor=-1) calls onCancel, not onCommit', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <PartyMemberPicker
        skipCanvas
        title="REVIEW WHO?"
        members={members}
        fontSet={STUB_FONT_SET}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('ArrowDown then Enter commits slot 0', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <PartyMemberPicker
        skipCanvas
        title="REVIEW WHO?"
        members={members}
        fontSet={STUB_FONT_SET}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(window, { key: 'ArrowDown' }); // -1 → 0
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(0);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Escape calls onCancel', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <PartyMemberPicker
        skipCanvas
        title="REVIEW WHO?"
        members={members}
        fontSet={STUB_FONT_SET}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('ArrowDown ArrowDown from EXIT lands on slot 2, Enter commits slot 2', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <PartyMemberPicker
        skipCanvas
        title="REVIEW WHO?"
        members={members}
        fontSet={STUB_FONT_SET}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(window, { key: 'ArrowDown' }); // -1 → 0
    fireEvent.keyDown(window, { key: 'ArrowDown' }); // 0 → 2
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(2);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('nextCursor (picker nav, cursor -1 = EXIT)', () => {
  it('Down from EXIT goes to slot 0', () => expect(nextCursor(-1, 'ArrowDown', 3)).toBe(0));
  it('Down from slot 0 goes to slot 2', () => expect(nextCursor(0, 'ArrowDown', 3)).toBe(2));
  it('Down from last member clamps', () => {
    expect(nextCursor(2, 'ArrowDown', 3)).toBe(2);
    expect(nextCursor(1, 'ArrowDown', 3)).toBe(1);
  });
  it('Up from top member row → EXIT', () => {
    expect(nextCursor(0, 'ArrowUp', 3)).toBe(-1);
    expect(nextCursor(1, 'ArrowUp', 3)).toBe(-1);
  });
  it('Up from lower row moves up a row', () => expect(nextCursor(2, 'ArrowUp', 3)).toBe(0));
  it('Right from even goes to odd neighbour if present', () => {
    expect(nextCursor(0, 'ArrowRight', 3)).toBe(1);
    expect(nextCursor(2, 'ArrowRight', 3)).toBe(2);
  });
  it('Left from odd goes to even neighbour', () => expect(nextCursor(1, 'ArrowLeft', 3)).toBe(0));
  it('Left/Right on EXIT and Right on odd are no-ops', () => {
    expect(nextCursor(-1, 'ArrowLeft', 3)).toBe(-1);
    expect(nextCursor(-1, 'ArrowRight', 3)).toBe(-1);
    expect(nextCursor(1, 'ArrowRight', 3)).toBe(1);
  });
});
