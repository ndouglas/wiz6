import { describe, it, expect } from 'vitest';
import { composePartyMemberPickerFrame } from '../../../src/pages/castle/compose-party-member-picker-frame.js';
import type { TileWindow } from '@wiz6/parser';
import type { ActivePartyMember } from '@wiz6/data';

const M = (name: string): ActivePartyMember => ({ name } as unknown as ActivePartyMember);
const members = [M('THESUS'), M('TEMPEST'), M('LYSANDR')];

// TileWindow.cells is a flat Uint8Array of interleaved [char, attr] pairs
// (cell i → cells[i*2]=char, cells[i*2+1]=attr). These helpers expose the
// per-cell char / attr the assertions below read.
function cellChar(win: TileWindow, x: number, y: number): string {
  return String.fromCharCode(win.cells[(y * win.widthCells + x) * 2]!);
}
function attrs(win: TileWindow): number[] {
  const out: number[] = [];
  for (let i = 1; i < win.cells.length; i += 2) out.push(win.cells[i]!);
  return out;
}
function cellAttr(win: TileWindow, x: number, y: number): number {
  return win.cells[(y * win.widthCells + x) * 2 + 1]!;
}

describe('composePartyMemberPickerFrame', () => {
  it('places members row-major: slot s at x=(s%2)*9+2, y=floor(s/2)+1', () => {
    const [, picker] = composePartyMemberPickerFrame({ title: 'REVIEW WHO?', members, cursor: -1 });
    expect(cellChar(picker, 2, 1)).toBe('T');  // THESUS slot 0 → col 2 row 1
    expect(cellChar(picker, 11, 1)).toBe('T'); // TEMPEST slot 1 → col 11 row 1
    expect(cellChar(picker, 2, 2)).toBe('L');  // LYSANDR slot 2 → col 2 row 2
  });

  it('cursor -1 highlights EXIT in the banner; no member highlighted', () => {
    const [banner, picker] = composePartyMemberPickerFrame({ title: 'REVIEW WHO?', members, cursor: -1 });
    expect(banner.invertHighlight).toBe(true);
    expect(attrs(banner).some((a) => a === 0x50)).toBe(true);  // EXIT highlighted
    expect(attrs(picker).some((a) => a === 0x50)).toBe(false); // no member highlighted
  });

  it('cursor on a member highlights that member; EXIT plain', () => {
    const [banner, picker] = composePartyMemberPickerFrame({ title: 'REVIEW WHO?', members, cursor: 2 });
    expect(picker.invertHighlight).toBe(true);
    expect(cellAttr(picker, 2, 2)).toBe(0x50);                // LYSANDR cell (2,2)
    expect(attrs(banner).some((a) => a === 0x50)).toBe(false); // EXIT plain
  });
});
