# REVIEW MEMBER + DISMISS MEMBER Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire MASTER OPTIONS slots 1 (REVIEW MEMBER) and 2 (DISMISS MEMBER) into working features by porting the shared `pick_party_member` widget, the dismiss action, and a WPCVW state-0x11 character-view scaffold (EXIT-only, 11-action menu rendered but disabled).

**Architecture:** Three React pages (`DismissMemberPage`, `ReviewMemberPage`, `CharacterViewPage`) plus a shared `PartyMemberPicker` component. Pure composers in `packages/viewer/src/pages/castle/compose-*.ts` build the TileWindow grids. Store helper `dismissMember(slotIdx)` mutates `wiz6:active-party` mirroring engine `0x25cc`.

**Tech Stack:** TypeScript ESM, pnpm monorepo (`@wiz6/viewer`, `@wiz6/parser`, `@wiz6/data`), vitest, Playwright, React + react-router 6, TileWindow composers.

**Spec:** `docs/superpowers/specs/2026-05-29-review-dismiss-member-design.md`

---

## Pre-flight: read these for context

Before beginning, the implementer should read:

- `docs/superpowers/specs/2026-05-29-review-dismiss-member-design.md` — the spec this plan implements.
- `docs/re/findings/wbase-party-pickers-and-dismiss.json` — 23 RE findings covering the picker geometry, keymap, mouse remap, banner render, dismiss helper internals, and state-0x11 transition. Reference for every picker + dismiss task.
- `docs/re/findings/wpcvw-character-view-ux.json` — 37 RE findings covering the 3-window WPCVW layout, 11-action menu, sub-renderer call graph. Reference for every character-view task.
- `packages/viewer/src/pages/castle/AddPartyPage.tsx` + `compose-add-party-picker-frame.ts` — the existing wbase picker port. Structurally similar (single 2-window pattern) but uses a different two-panel layout. Read for pattern, not copy.
- `packages/viewer/src/lib/active-party-store.ts` — the store this work extends.

---

## Task 1: `dismissMember` helper in `active-party-store.ts`

**Files:**
- Modify: `packages/viewer/src/lib/active-party-store.ts`
- Test: `packages/viewer/tests/lib/active-party-store.test.ts` (create if absent — check first)

- [ ] **Step 1: Check whether the test file already exists**

```bash
cd /Users/nathan/Projects/ndouglas/wiz6
ls packages/viewer/tests/lib/active-party-store.test.ts 2>/dev/null || echo MISSING
```

- [ ] **Step 2: Write the failing test**

If the file does NOT exist, create `packages/viewer/tests/lib/active-party-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  readActiveParty,
  writeActiveParty,
  addMember,
  dismissMember,
} from '../../src/lib/active-party-store.js';
import type { Character } from '@wiz6/data';

const ID_A = '550e8400-e29b-41d4-a716-446655440000';
const ID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function makeCharacter(id: string, name: string, level = 1): Character {
  return {
    id, name, race: 0, class: 0, sex: 0, level, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('dismissMember', () => {
  it('removes the member at the given slot index', () => {
    addMember(makeCharacter(ID_A, 'NATHAN'));
    addMember(makeCharacter(ID_B, 'GANDALF'));
    expect(readActiveParty().members).toHaveLength(2);
    dismissMember(0);
    const after = readActiveParty();
    expect(after.members).toHaveLength(1);
    expect(after.members[0]!.name).toBe('GANDALF');
  });

  it('preserves remaining members after dismiss in original relative order', () => {
    addMember(makeCharacter(ID_A, 'NATHAN'));
    addMember(makeCharacter(ID_B, 'GANDALF'));
    dismissMember(1); // dismiss GANDALF, NATHAN should remain
    const after = readActiveParty();
    expect(after.members).toHaveLength(1);
    expect(after.members[0]!.name).toBe('NATHAN');
  });

  it('is a no-op on out-of-range slotIndex (negative)', () => {
    addMember(makeCharacter(ID_A, 'NATHAN'));
    dismissMember(-1);
    expect(readActiveParty().members).toHaveLength(1);
  });

  it('is a no-op on out-of-range slotIndex (>= length)', () => {
    addMember(makeCharacter(ID_A, 'NATHAN'));
    dismissMember(5);
    expect(readActiveParty().members).toHaveLength(1);
  });

  it('frees the dismissed portraitSlotId for re-allocation on next add', () => {
    addMember(makeCharacter(ID_A, 'NATHAN'));   // gets portraitSlotId 0
    addMember(makeCharacter(ID_B, 'GANDALF'));  // gets portraitSlotId 1
    dismissMember(0); // dismiss NATHAN, portraitSlotId 0 freed
    addMember(makeCharacter('11111111-1111-1111-1111-111111111111', 'TREON'));
    const after = readActiveParty();
    // TREON should pick up portraitSlotId 0 (smallest free).
    const treon = after.members.find((m) => m.name === 'TREON')!;
    expect(treon.portraitSlotId).toBe(0);
  });
});
```

If the file DOES exist, append the `describe('dismissMember', ...)` block and add `dismissMember` to the existing imports.

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/nathan/Projects/ndouglas/wiz6
pnpm --filter @wiz6/viewer vitest run tests/lib/active-party-store.test.ts
```

Expected: FAIL — `dismissMember` is not exported from `active-party-store.ts`.

- [ ] **Step 4: Add `dismissMember` to `active-party-store.ts`**

Append to `packages/viewer/src/lib/active-party-store.ts` (after `dismissAllMembers`):

```ts
/**
 * Dismiss the party member at `slotIndex` (0..members.length-1). Splices the
 * array and writes back. No-op if `slotIndex` is out of range.
 *
 * Engine reference: dismiss helper @ wbase.ovr 0x25cc. The engine marks the
 * PCFILE entry available + decrements party_size + rep-movsw shifts the
 * 0x1b0-byte character records down to fill the gap. In our model the roster
 * character stays untouched in `wiz6:roster`; we just splice the active-party
 * array. The dismissed member's `portraitSlotId` is implicitly freed —
 * `allocatePortraitSlotId` reclaims the smallest available id on the next
 * `addMember` call.
 *
 * Findings: docs/re/findings/wbase-party-pickers-and-dismiss.json
 * (dismiss-helper-memmove-math, dismiss-helper-no-equipment-or-spell-side-effects).
 */
export function dismissMember(slotIndex: number): void {
  const p = readActiveParty();
  if (slotIndex < 0 || slotIndex >= p.members.length) return;
  const next = [...p.members];
  next.splice(slotIndex, 1);
  writeActiveParty({ ...p, members: next });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @wiz6/viewer vitest run tests/lib/active-party-store.test.ts
```

Expected: PASS — all 5 cases green.

- [ ] **Step 6: Run the full viewer suite for no regressions**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/viewer/src/lib/active-party-store.ts \
        packages/viewer/tests/lib/active-party-store.test.ts
git commit -m "feat(viewer): dismissMember helper for active-party store"
```

---

## Task 2: `compose-party-member-picker-frame.ts` pure composer

**Files:**
- Create: `packages/viewer/src/pages/castle/compose-party-member-picker-frame.ts`
- Test: `packages/viewer/tests/pages/castle/compose-party-member-picker-frame.test.ts`

**Engine geometry** (from findings):

- Single picker window: `ui_window_create(x=0, y=19, w=19, h=5, attr=0x19, chrome=0xfffc=-4, flags=0, do_refresh=0)`
- Grid is 2 cols × 3 rows (max 6 members): cell (s%2, s/2+1) where s = slot index, x = (s%2)*9+2, y = s/2 + 1
- Window cleared to (char=0x20, attr=0x03) at entry.
- Highlighted name uses style 0xfffb (the inverse-highlight path); rendered name byte is `dfb9(window, slot*0x1b0 + 0x43e8, 3)` — which means "render the character's name (record offset +0) with style 3 = name-string".
- Banner title at `*0x3342` (40×1 window at y=18). The engine reuses a persistent banner strip; we approximate by emitting our own banner TileWindow from this composer (simpler than tracking a separate persistent strip across pages).
- Cancel state: when cursor is "on cancel" (banner highlighted), the picker shows the title at attr 0x50 instead of attr 0x03; in our component this is `view.onCancel === true`.

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/castle/compose-party-member-picker-frame.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { composePartyMemberPickerFrame } from '../../../src/pages/castle/compose-party-member-picker-frame.js';
import type { ActivePartyMember } from '@wiz6/data';

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

function cellsAsString(win: { cells: Uint8Array; widthCells: number; heightCells: number }): string {
  let s = '';
  for (let y = 0; y < win.heightCells; y++) {
    for (let x = 0; x < win.widthCells; x++) {
      const charByte = win.cells[(y * win.widthCells + x) * 2]!;
      s += String.fromCharCode(charByte);
    }
    s += '\n';
  }
  return s;
}

describe('composePartyMemberPickerFrame', () => {
  it('returns one or more TileWindows', () => {
    const members = [mockMember('NATHAN', 0), mockMember('GANDALF', 1)];
    const windows = composePartyMemberPickerFrame({
      title: 'REVIEW WHO?',
      members,
      cursorIdx: 0,
      onCancel: false,
    });
    expect(windows.length).toBeGreaterThan(0);
  });

  it('places member name NATHAN at grid (col 2, row 1) in the picker window', () => {
    const members = [mockMember('NATHAN', 0), mockMember('GANDALF', 1)];
    const windows = composePartyMemberPickerFrame({
      title: 'REVIEW WHO?',
      members,
      cursorIdx: 0,
      onCancel: false,
    });
    const pickerWin = windows.find((w) => w.widthCells === 19 && w.heightCells === 5);
    expect(pickerWin).toBeDefined();
    const text = cellsAsString(pickerWin!);
    // Row 1 of the picker window: NATHAN should start at col 2.
    const row1 = text.split('\n')[1]!;
    expect(row1.slice(2, 8)).toBe('NATHAN');
  });

  it('places GANDALF (slot 1) at grid (col 11, row 1)', () => {
    const members = [mockMember('NATHAN', 0), mockMember('GANDALF', 1)];
    const windows = composePartyMemberPickerFrame({
      title: 'REVIEW WHO?',
      members,
      cursorIdx: 0,
      onCancel: false,
    });
    const pickerWin = windows.find((w) => w.widthCells === 19 && w.heightCells === 5);
    const text = cellsAsString(pickerWin!);
    const row1 = text.split('\n')[1]!;
    expect(row1.slice(11, 18)).toBe('GANDALF');
  });

  it('renders the banner title text somewhere in the windows', () => {
    const members = [mockMember('NATHAN', 0)];
    const windows = composePartyMemberPickerFrame({
      title: 'DISMISS WHO?',
      members,
      cursorIdx: 0,
      onCancel: false,
    });
    const allText = windows.map(cellsAsString).join('\n');
    expect(allText).toContain('DISMISS WHO?');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer vitest run tests/pages/castle/compose-party-member-picker-frame.test.ts
```

Expected: FAIL — file does not exist.

- [ ] **Step 3: Create the composer**

Create `packages/viewer/src/pages/castle/compose-party-member-picker-frame.ts`:

```ts
/**
 * composePartyMemberPickerFrame — pure cell-grid composer for the wbase
 * pick_party_member widget (used by REVIEW MEMBER and DISMISS MEMBER).
 *
 * Engine reference: docs/re/findings/wbase-party-pickers-and-dismiss.json
 * findings picker-grid-layout-and-coordinate-math, picker-window-chrome-and-attr-style,
 * picker-title-banner-render, picker-highlight-render-on-current-cursor.
 *
 * Geometry:
 *   - Picker window: 19w × 5h at screen (x=0, y=19*8=152). Attr 0x19. Cleared
 *     to (char=0x20, attr=0x03) on entry.
 *   - Member grid: 2 cols × 3 rows. Slot s ∈ [0..5] renders at
 *     cell_x = (s%2)*9 + 2; cell_y = s/2 + 1.
 *   - Highlight: cursor's member name at attr 0x50; others at attr 0x03.
 *   - Banner: a separate 40w × 1h window at screen (x=0, y=18*8=144). The
 *     title string is centered (left-truncated to fit). When `onCancel`,
 *     the banner title renders at attr 0x50 (highlighted); otherwise 0x03.
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { ActivePartyMember } from '@wiz6/data';

const CELL_PX = 8;

const PICKER_W = 19;
const PICKER_H = 5;
const PICKER_SCREEN_X = 0;
const PICKER_SCREEN_Y = 19 * CELL_PX; // 152

const BANNER_W = 40;
const BANNER_H = 1;
const BANNER_SCREEN_X = 0;
const BANNER_SCREEN_Y = 18 * CELL_PX; // 144

const NAME_WIDTH = 7;
const ATTR_BG = 0x03;
const ATTR_HIGHLIGHT = 0x50;

export interface PartyMemberPickerView {
  /** Resolved title string (e.g. "REVIEW WHO?"). Already looked up from MessageDb. */
  title: string;
  members: ReadonlyArray<ActivePartyMember>;
  /** 0..members.length-1. Ignored when `onCancel === true`. */
  cursorIdx: number;
  /** When true, the cursor is on the BANNER (cancel) row — banner highlights, grid rows are plain. */
  onCancel: boolean;
}

export function composePartyMemberPickerFrame(view: PartyMemberPickerView): TileWindow[] {
  return [composeBanner(view), composePicker(view)];
}

function composeBanner(view: PartyMemberPickerView): TileWindow {
  const w = createTileWindow({
    screenX: BANNER_SCREEN_X,
    screenY: BANNER_SCREEN_Y,
    widthCells: BANNER_W,
    heightCells: BANNER_H,
  });
  clearWindow(w, 0x20, ATTR_BG);
  const text = view.title.slice(0, BANNER_W);
  const col = Math.max(0, Math.floor((BANNER_W - text.length) / 2));
  setCursor(w, col, 0);
  puts(w, text, view.onCancel ? ATTR_HIGHLIGHT : ATTR_BG);
  return w;
}

function composePicker(view: PartyMemberPickerView): TileWindow {
  const w = createTileWindow({
    screenX: PICKER_SCREEN_X,
    screenY: PICKER_SCREEN_Y,
    widthCells: PICKER_W,
    heightCells: PICKER_H,
  });
  clearWindow(w, 0x20, ATTR_BG);

  for (let s = 0; s < view.members.length; s++) {
    const cellX = (s % 2) * 9 + 2;
    const cellY = Math.floor(s / 2) + 1;
    const member = view.members[s]!;
    const name = member.name.slice(0, NAME_WIDTH);
    const isHighlighted = !view.onCancel && s === view.cursorIdx;
    setCursor(w, cellX, cellY);
    puts(w, name, isHighlighted ? ATTR_HIGHLIGHT : ATTR_BG);
  }

  return w;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @wiz6/viewer vitest run tests/pages/castle/compose-party-member-picker-frame.test.ts
```

Expected: PASS — all 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/castle/compose-party-member-picker-frame.ts \
        packages/viewer/tests/pages/castle/compose-party-member-picker-frame.test.ts
git commit -m "feat(castle): pure composer for shared pick_party_member widget"
```

---

## Task 3: `PartyMemberPicker` React component

**Files:**
- Create: `packages/viewer/src/components/PartyMemberPicker.tsx`
- Test: `packages/viewer/tests/components/PartyMemberPicker.test.tsx`

**Engine keymap** (from finding `picker-input-loop-keymap`):
- ArrowLeft (key 1) → toggle to CANCEL state (banner highlighted)
- ArrowUp (key 2) → from CANCEL → return cursor to grid (slot 0); else cursor up (clamp 0)
- ArrowRight (key 3) → from CANCEL → return cursor to grid (slot 0); else cursor right within row
- ArrowDown (key 4) → from CANCEL → return cursor to grid (slot 0); else cursor down (clamp last)
- Enter (key 5) → commit (onCommit if on grid; onCancel if on CANCEL)
- Escape → onCancel (port adds this for ergonomics; engine ignores)

**Single-member shortcut**: when `members.length < 2`, the picker is bypassed entirely. The page-level wrapper handles this (Tasks 4 + 10).

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/components/PartyMemberPicker.test.tsx`:

```tsx
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
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer vitest run tests/components/PartyMemberPicker.test.tsx
```

Expected: FAIL — component does not exist.

- [ ] **Step 3: Create the component**

Create `packages/viewer/src/components/PartyMemberPicker.tsx`:

```tsx
/**
 * PartyMemberPicker — shared picker for the active party. Used by
 * DismissMemberPage and ReviewMemberPage. Mirrors wbase_pick_party_member
 * @ wbase.ovr 0x26c7.
 *
 * Engine refs: docs/re/findings/wbase-party-pickers-and-dismiss.json
 * findings picker-input-loop-keymap, picker-grid-layout-and-coordinate-math,
 * picker-highlight-render-on-current-cursor.
 *
 * Single-member shortcut (engine `party_size < 2` bypass) is NOT handled
 * here — the caller (page) checks `members.length < 2` and bypasses the
 * picker before mounting. This component assumes >= 1 member.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivePartyMember, Palette } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import { renderTileWindow } from '@wiz6/parser';
import { CanvasPresenter } from '../lib/presenter.js';
import {
  composePartyMemberPickerFrame,
  type PartyMemberPickerView,
} from '../pages/castle/compose-party-member-picker-frame.js';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

export interface PartyMemberPickerProps {
  title: string;
  members: ReadonlyArray<ActivePartyMember>;
  fontSet: FontSet;
  palette: Palette;
  onCommit: (slotIndex: number) => void;
  onCancel: () => void;
  /** TEST ONLY: skip canvas mount. */
  skipCanvas?: boolean;
}

export function PartyMemberPicker({
  title,
  members,
  fontSet,
  palette,
  onCommit,
  onCancel,
  skipCanvas = false,
}: PartyMemberPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cursorIdx, setCursorIdx] = useState(0);
  const [onCancelState, setOnCancelState] = useState(false);

  // Move cursor within 2-column × 3-row grid.
  const moveCursor = useCallback(
    (dx: number, dy: number) => {
      setCursorIdx((cur) => {
        const col = cur % 2;
        const row = Math.floor(cur / 2);
        const newCol = Math.max(0, Math.min(1, col + dx));
        const newRow = Math.max(0, Math.min(2, row + dy));
        const candidate = newRow * 2 + newCol;
        return candidate < members.length ? candidate : cur;
      });
    },
    [members.length],
  );

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          if (onCancelState) {
            // Already on cancel — left stays on cancel (engine no-op).
            return;
          }
          // From grid: left when at col 0 goes to CANCEL; otherwise moves left within row.
          if (cursorIdx % 2 === 0) {
            setOnCancelState(true);
          } else {
            moveCursor(-1, 0);
          }
          break;
        case 'ArrowRight':
          if (onCancelState) {
            setOnCancelState(false);
            setCursorIdx(0);
          } else {
            moveCursor(1, 0);
          }
          break;
        case 'ArrowUp':
          if (onCancelState) {
            setOnCancelState(false);
            setCursorIdx(0);
          } else {
            moveCursor(0, -1);
          }
          break;
        case 'ArrowDown':
          if (onCancelState) {
            setOnCancelState(false);
            setCursorIdx(0);
          } else {
            moveCursor(0, 1);
          }
          break;
        case 'Enter':
          if (onCancelState) {
            onCancel();
          } else {
            onCommit(cursorIdx);
          }
          break;
        case 'Escape':
          onCancel();
          break;
      }
    },
    [cursorIdx, onCancelState, members.length, onCommit, onCancel, moveCursor],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  useEffect(() => {
    if (skipCanvas) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const presenter = new CanvasPresenter(canvas);
    const view: PartyMemberPickerView = {
      title,
      members,
      cursorIdx,
      onCancel: onCancelState,
    };
    const windows = composePartyMemberPickerFrame(view);
    const buf = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
    buf.fill(0);
    for (const w of windows) {
      renderTileWindow(w, buf, ENGINE_W, ENGINE_H, fontSet, palette);
    }
    presenter.present(buf, ENGINE_W, ENGINE_H);
  }, [skipCanvas, title, members, cursorIdx, onCancelState, fontSet, palette]);

  if (skipCanvas) return <div data-testid="party-member-picker-stub" />;
  return (
    <canvas
      ref={canvasRef}
      width={ENGINE_W}
      height={ENGINE_H}
      style={{
        width: ENGINE_W * SCALE,
        height: ENGINE_H * SCALE,
        imageRendering: 'pixelated',
        background: '#000',
      }}
      aria-label="Pick a party member"
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @wiz6/viewer vitest run tests/components/PartyMemberPicker.test.tsx
```

Expected: PASS — all 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/components/PartyMemberPicker.tsx \
        packages/viewer/tests/components/PartyMemberPicker.test.tsx
git commit -m "feat(viewer): PartyMemberPicker React component (shared by REVIEW + DISMISS)"
```

---

## Task 4: `DismissMemberPage` + route + e2e

**Files:**
- Create: `packages/viewer/src/pages/castle/DismissMemberPage.tsx`
- Modify: `packages/viewer/src/router.tsx`
- Modify: `packages/viewer/src/pages/game/CastleStub.tsx` (remove `dismiss-member` entry)
- Test: `packages/viewer/e2e/dismiss-member-flow.spec.ts` (e2e)

The page mounts the `PartyMemberPicker`, resolves `msg 0x4b3` for the title, handles the single-member bypass, and on commit calls `dismissMember(slotIdx)` then navigates back.

- [ ] **Step 1: Create the page**

Create `packages/viewer/src/pages/castle/DismissMemberPage.tsx`:

```tsx
/**
 * DismissMemberPage — wbase MASTER OPTIONS slot 2 (DISMISS MEMBER).
 *
 * Mounts the shared PartyMemberPicker with title from msg 0x4b3
 * ("DISMISS WHO?"). On commit: dismissMember(slotIdx) + back to /castle.
 * On cancel: back to /castle, no state change.
 *
 * Single-member shortcut: if members.length === 1, the engine bypasses the
 * picker entirely. We mirror this: immediately dismiss slot 0 and navigate.
 *
 * Empty party: bounce to /castle (shouldn't happen normally — slot 2 is
 * hidden by the visibility predicate when partySize < 1).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WIZ6_MAIN, type MessageDb, type PortraitSet } from '@wiz6/data';
import { loadMessageDb as defaultLoadMessageDb, loadPortraitSet } from '../../data-loader.js';
import { loadCreationFontSet } from '../roster/creation/ega/assets.js';
import type { FontSet } from '@wiz6/parser';
import { dismissMember, readActiveParty } from '../../lib/active-party-store.js';
import { creationString } from '../roster/creation/messages.js';
import { PartyMemberPicker } from '../../components/PartyMemberPicker.js';

const DISMISS_WHO_MSG_ID = 0x4b3;

export function DismissMemberPage() {
  const navigate = useNavigate();
  const members = useMemo(() => readActiveParty().members, []);
  const [fontSet, setFontSet] = useState<FontSet | null>(null);
  const [db, setDb] = useState<MessageDb | null>(null);
  const [_portraits, setPortraits] = useState<PortraitSet[]>([]);

  useEffect(() => {
    if (members.length === 0) {
      navigate('/castle');
      return;
    }
    if (members.length === 1) {
      dismissMember(0);
      navigate('/castle');
    }
  }, [members.length, navigate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [fs, m, p] = await Promise.all([
          loadCreationFontSet(),
          defaultLoadMessageDb('/messages/msg.json'),
          loadPortraitSet('/portraits/wport1.json').catch(() => null),
        ]);
        if (cancelled) return;
        setFontSet(fs);
        setDb(m);
        if (p) setPortraits([p]);
      } catch (err: unknown) {
        if (!cancelled) console.error('[DismissMemberPage] asset load failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (members.length < 2) return null; // bounce in effect above
  if (!fontSet || !db) return <div>Loading…</div>;

  const title = creationString(db, DISMISS_WHO_MSG_ID);
  return (
    <PartyMemberPicker
      title={title}
      members={members}
      fontSet={fontSet}
      palette={WIZ6_MAIN}
      onCommit={(slotIdx) => {
        dismissMember(slotIdx);
        navigate('/castle');
      }}
      onCancel={() => navigate('/castle')}
    />
  );
}
```

- [ ] **Step 2: Wire the route**

Edit `packages/viewer/src/router.tsx`. Add the lazy import alongside the existing castle imports:

```tsx
const DismissMemberPage = lazy(() =>
  import('./pages/castle/DismissMemberPage.js').then((m) => ({ default: m.DismissMemberPage })),
);
```

Add the route before the catch-all `/castle/:stub` route:

```tsx
<Route path="/castle/dismiss-member" element={<DismissMemberPage />} />
```

The full block of castle routes should now look like:

```tsx
<Route path="/castle" element={<CastleScreen />} />
<Route path="/castle/character-menu" element={<CreationPage />} />
<Route path="/castle/add-party" element={<AddPartyPage />} />
<Route path="/castle/dismiss-member" element={<DismissMemberPage />} />
<Route path="/castle/:stub" element={<CastleStub />} />
```

- [ ] **Step 3: Remove `dismiss-member` from CastleStub**

In `packages/viewer/src/pages/game/CastleStub.tsx`, remove the `'dismiss-member'` entry from `STUB_INFO`. The block should drop these lines:

```ts
  'dismiss-member': {
    title: 'Dismiss Member',
    description:
      'Pick a party member to send back to PCFILE.DBS. The character stays in your roster; only the active-party slot is freed.',
  },
```

- [ ] **Step 4: Write the e2e test**

Create `packages/viewer/e2e/dismiss-member-flow.spec.ts`:

```ts
/**
 * dismiss-member-flow.spec.ts — verifies the DISMISS MEMBER flow end-to-end.
 *
 * Seed the roster with two characters + active party with both. Navigate
 * to /castle, select DISMISS MEMBER, pick the first member, return to
 * castle. Verify localStorage active party went from 2 → 1 members.
 */

import { test, expect } from '@playwright/test';

const ID_A = '550e8400-e29b-41d4-a716-446655440000';
const ID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function makeChar(id: string, name: string) {
  return {
    id, name, race: 0, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
  };
}

test('DISMISS MEMBER picker drops a party member from the active party', async ({ page }) => {
  const nathan = makeChar(ID_A, 'NATHAN');
  const gandalf = makeChar(ID_B, 'GANDALF');
  const nathanInParty = { ...nathan, portraitSlotId: 0, rosterCharacterId: nathan.id };
  const gandalfInParty = { ...gandalf, portraitSlotId: 1, rosterCharacterId: gandalf.id };

  await page.goto('/');
  await page.evaluate(
    async ({ chars, members }) => {
      const json = JSON.stringify({ schemaVersion: 1, characters: chars });
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      void writer.write(new TextEncoder().encode(json));
      void writer.close();
      const gz = new Uint8Array(await new Response(cs.readable).arrayBuffer());
      let s = '';
      for (let i = 0; i < gz.length; i++) s += String.fromCharCode(gz[i]!);
      window.localStorage.setItem('wiz6:roster', btoa(s));
      window.localStorage.setItem(
        'wiz6:active-party',
        JSON.stringify({ schemaVersion: 1, members }),
      );
    },
    { chars: [nathan, gandalf], members: [nathanInParty, gandalfInParty] },
  );

  await page.goto('/castle');
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(500);

  // CastleScreen visible slots when party has 2 members (1+ unloaded chars):
  //   [0 ADD, 1 REVIEW, 2 DISMISS, ...]
  // Cursor starts on slot 0 (ADD). Move down twice to reach DISMISS, then Enter.
  await page.keyboard.press('ArrowDown'); // → REVIEW
  await page.keyboard.press('ArrowDown'); // → DISMISS
  await page.keyboard.press('Enter');

  await page.waitForURL('**/castle/dismiss-member', { timeout: 5_000 });
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(500);

  // Picker cursor starts at slot 0. Press Enter to dismiss NATHAN.
  await page.keyboard.press('Enter');
  await page.waitForURL('**/castle', { timeout: 5_000 });
  await page.waitForTimeout(300);

  const partyJson = await page.evaluate(() => window.localStorage.getItem('wiz6:active-party'));
  expect(partyJson).not.toBeNull();
  const party = JSON.parse(partyJson!);
  expect(party.members).toHaveLength(1);
  expect(party.members[0].name).toBe('GANDALF');
});
```

- [ ] **Step 5: Run the unit tests + e2e**

```bash
pnpm --filter @wiz6/viewer test
```

Expected: PASS.

```bash
cd packages/viewer && pnpm test:e2e dismiss-member-flow 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/nathan/Projects/ndouglas/wiz6
git add packages/viewer/src/pages/castle/DismissMemberPage.tsx \
        packages/viewer/src/router.tsx \
        packages/viewer/src/pages/game/CastleStub.tsx \
        packages/viewer/e2e/dismiss-member-flow.spec.ts
git commit -m "feat(castle): DISMISS MEMBER end-to-end (page + route + e2e)"
```

---

## Task 5: Stats panel sub-composer

**Files:**
- Create: `packages/viewer/src/pages/castle/compose-stats-panel.ts`
- Test: `packages/viewer/tests/pages/castle/compose-stats-panel.test.ts`

The stats panel is the right-side 20×16 window at (x=20, y=4) attr 0x1a, rendered per the WPCVW finding. For the scaffold, render the essentials: character name + race + class + sex + AC + HP/SP + 8 attribute scores. Exact glyph positions per the engine are deferred to Phase B (pixel-parity pass) — see TODO.md.

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/castle/compose-stats-panel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { composeStatsPanel } from '../../../src/pages/castle/compose-stats-panel.js';
import type { ActivePartyMember, MessageDb } from '@wiz6/data';

function fakeDb(messages: Record<number, string>): MessageDb {
  return {
    indexedMessages: Object.entries(messages).map(([id, decodedText]) => ({
      id: Number(id),
      decodedText,
    })),
  } as unknown as MessageDb;
}

function mockMember(name: string): ActivePartyMember {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name,
    race: 0, class: 0, sex: 0, level: 5, xp: 100, gold: 50,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 13, pie: 14, vit: 15, dex: 16, spd: 17, per: 18, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
    portraitSlotId: 0,
    rosterCharacterId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  };
}

function cellsAsString(win: { cells: Uint8Array; widthCells: number; heightCells: number }): string {
  let s = '';
  for (let y = 0; y < win.heightCells; y++) {
    for (let x = 0; x < win.widthCells; x++) {
      const charByte = win.cells[(y * win.widthCells + x) * 2]!;
      s += String.fromCharCode(charByte);
    }
    s += '\n';
  }
  return s;
}

describe('composeStatsPanel', () => {
  it('returns a 20×16 TileWindow at screen (160, 32)', () => {
    const db = fakeDb({ 0x64: 'HUMAN', 0x78: 'FIGHTER', 0x8c: 'MALE' });
    const win = composeStatsPanel(mockMember('NATHAN'), db);
    expect(win.widthCells).toBe(20);
    expect(win.heightCells).toBe(16);
    expect(win.screenX).toBe(160);
    expect(win.screenY).toBe(32);
  });

  it('renders the character name in the panel', () => {
    const db = fakeDb({ 0x64: 'HUMAN', 0x78: 'FIGHTER', 0x8c: 'MALE' });
    const win = composeStatsPanel(mockMember('NATHAN'), db);
    expect(cellsAsString(win)).toContain('NATHAN');
  });

  it('renders attribute values STR=12 INT=13 etc.', () => {
    const db = fakeDb({ 0x64: 'HUMAN', 0x78: 'FIGHTER', 0x8c: 'MALE' });
    const win = composeStatsPanel(mockMember('NATHAN'), db);
    const text = cellsAsString(win);
    expect(text).toContain('12');
    expect(text).toContain('13');
    expect(text).toContain('18');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer vitest run tests/pages/castle/compose-stats-panel.test.ts
```

Expected: FAIL — file does not exist.

- [ ] **Step 3: Create the composer**

Create `packages/viewer/src/pages/castle/compose-stats-panel.ts`:

```ts
/**
 * composeStatsPanel — WPCVW right-side stats panel (20×16 @ x=20, y=4).
 *
 * Engine reference: ui_render_character_stats_panel @ wpcvw 0xf47 (per
 * docs/re/findings/wpcvw-naming-pass.json fn-stats-render).
 *
 * Scaffold layout — minimal but readable. Phase B pixel-parity pass will
 * tighten cell positions against the captured state-0x11 fixture.
 *
 *   Row 0:  centered name        (attr 0x03)
 *   Row 1:  race / sex           (attr 0x03)
 *   Row 2:  class                 (attr 0x03)
 *   Row 3:  AC + HP/SP            (attr 0x03)
 *   Rows 5..12: 8 attribute rows (label left, value right-aligned, attr 0x03)
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { ActivePartyMember, MessageDb } from '@wiz6/data';
import { creationString, RACE_NAME_BASE, CLASS_NAME_BASE, SEX_NAME_BASE } from '../roster/creation/messages.js';

const CELL_PX = 8;
const PANEL_W = 20;
const PANEL_H = 16;
const PANEL_X = 20 * CELL_PX; // 160
const PANEL_Y = 4 * CELL_PX;  // 32
const ATTR = 0x03;

interface AttrRow {
  label: string;
  value: number;
}

function attrRows(m: ActivePartyMember): AttrRow[] {
  return [
    { label: 'STR', value: m.attributes.str },
    { label: 'INT', value: m.attributes.int },
    { label: 'PIE', value: m.attributes.pie },
    { label: 'VIT', value: m.attributes.vit },
    { label: 'DEX', value: m.attributes.dex },
    { label: 'SPD', value: m.attributes.spd },
    { label: 'PER', value: m.attributes.per },
    { label: 'KAR', value: m.attributes.kar },
  ];
}

export function composeStatsPanel(member: ActivePartyMember, db: MessageDb): TileWindow {
  const w = createTileWindow({
    screenX: PANEL_X,
    screenY: PANEL_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  clearWindow(w, 0x20, ATTR);

  // Row 0: centered name.
  const name = member.name.slice(0, PANEL_W);
  setCursor(w, Math.max(0, Math.floor((PANEL_W - name.length) / 2)), 0);
  puts(w, name, ATTR);

  // Row 1: race / sex (e.g. "HUMAN MALE").
  const race = creationString(db, RACE_NAME_BASE + member.race);
  const sex = creationString(db, SEX_NAME_BASE + member.sex);
  setCursor(w, 0, 1);
  puts(w, `${race} ${sex}`.slice(0, PANEL_W), ATTR);

  // Row 2: class.
  const cls = creationString(db, CLASS_NAME_BASE + member.class);
  setCursor(w, 0, 2);
  puts(w, cls.slice(0, PANEL_W), ATTR);

  // Row 3: level placeholder (AC + HP/SP need derived fields not on ActivePartyMember).
  setCursor(w, 0, 3);
  puts(w, `LVL ${member.level}`.slice(0, PANEL_W), ATTR);

  // Rows 5..12: 8 attribute rows. Label cols 0..2, value cols 16..18 (right-aligned 3-wide).
  const rows = attrRows(member);
  for (let i = 0; i < rows.length; i++) {
    setCursor(w, 0, 5 + i);
    puts(w, rows[i]!.label, ATTR);
    const valueStr = String(rows[i]!.value).padStart(3, ' ');
    setCursor(w, PANEL_W - 3, 5 + i);
    puts(w, valueStr, ATTR);
  }

  return w;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @wiz6/viewer vitest run tests/pages/castle/compose-stats-panel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/castle/compose-stats-panel.ts \
        packages/viewer/tests/pages/castle/compose-stats-panel.test.ts
git commit -m "feat(castle): stats-panel sub-composer for WPCVW view scaffold"
```

---

## Task 6: Main panel + 11-action menu sub-composer

**Files:**
- Create: `packages/viewer/src/pages/castle/compose-main-panel.ts`
- Test: `packages/viewer/tests/pages/castle/compose-main-panel.test.ts`

The main panel is the full-screen 40×20 window at (x=0, y=0) attr 0x14. Hosts the inventory grid (left side) + the 11-action menu (2-col × 6-row grid). For the scaffold, render the action menu only (inventory grid is a separate deeper port). The 11 actions + EXIT (12 total) live at msg ids 301..312.

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/castle/compose-main-panel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { composeMainPanel } from '../../../src/pages/castle/compose-main-panel.js';
import type { MessageDb } from '@wiz6/data';

function fakeDb(messages: Record<number, string>): MessageDb {
  return {
    indexedMessages: Object.entries(messages).map(([id, decodedText]) => ({
      id: Number(id),
      decodedText,
    })),
  } as unknown as MessageDb;
}

function actionDb(): MessageDb {
  return fakeDb({
    301: 'EQUIP', 302: 'SPELL', 303: 'TRADE', 304: 'ASSAY',
    305: 'SWAG', 306: 'MERGE', 307: 'USE', 308: 'DROP',
    309: 'SKILL', 310: 'EDIT', 311: 'REVIEW', 312: 'EXIT',
  });
}

function cellsAsString(win: { cells: Uint8Array; widthCells: number; heightCells: number }): string {
  let s = '';
  for (let y = 0; y < win.heightCells; y++) {
    for (let x = 0; x < win.widthCells; x++) {
      const charByte = win.cells[(y * win.widthCells + x) * 2]!;
      s += String.fromCharCode(charByte);
    }
    s += '\n';
  }
  return s;
}

describe('composeMainPanel', () => {
  it('returns a 40×20 TileWindow at screen (0, 0)', () => {
    const win = composeMainPanel({ cursorIdx: 11, db: actionDb() });
    expect(win.widthCells).toBe(40);
    expect(win.heightCells).toBe(20);
    expect(win.screenX).toBe(0);
    expect(win.screenY).toBe(0);
  });

  it('renders all 12 action labels including EXIT', () => {
    const win = composeMainPanel({ cursorIdx: 11, db: actionDb() });
    const text = cellsAsString(win);
    for (const label of ['EQUIP', 'SPELL', 'TRADE', 'ASSAY', 'SWAG', 'MERGE',
                          'USE', 'DROP', 'SKILL', 'EDIT', 'REVIEW', 'EXIT']) {
      expect(text).toContain(label);
    }
  });

  it('highlights the EXIT entry when cursorIdx=11', () => {
    const win = composeMainPanel({ cursorIdx: 11, db: actionDb() });
    // EXIT is at picker position (1, 6) — col=11, row=13 in main panel coords
    // (action grid x_base=2, y_base=1, x_step=6, y_step=2 — placeholder for
    // now; assertion only checks SOME cell containing 'E' has the highlight
    // attr 0x50).
    let foundHighlight = false;
    for (let i = 0; i < win.cells.length; i += 2) {
      const ch = win.cells[i]!;
      const attr = win.cells[i + 1]!;
      if (ch === 0x45 /* 'E' */ && attr === 0x50) {
        foundHighlight = true;
        break;
      }
    }
    expect(foundHighlight).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer vitest run tests/pages/castle/compose-main-panel.test.ts
```

Expected: FAIL — file does not exist.

- [ ] **Step 3: Create the composer**

Create `packages/viewer/src/pages/castle/compose-main-panel.ts`:

```ts
/**
 * composeMainPanel — WPCVW full-screen main panel (40×20 @ x=0, y=0).
 *
 * Engine reference: ui_render_inventory_panel @ wpcvw 0x6c81 + the 11-action
 * picker grid at file 0x6b8a. See docs/re/findings/wpcvw-character-view-ux.json
 * findings for action-menu layout and disable-mask semantics.
 *
 * Scaffold renders the 12-entry action menu (EQUIP..REVIEW + EXIT) as a 2×6
 * grid in the panel's lower half. Inventory grid rendering is deferred to a
 * follow-up sub-project. All non-EXIT entries render at the disabled attr
 * (0x07) per the scaffold spec; EXIT renders at the cursor's highlight attr
 * (0x50) when cursorIdx == 11.
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { MessageDb } from '@wiz6/data';
import { creationString } from '../roster/creation/messages.js';

const CELL_PX = 8;
const PANEL_W = 40;
const PANEL_H = 20;
const PANEL_X = 0;
const PANEL_Y = 0;
const ATTR_BG = 0x03;
const ATTR_DISABLED = 0x07;
const ATTR_HIGHLIGHT = 0x50;

const ACTION_MSG_BASE = 301;
const ACTION_COUNT = 12; // 11 actions + EXIT

const GRID_X_BASE = 2;
const GRID_Y_BASE = 13; // bottom half of the main panel
const GRID_X_STEP = 8;
const GRID_Y_STEP = 1;

export interface MainPanelView {
  /** Index of the focused action 0..11. EXIT is index 11. */
  cursorIdx: number;
  db: MessageDb;
}

function actionPosition(idx: number): { x: number; y: number } {
  return {
    x: GRID_X_BASE + (idx % 2) * GRID_X_STEP,
    y: GRID_Y_BASE + Math.floor(idx / 2) * GRID_Y_STEP,
  };
}

export function composeMainPanel(view: MainPanelView): TileWindow {
  const w = createTileWindow({
    screenX: PANEL_X,
    screenY: PANEL_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  clearWindow(w, 0x20, ATTR_BG);

  for (let idx = 0; idx < ACTION_COUNT; idx++) {
    const label = creationString(view.db, ACTION_MSG_BASE + idx);
    if (!label) continue;
    const { x, y } = actionPosition(idx);
    setCursor(w, x, y);
    // Scaffold rule: only EXIT (idx 11) is enabled. Cursor highlight only
    // applies to the focused entry.
    let attr: number;
    if (idx === view.cursorIdx) {
      attr = ATTR_HIGHLIGHT;
    } else if (idx === 11) {
      // EXIT not focused but still drawn at normal attr (it's the only enabled action).
      attr = ATTR_BG;
    } else {
      attr = ATTR_DISABLED;
    }
    puts(w, label, attr);
  }

  return w;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @wiz6/viewer vitest run tests/pages/castle/compose-main-panel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/castle/compose-main-panel.ts \
        packages/viewer/tests/pages/castle/compose-main-panel.test.ts
git commit -m "feat(castle): main-panel sub-composer with 12-entry action menu"
```

---

## Task 7: Party-row sub-composer

**Files:**
- Create: `packages/viewer/src/pages/castle/compose-party-row.ts`
- Test: `packages/viewer/tests/pages/castle/compose-party-row.test.ts`

The bottom party row is a 40×4 window at (x=0, y=20) attr 0x0f. Renders 6 mini-cells of 7 cells wide each, showing each party member's name + HP/SP/conditions/etc. For the scaffold, render just the name (7 chars max) per cell — bars and condition icons deferred.

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/castle/compose-party-row.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { composePartyRow } from '../../../src/pages/castle/compose-party-row.js';
import type { ActivePartyMember } from '@wiz6/data';

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

function cellsAsString(win: { cells: Uint8Array; widthCells: number; heightCells: number }): string {
  let s = '';
  for (let y = 0; y < win.heightCells; y++) {
    for (let x = 0; x < win.widthCells; x++) {
      const charByte = win.cells[(y * win.widthCells + x) * 2]!;
      s += String.fromCharCode(charByte);
    }
    s += '\n';
  }
  return s;
}

describe('composePartyRow', () => {
  it('returns a 40×4 TileWindow at screen (0, 160)', () => {
    const win = composePartyRow({ members: [], currentSlot: 0 });
    expect(win.widthCells).toBe(40);
    expect(win.heightCells).toBe(4);
    expect(win.screenX).toBe(0);
    expect(win.screenY).toBe(160);
  });

  it('renders each party-member name in its mini-cell column', () => {
    const win = composePartyRow({
      members: [mockMember('NATHAN', 0), mockMember('GANDLF', 1)],
      currentSlot: 0,
    });
    const text = cellsAsString(win);
    expect(text).toContain('NATHAN');
    expect(text).toContain('GANDLF');
  });

  it('does not render absent slots', () => {
    const win = composePartyRow({ members: [mockMember('NATHAN', 0)], currentSlot: 0 });
    const text = cellsAsString(win);
    expect(text).toContain('NATHAN');
    expect(text).not.toContain('GANDLF');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer vitest run tests/pages/castle/compose-party-row.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create the composer**

Create `packages/viewer/src/pages/castle/compose-party-row.ts`:

```ts
/**
 * composePartyRow — WPCVW bottom party row (40×4 @ x=0, y=20).
 *
 * Engine reference: party_member_ui_render @ wpcvw 0x465 (per
 * docs/re/findings/wpcvw-naming-pass.json fn-party-row-render).
 *
 * Scaffold renders only the 7-char name per slot (cols 7*N..7*N+6, name on
 * row 0). Phase B will add HP/SP bars, condition icon, sex/race glyph, and
 * weapon icons once the wpcvw glyph-IDs are pinned from a captured fixture.
 */

import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { ActivePartyMember } from '@wiz6/data';

const CELL_PX = 8;
const PANEL_W = 40;
const PANEL_H = 4;
const PANEL_X = 0;
const PANEL_Y = 20 * CELL_PX; // 160
const ATTR = 0x03;
const ATTR_CURRENT = 0x50; // TODO: confirm highlight attr against engine fixture
const SLOT_WIDTH = 7;
const NAME_WIDTH = 7;

export interface PartyRowView {
  members: ReadonlyArray<ActivePartyMember>;
  /** Slot index of the currently-viewed character (0..members.length-1). */
  currentSlot: number;
}

export function composePartyRow(view: PartyRowView): TileWindow {
  const w = createTileWindow({
    screenX: PANEL_X,
    screenY: PANEL_Y,
    widthCells: PANEL_W,
    heightCells: PANEL_H,
  });
  clearWindow(w, 0x20, ATTR);

  for (let s = 0; s < view.members.length && s < 6; s++) {
    const member = view.members[s]!;
    const name = member.name.slice(0, NAME_WIDTH);
    const attr = s === view.currentSlot ? ATTR_CURRENT : ATTR;
    setCursor(w, s * SLOT_WIDTH, 0);
    puts(w, name, attr);
  }

  return w;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @wiz6/viewer vitest run tests/pages/castle/compose-party-row.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/castle/compose-party-row.ts \
        packages/viewer/tests/pages/castle/compose-party-row.test.ts
git commit -m "feat(castle): party-row sub-composer (name-only scaffold; bars+icons TODO)"
```

---

## Task 8: `compose-character-view-frame.ts` — assemble the 3 windows

**Files:**
- Create: `packages/viewer/src/pages/castle/compose-character-view-frame.ts`
- Test: `packages/viewer/tests/pages/castle/compose-character-view-frame.test.ts`

Glue composer that produces the array of TileWindows for the WPCVW view: main panel (with action menu), stats panel, party row.

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/pages/castle/compose-character-view-frame.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { composeCharacterViewFrame } from '../../../src/pages/castle/compose-character-view-frame.js';
import type { ActivePartyMember, MessageDb } from '@wiz6/data';

function fakeDb(messages: Record<number, string>): MessageDb {
  return {
    indexedMessages: Object.entries(messages).map(([id, decodedText]) => ({
      id: Number(id),
      decodedText,
    })),
  } as unknown as MessageDb;
}

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

describe('composeCharacterViewFrame', () => {
  it('returns exactly 3 TileWindows (main, stats, party-row)', () => {
    const db = fakeDb({
      301: 'EQUIP', 302: 'SPELL', 303: 'TRADE', 304: 'ASSAY',
      305: 'SWAG', 306: 'MERGE', 307: 'USE', 308: 'DROP',
      309: 'SKILL', 310: 'EDIT', 311: 'REVIEW', 312: 'EXIT',
      0x64: 'HUMAN', 0x78: 'FIGHTER', 0x8c: 'MALE',
    });
    const windows = composeCharacterViewFrame({
      members: [mockMember('NATHAN', 0)],
      currentSlot: 0,
      cursorIdx: 11,
      db,
    });
    expect(windows).toHaveLength(3);
  });

  it('places the stats panel at (160, 32)', () => {
    const db = fakeDb({ 0x64: 'HUMAN', 0x78: 'FIGHTER', 0x8c: 'MALE' });
    const windows = composeCharacterViewFrame({
      members: [mockMember('NATHAN', 0)],
      currentSlot: 0,
      cursorIdx: 11,
      db,
    });
    const stats = windows.find((w) => w.screenX === 160 && w.screenY === 32);
    expect(stats).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @wiz6/viewer vitest run tests/pages/castle/compose-character-view-frame.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create the composer**

Create `packages/viewer/src/pages/castle/compose-character-view-frame.ts`:

```ts
/**
 * composeCharacterViewFrame — WPCVW state-0x11 character-view scaffold.
 *
 * Returns the array of TileWindows in z-order (lowest first). The view has
 * THREE windows per docs/re/findings/wpcvw-character-view-ux.json
 * wpcvw-view-main-window-geometry:
 *   1. Main panel (full screen 40×20) — hosts action menu + inventory grid.
 *   2. Stats panel (20×16 at x=20, y=4) — right-side character sheet.
 *   3. Party row (40×4 at x=0, y=20) — bottom mini-row.
 *
 * Z-order: main is drawn first, then stats overlays it, then party row.
 */

import type { TileWindow } from '@wiz6/parser';
import type { ActivePartyMember, MessageDb } from '@wiz6/data';
import { composeMainPanel } from './compose-main-panel.js';
import { composeStatsPanel } from './compose-stats-panel.js';
import { composePartyRow } from './compose-party-row.js';

export interface CharacterViewView {
  members: ReadonlyArray<ActivePartyMember>;
  /** Slot index of the currently-viewed character. */
  currentSlot: number;
  /** Action-menu cursor 0..11 (11 = EXIT). */
  cursorIdx: number;
  db: MessageDb;
}

export function composeCharacterViewFrame(view: CharacterViewView): TileWindow[] {
  const current = view.members[view.currentSlot];
  if (!current) return [];
  return [
    composeMainPanel({ cursorIdx: view.cursorIdx, db: view.db }),
    composeStatsPanel(current, view.db),
    composePartyRow({ members: view.members, currentSlot: view.currentSlot }),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @wiz6/viewer vitest run tests/pages/castle/compose-character-view-frame.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/castle/compose-character-view-frame.ts \
        packages/viewer/tests/pages/castle/compose-character-view-frame.test.ts
git commit -m "feat(castle): character-view frame composer (main + stats + party-row)"
```

---

## Task 9: `CharacterViewPage` React component

**Files:**
- Create: `packages/viewer/src/pages/castle/CharacterViewPage.tsx`

The view page. Reads `slotIdx` from URL params, mounts the composer, handles EXIT key (Enter on cursor=11 OR Escape) → navigate to `/castle`.

- [ ] **Step 1: Create the page**

Create `packages/viewer/src/pages/castle/CharacterViewPage.tsx`:

```tsx
/**
 * CharacterViewPage — WPCVW state-0x11 character view (scaffold).
 *
 * Reads :slotIdx from the route, renders the 3-window WPCVW layout via
 * composeCharacterViewFrame, handles EXIT (Enter on cursor=11 OR Escape)
 * → navigate to /castle.
 *
 * Scaffold limits: cursor is locked on EXIT (idx 11). Arrow keys don't move
 * the cursor since no other action is wired up. Future action ports will
 * unlock cursor movement.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WIZ6_MAIN, type ActivePartyMember, type MessageDb } from '@wiz6/data';
import {
  renderTileWindow,
  type FontSet,
} from '@wiz6/parser';
import { loadMessageDb as defaultLoadMessageDb } from '../../data-loader.js';
import { loadCreationFontSet } from '../roster/creation/ega/assets.js';
import { readActiveParty } from '../../lib/active-party-store.js';
import { CanvasPresenter } from '../../lib/presenter.js';
import { composeCharacterViewFrame } from './compose-character-view-frame.js';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

const CURSOR_EXIT = 11;

export function CharacterViewPage() {
  const navigate = useNavigate();
  const { slotIdx: slotIdxParam } = useParams<{ slotIdx: string }>();
  const slotIdx = Number(slotIdxParam);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fontSet, setFontSet] = useState<FontSet | null>(null);
  const [db, setDb] = useState<MessageDb | null>(null);

  const members = useMemo<ActivePartyMember[]>(() => readActiveParty().members, []);
  const validSlot = Number.isFinite(slotIdx) && slotIdx >= 0 && slotIdx < members.length;

  // Bounce on invalid slot.
  useEffect(() => {
    if (!validSlot) navigate('/castle');
  }, [validSlot, navigate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [fs, m] = await Promise.all([
          loadCreationFontSet(),
          defaultLoadMessageDb('/messages/msg.json'),
        ]);
        if (cancelled) return;
        setFontSet(fs);
        setDb(m);
      } catch (err: unknown) {
        if (!cancelled) console.error('[CharacterViewPage] asset load failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        navigate('/castle');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  // Paint loop — static; no animations in the scaffold.
  useEffect(() => {
    if (!validSlot || !fontSet || !db) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const presenter = new CanvasPresenter(canvas);
    const windows = composeCharacterViewFrame({
      members,
      currentSlot: slotIdx,
      cursorIdx: CURSOR_EXIT,
      db,
    });
    const buf = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
    buf.fill(0);
    for (const w of windows) {
      renderTileWindow(w, buf, ENGINE_W, ENGINE_H, fontSet, WIZ6_MAIN);
    }
    presenter.present(buf, ENGINE_W, ENGINE_H);
  }, [validSlot, fontSet, db, members, slotIdx]);

  if (!validSlot) return null;
  if (!fontSet || !db) return <div>Loading…</div>;

  return (
    <main>
      <canvas
        ref={canvasRef}
        width={ENGINE_W}
        height={ENGINE_H}
        style={{
          width: ENGINE_W * SCALE,
          height: ENGINE_H * SCALE,
          imageRendering: 'pixelated',
          background: '#000',
        }}
        aria-label="Wizardry VI character view"
      />
    </main>
  );
}
```

- [ ] **Step 2: Commit** (no test yet — page is render-only; e2e covers it in Task 10)

```bash
git add packages/viewer/src/pages/castle/CharacterViewPage.tsx
git commit -m "feat(castle): CharacterViewPage scaffold (3 windows + EXIT)"
```

---

## Task 10: `ReviewMemberPage` + routes + remove stub entries + e2e

**Files:**
- Create: `packages/viewer/src/pages/castle/ReviewMemberPage.tsx`
- Modify: `packages/viewer/src/router.tsx`
- Modify: `packages/viewer/src/pages/game/CastleStub.tsx` (remove `review-member` entry)
- Test: `packages/viewer/e2e/review-member-flow.spec.ts`

- [ ] **Step 1: Create the page**

Create `packages/viewer/src/pages/castle/ReviewMemberPage.tsx`:

```tsx
/**
 * ReviewMemberPage — wbase MASTER OPTIONS slot 1 (REVIEW MEMBER).
 *
 * Mounts the shared PartyMemberPicker with title from msg 0x4b2
 * ("REVIEW WHO?"). On commit: navigate to /castle/review-member/:slotIdx
 * which mounts the CharacterViewPage. On cancel: back to /castle.
 *
 * Single-member shortcut: if members.length === 1, navigate directly to
 * /castle/review-member/0 (engine bypasses the picker).
 *
 * Empty party: bounce to /castle.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WIZ6_MAIN, type MessageDb } from '@wiz6/data';
import { loadMessageDb as defaultLoadMessageDb } from '../../data-loader.js';
import { loadCreationFontSet } from '../roster/creation/ega/assets.js';
import type { FontSet } from '@wiz6/parser';
import { readActiveParty } from '../../lib/active-party-store.js';
import { creationString } from '../roster/creation/messages.js';
import { PartyMemberPicker } from '../../components/PartyMemberPicker.js';

const REVIEW_WHO_MSG_ID = 0x4b2;

export function ReviewMemberPage() {
  const navigate = useNavigate();
  const members = useMemo(() => readActiveParty().members, []);
  const [fontSet, setFontSet] = useState<FontSet | null>(null);
  const [db, setDb] = useState<MessageDb | null>(null);

  useEffect(() => {
    if (members.length === 0) {
      navigate('/castle');
    } else if (members.length === 1) {
      navigate('/castle/review-member/0');
    }
  }, [members.length, navigate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [fs, m] = await Promise.all([
          loadCreationFontSet(),
          defaultLoadMessageDb('/messages/msg.json'),
        ]);
        if (cancelled) return;
        setFontSet(fs);
        setDb(m);
      } catch (err: unknown) {
        if (!cancelled) console.error('[ReviewMemberPage] asset load failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (members.length < 2) return null;
  if (!fontSet || !db) return <div>Loading…</div>;

  const title = creationString(db, REVIEW_WHO_MSG_ID);
  return (
    <PartyMemberPicker
      title={title}
      members={members}
      fontSet={fontSet}
      palette={WIZ6_MAIN}
      onCommit={(slotIdx) => navigate(`/castle/review-member/${slotIdx}`)}
      onCancel={() => navigate('/castle')}
    />
  );
}
```

- [ ] **Step 2: Wire the routes**

Edit `packages/viewer/src/router.tsx`. Add lazy imports:

```tsx
const ReviewMemberPage = lazy(() =>
  import('./pages/castle/ReviewMemberPage.js').then((m) => ({ default: m.ReviewMemberPage })),
);
const CharacterViewPage = lazy(() =>
  import('./pages/castle/CharacterViewPage.js').then((m) => ({ default: m.CharacterViewPage })),
);
```

Add routes (the `/:slotIdx` route MUST come before the catch-all `/:stub`):

```tsx
<Route path="/castle/review-member" element={<ReviewMemberPage />} />
<Route path="/castle/review-member/:slotIdx" element={<CharacterViewPage />} />
```

The full block of castle routes should now look like:

```tsx
<Route path="/castle" element={<CastleScreen />} />
<Route path="/castle/character-menu" element={<CreationPage />} />
<Route path="/castle/add-party" element={<AddPartyPage />} />
<Route path="/castle/dismiss-member" element={<DismissMemberPage />} />
<Route path="/castle/review-member" element={<ReviewMemberPage />} />
<Route path="/castle/review-member/:slotIdx" element={<CharacterViewPage />} />
<Route path="/castle/:stub" element={<CastleStub />} />
```

- [ ] **Step 3: Remove `review-member` from CastleStub**

In `packages/viewer/src/pages/game/CastleStub.tsx`, drop the `'review-member'` entry:

```ts
  'review-member': {
    title: 'Review Member',
    description: 'Pick a party member to inspect. Transitions to WPCVW (state 0x11).',
  },
```

- [ ] **Step 4: Write the e2e test**

Create `packages/viewer/e2e/review-member-flow.spec.ts`:

```ts
/**
 * review-member-flow.spec.ts — verifies the REVIEW MEMBER flow end-to-end.
 *
 * Seed roster + active party with two members. Navigate to /castle, select
 * REVIEW MEMBER, pick the first member, lands on /castle/review-member/0
 * (the WPCVW character view scaffold), press Enter (EXIT), return to castle.
 * Verify active party unchanged.
 */

import { test, expect } from '@playwright/test';

const ID_A = '550e8400-e29b-41d4-a716-446655440000';
const ID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function makeChar(id: string, name: string) {
  return {
    id, name, race: 0, class: 0, sex: 0, level: 1, xp: 0, gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false, paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0, reaction: 0,
  };
}

test('REVIEW MEMBER picker opens character view + EXIT returns to castle', async ({ page }) => {
  const nathan = makeChar(ID_A, 'NATHAN');
  const gandalf = makeChar(ID_B, 'GANDALF');
  const nathanInParty = { ...nathan, portraitSlotId: 0, rosterCharacterId: nathan.id };
  const gandalfInParty = { ...gandalf, portraitSlotId: 1, rosterCharacterId: gandalf.id };

  await page.goto('/');
  await page.evaluate(
    async ({ chars, members }) => {
      const json = JSON.stringify({ schemaVersion: 1, characters: chars });
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      void writer.write(new TextEncoder().encode(json));
      void writer.close();
      const gz = new Uint8Array(await new Response(cs.readable).arrayBuffer());
      let s = '';
      for (let i = 0; i < gz.length; i++) s += String.fromCharCode(gz[i]!);
      window.localStorage.setItem('wiz6:roster', btoa(s));
      window.localStorage.setItem(
        'wiz6:active-party',
        JSON.stringify({ schemaVersion: 1, members }),
      );
    },
    { chars: [nathan, gandalf], members: [nathanInParty, gandalfInParty] },
  );

  await page.goto('/castle');
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(500);

  // Visible slots with 2 party members: [0 ADD, 1 REVIEW, 2 DISMISS, ...]
  // Cursor starts on slot 0. Down once → REVIEW. Enter.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await page.waitForURL('**/castle/review-member', { timeout: 5_000 });
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(500);

  // Picker cursor on slot 0 (NATHAN). Enter.
  await page.keyboard.press('Enter');

  await page.waitForURL('**/castle/review-member/0', { timeout: 5_000 });
  await page.waitForSelector('canvas', { timeout: 10_000 });
  await page.waitForTimeout(500);

  // EXIT — Enter (cursor locked on EXIT in scaffold) OR Escape.
  await page.keyboard.press('Enter');

  await page.waitForURL('**/castle', { timeout: 5_000 });
  await page.waitForTimeout(300);

  // Active party unchanged.
  const partyJson = await page.evaluate(() => window.localStorage.getItem('wiz6:active-party'));
  expect(partyJson).not.toBeNull();
  const party = JSON.parse(partyJson!);
  expect(party.members).toHaveLength(2);
});
```

- [ ] **Step 5: Run unit + e2e**

```bash
cd /Users/nathan/Projects/ndouglas/wiz6
pnpm --filter @wiz6/viewer test
cd packages/viewer && pnpm test:e2e review-member-flow 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/nathan/Projects/ndouglas/wiz6
git add packages/viewer/src/pages/castle/ReviewMemberPage.tsx \
        packages/viewer/src/router.tsx \
        packages/viewer/src/pages/game/CastleStub.tsx \
        packages/viewer/e2e/review-member-flow.spec.ts
git commit -m "feat(castle): REVIEW MEMBER + character view scaffold end-to-end"
```

---

## Task 11: Final integration check

**Files:** None (verification).

- [ ] **Step 1: Run the full monorepo suite**

```bash
pnpm -r test 2>&1 | tail -20
```

Expected: PASS for `@wiz6/viewer`, `@wiz6/data`, `@wiz6/parser`. (`@wiz6/cli` has a pre-existing unrelated failure in `extract-message-db.test.ts` — IGNORE it.)

- [ ] **Step 2: Run all e2e tests**

```bash
cd packages/viewer && pnpm test:e2e 2>&1 | tail -20
```

Expected: PASS — both new dismiss + review e2es plus pre-existing add-party + character-menu + parity + dup-name-modal tests all green.

- [ ] **Step 3: Manual smoke test**

```bash
cd /Users/nathan/Projects/ndouglas/wiz6
pnpm dev:viewer
```

Click through:

1. Title → Castle.
2. Click CLEAR → reload. Confirm fresh state.
3. ADD PARTY MEMBER → pick a roster character → back to castle. Active party has 1 member.
4. ADD PARTY MEMBER → pick another → back to castle. Active party has 2 members.
5. REVIEW MEMBER → picker shows 2 slots → press Enter on NATHAN. Lands on character view scaffold. Press Enter → back to castle.
6. DISMISS MEMBER → picker shows 2 slots → press Enter on first. Back to castle. Active party has 1 member.
7. DISMISS MEMBER again → single-member shortcut: dismisses immediately. Active party empty. DISMISS option hidden in menu.

Report any visible bugs.

- [ ] **Step 4: Update TODO.md**

```bash
cd /Users/nathan/Projects/ndouglas/wiz6
# No commit yet — this is a planning artifact.
# Find the open-followups section in TODO.md and add entries:
#   - #NNN port WPCVW EQUIP action handler
#   - #NNN port WPCVW USE action handler
#   - #NNN port WPCVW DROP action handler
#   - #NNN port WPCVW EDIT submenu (rename, portrait, class)
#   - #NNN port WPCVW SPELL action (depends on RE follow-up on FUN_416d)
#   - #NNN port WPCVW MERGE action (depends on RE follow-up on FUN_5826)
#   - #NNN port WPCVW SKILL action (depends on RE follow-up on FUN_4d36)
#   - #NNN port WPCVW TRADE action
#   - #NNN port WPCVW ASSAY action
#   - #NNN port WPCVW SWAG action
#   - #NNN port WPCVW in-place REVIEW WHO swap
#   - #NNN capture state-0x11 save fixture + pixel-parity gate
#   - #NNN tighten WPCVW stats-panel geometry to engine fixture
#   - #NNN tighten WPCVW party-row mini-cells (bars, icons, glyphs)
```

The implementer reads the latest `TODO.md`, picks the next sequential ID (e.g. `#031`), and adds one line per follow-up. Commit as a separate task-end commit:

```bash
git add TODO.md
git commit -m "todo: queue WPCVW action ports + Phase B pixel-parity"
```

---

## What is NOT in this plan (intentionally)

- **Pixel-parity test (Phase B).** Requires capturing a state-0x11 save fixture from DOSBox-X manually. Once captured, add a `creation-review-member` case to `tools/parity/screen-parity.test.ts` mirroring the existing parity cases. Out of scope for this plan because the fixture doesn't exist yet — call it out in TODO.md (Task 11 step 4) so the next session can address it.
- **Cursor movement on the 11-action menu.** The scaffold locks cursor on EXIT. Future action ports will unlock cursor + wire enabled actions.
- **The 11 action bodies.** Each action (EQUIP, USE, DROP, EDIT, SPELL, MERGE, SKILL, TRADE, ASSAY, SWAG, in-place REVIEW WHO) is its own sub-project per the spec. Queued in TODO.md.
- **Mouse-input remap.** The findings document engine mouse handling; the port has been keyboard-only by design.
- **State-0x16 post-combat level-up.** Depends on combat being ported; out of scope.

## Notes for the implementer

- Each task ends with a commit. **Do not skip the commit** even if the next task is small.
- The composers are PURE — no I/O, no React. Tests assert on the returned `TileWindow`'s `cells` byte array. The `cellsAsString` helper appears in three composer tests; if you find yourself copy-pasting it a fourth time, extract to a shared test helper.
- The 3-window WPCVW view's z-order matters: main panel first (lowest), stats overlays it, party-row at the bottom. `composeCharacterViewFrame` returns them in that order; the page's `renderTileWindow` loop must iterate in that order.
- The single-member picker bypass (engine `party_size < 2`) is handled at the PAGE level (DismissMemberPage and ReviewMemberPage), NOT inside `PartyMemberPicker`. The component assumes ≥ 1 member.
- The wpcmk `drawCharSheet` and wpcvw `composeStatsPanel` are NOT interchangeable — different window dimensions. Don't try to reuse.
- `creationString(db, msgId)` from `roster/creation/messages.ts` is the canonical msg-lookup helper; reuse it for all msg.dbs ID resolutions.
