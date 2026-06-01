# Party-Member Picker Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the castle REVIEW WHO? / DISMISS WHO? party-member picker match the original engine — cursor starts on a banner EXIT option, Up/Down move between EXIT and a row-major member grid, the picker is composited over the live castle scene — behind 4 pixel-parity gates.

**Architecture:** One shared widget (`PartyMemberPicker`) used by both `ReviewMemberPage` and `DismissMemberPage`. It mirrors the sibling `AddPartyPage`: own a single-integer cursor state machine (`-1` = EXIT, `0..N-1` = member), load the castle assets, compose `composeCastleFrame` (so the gate/portraits stay visible), then overlay the picker windows. The pure composer (`compose-party-member-picker-frame.ts`) renders the banner (title + EXIT) and the member grid; pixel parity against DOSBox-captured fixtures is the gate.

**Tech Stack:** TypeScript ESM (`.js` import extensions), React + react-router, `@wiz6/parser` TileWindow renderer, vitest (unit + parity), Playwright (e2e), DOSBox-X MCP for fixture capture.

**Engine ground truth:** `docs/re/findings/wbase-party-pickers-and-dismiss.json` + live capture 2026-06-01 (screenshots in the brainstorming transcript). Spec: `docs/superpowers/specs/2026-06-01-party-member-picker-fix-design.md`.

**Verified nav model (the spec, restated for the implementer):**
- Cursor `-1` = EXIT (initial). Banner shows title + EXIT; EXIT highlighted when cursor `-1`.
- `Down`: from `-1` → `0`; from `s` → `s+2` only if `s+2 < N` (else stay — clamp, no wrap).
- `Up`: from `s` where `s >= 2` → `s-2`; from `s` in `{0,1}` (top member row) → `-1` (EXIT).
- `Left`: from odd `s` (right column) → `s-1`. (Even `s` / EXIT: no-op.)
- `Right`: from even `s` (left column) → `s+1` only if `s+1 < N`. (Odd `s` / EXIT: no-op.)
- `Enter`: on a member (`s >= 0`) → commit slot `s`; on EXIT (`-1`) → cancel.
- `Escape`: cancel (same as Enter-on-EXIT).
- Grid placement (unchanged): slot `s` at `cellX=(s%2)*9+2`, `cellY=floor(s/2)+1`.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `packages/viewer/src/pages/castle/compose-party-member-picker-frame.ts` | Pure composer: banner (title + EXIT) + member grid; `cursor: number` view; `invertHighlight` | Modify |
| `packages/viewer/src/components/PartyMemberPicker.tsx` | Nav state machine + castle-asset loading + composite-over-castle-frame | Rewrite |
| `packages/viewer/src/pages/castle/ReviewMemberPage.tsx` | Mount the widget (already does; verify props) | Verify/minor |
| `packages/viewer/src/pages/castle/DismissMemberPage.tsx` | Mount the widget | Verify/minor |
| `packages/viewer/tests/pages/castle/compose-party-member-picker-frame.test.ts` | Composer cell-grid unit tests | Rewrite |
| `packages/viewer/tests/components/PartyMemberPicker.test.tsx` | Nav state-machine unit tests | Rewrite |
| `tools/dosbox/state-catalog.ts` | Deterministic recipes to reach the pickers | Modify |
| `tools/parity/fixtures/engine/{review,dismiss}-who-{member,exit}.{idx.gz,png}` | Engine fixtures | Create (capture) |
| `tools/parity/party-member-picker-parity.test.ts` | 4 full-screen pixel-parity tests | Create |
| `packages/viewer/e2e/review-member-flow.spec.ts` | e2e picker canvas assertion | Modify |
| `TODO.md` | Close #058 | Modify |

---

## Task 1: DOSBox recipes to reach the pickers

**Files:**
- Modify: `tools/dosbox/state-catalog.ts`

The castle-N recipe leaves the cursor on ADD PARTY MEMBER (slot 0). REVIEW MEMBER is slot 1
(directly below), DISMISS MEMBER is slot 2. So from a castle-3 party: `down enter` opens
REVIEW WHO? (cursor on EXIT); a further `down` lands on slot 0 (member-highlighted).

- [ ] **Step 1: Add four named recipes after the `CASTLE_RECIPES` definition (line ~94).**

```ts
// Party-member picker reachers (REVIEW MEMBER = MASTER OPTIONS slot 1,
// DISMISS MEMBER = slot 2). Built on castle-3 (3 fixed PCFILE chars →
// deterministic). After castle-3 the cursor is on ADD PARTY MEMBER (slot 0).
//   review-who:    down enter           → REVIEW WHO?, cursor on EXIT (-1)
//   review-who-member: + down           → cursor on slot 0
//   dismiss-who:   down down enter       → DISMISS WHO?, cursor on EXIT (-1)
//   dismiss-who-member: + down           → cursor on slot 0
function makePickerRecipe(
  name: string,
  toOption: string,
  extra: string[],
  picker: 'REVIEW' | 'DISMISS',
): SaveStateRecipe {
  const base = makeCastleRecipe(3).steps;
  return {
    name,
    description:
      `${picker} WHO? picker over a 3-member castle (deterministic PCFILE chars). ` +
      `Reaches ${name.endsWith('member') ? 'cursor-on-slot-0' : 'cursor-on-EXIT'}.`,
    steps: [...base, toOption, ...extra],
  };
}

const PICKER_RECIPES: readonly SaveStateRecipe[] = [
  makePickerRecipe('review-who-exit', 'down enter', [], 'REVIEW'),
  makePickerRecipe('review-who-member', 'down enter', ['down'], 'REVIEW'),
  makePickerRecipe('dismiss-who-exit', 'down down enter', [], 'DISMISS'),
  makePickerRecipe('dismiss-who-member', 'down down enter', ['down'], 'DISMISS'),
];
```

- [ ] **Step 2: Add `PICKER_RECIPES` to `STATE_CATALOG` (line ~96).**

```ts
export const STATE_CATALOG: readonly SaveStateRecipe[] = [
  ...SEED_CATALOG,
  ...CASTLE_RECIPES,
  ...PICKER_RECIPES,
];
```

- [ ] **Step 3: Verify the catalog lists them (no DOSBox needed).**

Run: `pnpm tsx tools/dosbox/build-saves.ts --list`
Expected: output includes `review-who-exit`, `review-who-member`, `dismiss-who-exit`, `dismiss-who-member`.

- [ ] **Step 4: Commit.**

```bash
git add tools/dosbox/state-catalog.ts
git commit -m "feat(dosbox): recipes to reach REVIEW/DISMISS WHO? pickers (cursor on EXIT + on member)"
```

---

## Task 2: Capture the 4 engine fixtures (ORCHESTRATOR-RUN via MCP)

**Files:**
- Create: `tools/parity/fixtures/engine/review-who-exit.{idx.gz,png}`
- Create: `tools/parity/fixtures/engine/review-who-member.{idx.gz,png}`
- Create: `tools/parity/fixtures/engine/dismiss-who-exit.{idx.gz,png}`
- Create: `tools/parity/fixtures/engine/dismiss-who-member.{idx.gz,png}`

> **This task is run by the orchestrator (main session), not a subagent** — it needs the
> DOSBox-X MCP, which has Accessibility in this session (verified 2026-06-01: `dosbox_launch`
> + `dosbox_send_input` drove the engine successfully). If the MCP is unavailable, fall back
> to the user running `build-saves.ts <recipe> --slot N` from an Accessibility-granted terminal.

For EACH of the 4 states: drive the engine to the picker, save the state to a slot, capture
the fixture, and record the party-member data needed by the parity test (Task 5).

- [ ] **Step 1: Drive + save each state via MCP.** For each recipe, from a fresh `dosbox_launch`:
  send `enter` (dismiss title), then send the recipe's macro steps (one `dosbox_send_input`
  per step, `dosbox_screenshot` to confirm), then `dosbox_save_state` to a chosen slot.
  - `review-who-exit`: `enter` / `enter enter` / `enter enter` / `enter enter` (3 members) /
    `down enter` → save slot 20.
  - `review-who-member`: continue `+ down` → save slot 21.
  - `dismiss-who-exit`: fresh boot + 3 members + `down down enter` → save slot 22.
  - `dismiss-who-member`: `+ down` → save slot 23.

  (Verify each `dosbox_screenshot` shows the expected banner + highlight before saving.)

- [ ] **Step 2: Record the party member data.** While DOSBox is at a picker, read the live
  party records via `dosbox_read_struct` / `dosbox_read_memory`. Party records start at DGROUP
  `0x43e8`, stride `0x1b0`; name is at record offset `+0x00` (null-terminated). Capture for each
  of the 3 members: `name`, `portraitIndex`, `hpCurrent/hpMax`, `staminaCurrent/staminaMax`,
  `age`, `class`, `race`, `sex` — enough to build matching `ActivePartyMember` constants in
  Task 5. Save these into a scratch note for Task 5 (e.g. paste into the test file as a comment
  first, then fill the constants).

- [ ] **Step 3: Generate the 4 fixtures from the saved slots.**

```bash
pnpm tsx tools/parity/gen-fixture.ts --save 20 --name review-who-exit
pnpm tsx tools/parity/gen-fixture.ts --save 21 --name review-who-member
pnpm tsx tools/parity/gen-fixture.ts --save 22 --name dismiss-who-exit
pnpm tsx tools/parity/gen-fixture.ts --save 23 --name dismiss-who-member
```

Expected: each writes `tools/parity/fixtures/engine/<name>.idx.gz` + `.png`.

- [ ] **Step 4: Eyeball the PNGs.** Open the 4 `.png` files; confirm: `*-exit` shows the
  EXIT word highlighted in the banner (members plain); `*-member` shows a member name
  highlighted (EXIT plain); the castle gate + party portraits are present in all four.

- [ ] **Step 5: Commit the fixtures.**

```bash
git add tools/parity/fixtures/engine/review-who-exit.* tools/parity/fixtures/engine/review-who-member.* \
        tools/parity/fixtures/engine/dismiss-who-exit.* tools/parity/fixtures/engine/dismiss-who-member.*
git commit -m "test(parity): capture REVIEW/DISMISS WHO? engine fixtures (EXIT + member highlighted)"
```

---

## Task 3: Rework the composer (banner title + EXIT, cursor model, invert)

**Files:**
- Modify: `packages/viewer/src/pages/castle/compose-party-member-picker-frame.ts`
- Test: `packages/viewer/tests/pages/castle/compose-party-member-picker-frame.test.ts`

The composer must: (a) take `cursor: number` (`-1` = EXIT) instead of `cursorIdx` + `onCancel`;
(b) render the banner as title (centered with `+6` padding) **plus** an EXIT word, highlighting
EXIT when `cursor === -1`; (c) render the selected member inverse-highlighted via
`invertHighlight`.

First confirm the EXIT message strings.

- [ ] **Step 1: Verify the EXIT message IDs decode to "EXIT".**

Run:
```bash
pnpm tsx -e "import {readFileSync} from 'node:fs'; import {MessageDbSchema} from '@wiz6/data'; const db=MessageDbSchema.parse(JSON.parse(readFileSync('extracted/messages/msg.json','utf-8'))); for (const id of [0x7eb,0x7ec]) console.log(id.toString(16), JSON.stringify(db.records?.[id]?.text ?? db[id] ?? '??'));"
```
Expected: both print the EXIT label (regular vs highlight variant). If the access path differs,
use the same `creationString(db, id)` helper the pages use. **Record the exact decoded string**
(e.g. `"EXIT"`); use it in Step 3. If they are NOT "EXIT", stop and report — the spec assumed
they are; the fixture is the source of truth either way.

- [ ] **Step 2: Write the failing composer test** (rewrite the file).

```ts
import { describe, it, expect } from 'vitest';
import { composePartyMemberPickerFrame } from '../../../src/pages/castle/compose-party-member-picker-frame.js';
import type { ActivePartyMember } from '@wiz6/data';

const M = (name: string): ActivePartyMember =>
  ({ name } as unknown as ActivePartyMember);
const members = [M('THESUS'), M('TEMPEST'), M('LYSANDR')];

function cellChar(win: { cells: { ch: number }[]; widthCells: number }, x: number, y: number) {
  return String.fromCharCode(win.cells[y * win.widthCells + x]!.ch);
}

describe('composePartyMemberPickerFrame', () => {
  it('places members row-major: slot s at x=(s%2)*9+2, y=floor(s/2)+1', () => {
    const [, picker] = composePartyMemberPickerFrame({ title: 'REVIEW WHO?', members, cursor: -1 });
    expect(cellChar(picker, 2, 1)).toBe('T'); // THESUS slot 0 → col 2 row 1
    expect(cellChar(picker, 11, 1)).toBe('T'); // TEMPEST slot 1 → col 11 row 1
    expect(cellChar(picker, 2, 2)).toBe('L'); // LYSANDR slot 2 → col 2 row 2
  });

  it('cursor -1 highlights EXIT in the banner; members plain', () => {
    const [banner, picker] = composePartyMemberPickerFrame({ title: 'REVIEW WHO?', members, cursor: -1 });
    // EXIT cells carry the highlight attr (0x50); no member cell does.
    const exitHighlighted = banner.cells.some((c) => c.attr === 0x50);
    expect(exitHighlighted).toBe(true);
    expect(picker.cells.some((c) => c.attr === 0x50)).toBe(false);
    expect(banner.invertHighlight).toBe(true);
  });

  it('cursor on a member highlights that member; EXIT plain', () => {
    const [banner, picker] = composePartyMemberPickerFrame({ title: 'REVIEW WHO?', members, cursor: 2 });
    expect(picker.invertHighlight).toBe(true);
    // LYSANDR cell at (2,2) carries highlight attr.
    expect(picker.cells[2 * picker.widthCells + 2]!.attr).toBe(0x50);
    expect(banner.cells.some((c) => c.attr === 0x50)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails.**

Run: `pnpm --filter @wiz6/viewer exec vitest run compose-party-member-picker-frame`
Expected: FAIL (current composer uses `cursorIdx`/`onCancel`, no EXIT, no `invertHighlight`).

- [ ] **Step 4: Rewrite the composer.** Replace the view interface + both compose functions.
  Use the EXIT string recorded in Step 1 for `EXIT_LABEL`.

```ts
import { createTileWindow, clearWindow, setCursor, puts, type TileWindow } from '@wiz6/parser';
import type { ActivePartyMember } from '@wiz6/data';

const CELL_PX = 8;
const PICKER_W = 19;
const PICKER_H = 5;
const PICKER_SCREEN_X = 0;
const PICKER_SCREEN_Y = 19 * CELL_PX;
const BANNER_W = 40;
const BANNER_H = 1;
const BANNER_SCREEN_X = 0;
const BANNER_SCREEN_Y = 18 * CELL_PX;
const NAME_WIDTH = 7;
const ATTR_BG = 0x03;
const ATTR_HIGHLIGHT = 0x50;
const EXIT_LABEL = 'EXIT'; // msg 0x7eb/0x7ec (verified in Step 1)

export interface PartyMemberPickerView {
  /** Resolved title string (e.g. "REVIEW WHO?"). */
  title: string;
  members: ReadonlyArray<ActivePartyMember>;
  /** -1 = cursor on EXIT (cancel); 0..members.length-1 = a member. */
  cursor: number;
}

export function composePartyMemberPickerFrame(view: PartyMemberPickerView): TileWindow[] {
  return [composeBanner(view), composePicker(view)];
}

function composeBanner(view: PartyMemberPickerView): TileWindow {
  const w = createTileWindow({
    screenX: BANNER_SCREEN_X, screenY: BANNER_SCREEN_Y,
    widthCells: BANNER_W, heightCells: BANNER_H,
  });
  // Menu-style highlight = inverse (black on coloured bar), like compose-action-menu.
  w.invertHighlight = true;
  clearWindow(w, 0x20, ATTR_BG);
  // Engine: center_x = 10 - (strlen + 6)/2 (RE finding picker-title-banner-render);
  // the +6 reserves room for the trailing " EXIT". Exact column locked by the
  // pixel fixture in Task 5 — nudge if the *-exit case is off by a column.
  const title = view.title.slice(0, BANNER_W);
  const titleCol = Math.max(0, 10 - Math.floor((title.length + 6) / 2));
  setCursor(w, titleCol, 0);
  puts(w, title, ATTR_BG);
  // EXIT follows the title (one space gap). Highlighted when cursor === -1.
  const exitCol = titleCol + title.length + 1;
  setCursor(w, exitCol, 0);
  puts(w, EXIT_LABEL, view.cursor === -1 ? ATTR_HIGHLIGHT : ATTR_BG);
  return w;
}

function composePicker(view: PartyMemberPickerView): TileWindow {
  const w = createTileWindow({
    screenX: PICKER_SCREEN_X, screenY: PICKER_SCREEN_Y,
    widthCells: PICKER_W, heightCells: PICKER_H,
  });
  w.invertHighlight = true;
  clearWindow(w, 0x20, ATTR_BG);
  for (let s = 0; s < view.members.length; s++) {
    const cellX = (s % 2) * 9 + 2;
    const cellY = Math.floor(s / 2) + 1;
    const name = view.members[s]!.name.slice(0, NAME_WIDTH);
    const highlighted = s === view.cursor;
    setCursor(w, cellX, cellY);
    puts(w, name, highlighted ? ATTR_HIGHLIGHT : ATTR_BG);
  }
  return w;
}
```

> NOTE: the exact `titleCol`/`exitCol` are locked by the Task 5 pixel fixture — if the
> `*-exit` case is off by a column, adjust them until it is 0-diff against the engine.

- [ ] **Step 5: Run the test to confirm it passes.**

Run: `pnpm --filter @wiz6/viewer exec vitest run compose-party-member-picker-frame`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add packages/viewer/src/pages/castle/compose-party-member-picker-frame.ts \
        packages/viewer/tests/pages/castle/compose-party-member-picker-frame.test.ts
git commit -m "feat(castle): picker composer renders title + EXIT, cursor model, inverse highlight"
```

---

## Task 4: Rework the picker component (nav state machine + composite over castle)

**Files:**
- Rewrite: `packages/viewer/src/components/PartyMemberPicker.tsx`
- Test: `packages/viewer/tests/components/PartyMemberPicker.test.tsx`
- Verify: `packages/viewer/src/pages/castle/ReviewMemberPage.tsx`, `DismissMemberPage.tsx`

The component must own the new cursor model AND composite the picker over the castle frame
(mirroring `AddPartyPage`). Extract the nav reducer as a pure exported function so it can be
unit-tested without mounting.

- [ ] **Step 1: Write the failing nav-reducer test** (rewrite the file).

```ts
import { describe, it, expect } from 'vitest';
import { nextCursor } from '../../src/components/PartyMemberPicker.js';

// N = party size. cursor -1 = EXIT.
describe('nextCursor (picker nav)', () => {
  it('Down from EXIT goes to slot 0', () => {
    expect(nextCursor(-1, 'ArrowDown', 3)).toBe(0);
  });
  it('Down from slot 0 goes to slot 2 (next row, same column)', () => {
    expect(nextCursor(0, 'ArrowDown', 3)).toBe(2);
  });
  it('Down from the last member clamps (no wrap)', () => {
    expect(nextCursor(2, 'ArrowDown', 3)).toBe(2); // no slot 4
    expect(nextCursor(1, 'ArrowDown', 3)).toBe(1); // no slot 3
  });
  it('Up from the top member row returns to EXIT', () => {
    expect(nextCursor(0, 'ArrowUp', 3)).toBe(-1);
    expect(nextCursor(1, 'ArrowUp', 3)).toBe(-1);
  });
  it('Up from a lower row moves up a row', () => {
    expect(nextCursor(2, 'ArrowUp', 3)).toBe(0);
  });
  it('Right from even (left col) goes to the odd neighbour if present', () => {
    expect(nextCursor(0, 'ArrowRight', 3)).toBe(1);
    expect(nextCursor(2, 'ArrowRight', 3)).toBe(2); // no slot 3 → stay
  });
  it('Left from odd (right col) goes to the even neighbour', () => {
    expect(nextCursor(1, 'ArrowLeft', 3)).toBe(0);
  });
  it('Left/Right on EXIT and Right on odd are no-ops', () => {
    expect(nextCursor(-1, 'ArrowLeft', 3)).toBe(-1);
    expect(nextCursor(-1, 'ArrowRight', 3)).toBe(-1);
    expect(nextCursor(1, 'ArrowRight', 3)).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails.**

Run: `pnpm --filter @wiz6/viewer exec vitest run PartyMemberPicker`
Expected: FAIL (`nextCursor` not exported).

- [ ] **Step 3: Rewrite `PartyMemberPicker.tsx`.** Export `nextCursor`; own `cursor` state;
  load castle assets + compose `composeCastleFrame` then overlay the picker windows.

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PicSchema, WIZ6_MAIN,
  type ActivePartyMember, type Font, type Font4bpp, type Pic, type PortraitSet,
} from '@wiz6/data';
import {
  concatenatePicSegments, renderEgaScreen, renderTileWindow, visibleMenuOptions,
  type FontSet, type MainMenuContext,
} from '@wiz6/parser';
import { loadEgaScreen, loadFont, loadFont4bpp, loadPortraitSet } from '../data-loader.js';
import { CanvasPresenter } from '../lib/presenter.js';
import { composeCastleFrame } from '../pages/game/castle-frame.js';
import {
  composePartyMemberPickerFrame, type PartyMemberPickerView,
} from '../pages/castle/compose-party-member-picker-frame.js';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

/** Pure picker navigation. cursor -1 = EXIT; 0..N-1 = member. */
export function nextCursor(cursor: number, key: string, n: number): number {
  switch (key) {
    case 'ArrowDown':
      if (cursor === -1) return n > 0 ? 0 : -1;
      return cursor + 2 < n ? cursor + 2 : cursor;
    case 'ArrowUp':
      if (cursor < 0) return -1;
      return cursor >= 2 ? cursor - 2 : -1;
    case 'ArrowLeft':
      return cursor > 0 && cursor % 2 === 1 ? cursor - 1 : cursor;
    case 'ArrowRight':
      return cursor >= 0 && cursor % 2 === 0 && cursor + 1 < n ? cursor + 1 : cursor;
    default:
      return cursor;
  }
}

export interface PartyMemberPickerProps {
  title: string;
  members: ReadonlyArray<ActivePartyMember>;
  fontSet: FontSet;
  onCommit: (slotIndex: number) => void;
  onCancel: () => void;
  /** TEST ONLY: skip canvas mount + asset load. */
  skipCanvas?: boolean;
}

export function PartyMemberPicker({
  title, members, fontSet, onCommit, onCancel, skipCanvas = false,
}: PartyMemberPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cursor, setCursor] = useState(-1); // start on EXIT, per the engine

  // Castle scene assets (same set AddPartyPage loads).
  const [mon08Pic, setMon08Pic] = useState<Pic | null>(null);
  const [mon08Decoded, setMon08Decoded] = useState<number[] | null>(null);
  const [dragonscRgba, setDragonscRgba] = useState<Uint8ClampedArray | null>(null);
  const [wfont0, setWfont0] = useState<Font | null>(null);
  const [wfont1, setWfont1] = useState<Font4bpp | null>(null);
  const [wfont3, setWfont3] = useState<Font4bpp | null>(null);
  const [portraitSets, setPortraitSets] = useState<PortraitSet[]>([]);

  const visible = useMemo(() => {
    const ctx: MainMenuContext = { partySize: members.length, pcFileHasUnloadedChars: true };
    return visibleMenuOptions(ctx).filter((opt) => opt.slot !== 8);
  }, [members.length]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
        setCursor((c) => nextCursor(c, e.key, members.length));
        break;
      case 'Enter':
        setCursor((c) => { if (c === -1) onCancel(); else onCommit(c); return c; });
        break;
      case 'Escape':
        onCancel();
        break;
    }
  }, [members.length, onCommit, onCancel]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  useEffect(() => {
    if (skipCanvas) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/pics/mon08.json');
        if (res.ok && !cancelled) {
          const text = await res.text();
          if (!text.trimStart().startsWith('<')) {
            const pic = PicSchema.parse(JSON.parse(text));
            if (!cancelled) { setMon08Pic(pic); setMon08Decoded(concatenatePicSegments(pic.segments)); }
          }
        }
      } catch { /* leave null */ }
    })();
    loadEgaScreen('/screens/dragonsc.json').then((s) => !cancelled && setDragonscRgba(renderEgaScreen(s, WIZ6_MAIN).rgba)).catch(() => {});
    loadFont('/fonts/wfont0.json').then((f) => !cancelled && setWfont0(f)).catch(() => {});
    loadFont4bpp('/fonts/wfont1.json').then((f) => !cancelled && setWfont1(f)).catch(() => {});
    loadFont4bpp('/fonts/wfont3.json').then((f) => !cancelled && setWfont3(f)).catch(() => {});
    Promise.all([
      loadPortraitSet('/portraits/wport1.json'),
      loadPortraitSet('/portraits/wport2.json'),
      loadPortraitSet('/portraits/wport3.json'),
    ]).then((sets) => !cancelled && setPortraitSets(sets)).catch(() => {});
    return () => { cancelled = true; };
  }, [skipCanvas]);

  useEffect(() => {
    if (skipCanvas) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const presenter = new CanvasPresenter(canvas);
    // selectedIdx for composeCastleFrame: the picker's parent option (REVIEW/DISMISS)
    // is highlighted underneath, but the picker overlay covers the menu rows anyway.
    const buf = composeCastleFrame(
      0, dragonscRgba, mon08Pic, mon08Decoded, wfont3, wfont0,
      visible, 0, wfont1, members, portraitSets,
    );
    const view: PartyMemberPickerView = { title, members, cursor };
    for (const w of composePartyMemberPickerFrame(view)) {
      renderTileWindow(w, buf, ENGINE_W, ENGINE_H, fontSet, WIZ6_MAIN);
    }
    presenter.present(buf, ENGINE_W, ENGINE_H);
  }, [skipCanvas, title, members, cursor, fontSet, dragonscRgba, mon08Pic, mon08Decoded, wfont0, wfont1, wfont3, portraitSets, visible]);

  if (skipCanvas) return <div data-testid="party-member-picker-stub" />;
  return (
    <canvas
      ref={canvasRef}
      width={ENGINE_W}
      height={ENGINE_H}
      style={{ width: ENGINE_W * SCALE, height: ENGINE_H * SCALE, imageRendering: 'pixelated', background: '#000' }}
      aria-label="Pick a party member"
    />
  );
}
```

- [ ] **Step 4: Run the nav test to confirm it passes.**

Run: `pnpm --filter @wiz6/viewer exec vitest run PartyMemberPicker`
Expected: PASS.

- [ ] **Step 5: Fix the consumer pages.** `PartyMemberPicker` no longer takes a `palette` prop
  (it uses `WIZ6_MAIN` internally). In BOTH `ReviewMemberPage.tsx` and `DismissMemberPage.tsx`,
  remove the `palette={WIZ6_MAIN}` prop from the `<PartyMemberPicker .../>` usage (and the now-unused
  `WIZ6_MAIN` import if nothing else uses it). Leave `title`, `members`, `fontSet`, `onCommit`,
  `onCancel` as-is.

- [ ] **Step 6: Typecheck + run the viewer suite.**

Run: `pnpm --filter @wiz6/viewer exec tsc --noEmit && pnpm --filter @wiz6/viewer exec vitest run PartyMemberPicker compose-party-member-picker-frame`
Expected: no tsc errors; tests PASS.

- [ ] **Step 7: Commit.**

```bash
git add packages/viewer/src/components/PartyMemberPicker.tsx \
        packages/viewer/tests/components/PartyMemberPicker.test.tsx \
        packages/viewer/src/pages/castle/ReviewMemberPage.tsx \
        packages/viewer/src/pages/castle/DismissMemberPage.tsx
git commit -m "feat(castle): picker cursor=-1 starts on EXIT, composites over castle frame"
```

---

## Task 5: Pixel-parity tests (4, tolerance 0)

**Files:**
- Create: `tools/parity/party-member-picker-parity.test.ts`

Compose the FULL screen (castle frame + picker overlay) and diff against each fixture. Model
the test on `tools/parity/castle-parity.test.ts` (asset loading, `engineRgba`, `compareRgba`).
The 3 members MUST match the captured fixtures' characters — use the data recorded in Task 2.

- [ ] **Step 1: Write the parity test.** Fill the `MEMBERS` constants from the Task 2 dump.

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PicSchema, EgaScreenSchema, Font4bppSchema, FontSchema, PortraitSetSchema,
  WIZ6_MAIN, type ActivePartyMember,
} from '@wiz6/data';
import {
  concatenatePicSegments, renderEgaScreen, renderTileWindow, visibleMenuOptions,
  compareRgba, type MainMenuContext,
} from '@wiz6/parser';
import { composeCastleFrame } from '../../packages/viewer/src/pages/game/castle-frame.js';
import { composePartyMemberPickerFrame } from '../../packages/viewer/src/pages/castle/compose-party-member-picker-frame.js';
import { loadCreationFontSet } from '../../packages/viewer/src/pages/roster/creation/ega/assets.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES = join(ROOT, 'tools', 'parity', 'fixtures', 'engine');
const ENGINE_W = 320, ENGINE_H = 200;

// Members captured from the engine save in Task 2 (THESUS/TEMPEST/LYSANDR, slots 0..2).
// Fill portraitIndex/hp/stamina/age/class/race/sex from the dosbox_read_struct dump.
const MEMBERS: ActivePartyMember[] = [
  // { name: 'THESUS', portraitIndex: <n>, hpCurrent: ..., hpMax: ..., staminaCurrent: ..., staminaMax: ..., age: ..., ... },
  // ... (3 entries)
];

function engineRgba(name: string): Uint8ClampedArray {
  const idx = gunzipSync(readFileSync(join(FIXTURES, `${name}.idx.gz`)));
  const rgba = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
  for (let i = 0; i < idx.length; i++) {
    const [r, g, b] = WIZ6_MAIN[idx[i]!]!;
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

const CASES = [
  { fixture: 'review-who-exit', title: 'REVIEW WHO?', cursor: -1 },
  { fixture: 'review-who-member', title: 'REVIEW WHO?', cursor: 0 },
  { fixture: 'dismiss-who-exit', title: 'DISMISS WHO?', cursor: -1 },
  { fixture: 'dismiss-who-member', title: 'DISMISS WHO?', cursor: 0 },
] as const;

describe('party-member picker pixel-parity', () => {
  let assets: Awaited<ReturnType<typeof loadAll>>;
  async function loadAll() {
    const p = (rel: string) => join(ROOT, 'extracted', rel);
    const mon08 = PicSchema.parse(JSON.parse(readFileSync(p('pics/mon08.json'), 'utf-8')));
    const dragonsc = EgaScreenSchema.parse(JSON.parse(readFileSync(p('screens/dragonsc.json'), 'utf-8')));
    return {
      mon08, mon08Decoded: concatenatePicSegments(mon08.segments),
      dragonscRgba: renderEgaScreen(dragonsc, WIZ6_MAIN).rgba,
      wfont0: FontSchema.parse(JSON.parse(readFileSync(p('fonts/wfont0.json'), 'utf-8'))),
      wfont1: Font4bppSchema.parse(JSON.parse(readFileSync(p('fonts/wfont1.json'), 'utf-8'))),
      wfont3: Font4bppSchema.parse(JSON.parse(readFileSync(p('fonts/wfont3.json'), 'utf-8'))),
      portraitSets: [1, 2, 3].map((n) => PortraitSetSchema.parse(JSON.parse(readFileSync(p(`portraits/wport${n}.json`), 'utf-8')))),
      fontSet: await loadCreationFontSet(),
    };
  }
  beforeAll(async () => { assets = await loadAll(); });

  for (const c of CASES) {
    it(`${c.fixture}: RGB match = 100% (tolerance 0)`, () => {
      const ctx: MainMenuContext = { partySize: MEMBERS.length, pcFileHasUnloadedChars: true };
      const visible = visibleMenuOptions(ctx).filter((o) => o.slot !== 8);
      const buf = composeCastleFrame(
        0, assets.dragonscRgba, assets.mon08, assets.mon08Decoded, assets.wfont3, assets.wfont0,
        visible, 0, assets.wfont1, MEMBERS, assets.portraitSets,
      );
      for (const w of composePartyMemberPickerFrame({ title: c.title, members: MEMBERS, cursor: c.cursor })) {
        renderTileWindow(w, buf, ENGINE_W, ENGINE_H, assets.fontSet, WIZ6_MAIN);
      }
      const result = compareRgba(buf, engineRgba(c.fixture), { tolerance: 0 });
      expect(result.matchPct, `${c.fixture}: ${result.matchPct.toFixed(2)}% (${result.diffCount} px diff)`).toBe(100);
    });
  }
});
```

- [ ] **Step 2: Run the parity tests.**

Run: `pnpm --filter @wiz6/parity exec vitest run party-member-picker-parity`
Expected: ideally 4 PASS. If a case is <100%, the diff count points at the cause — most likely
`titleCol`/`exitCol` in the composer (Task 3) or the bottom-right fill of the picker panel.
Iterate on the composer until 0-diff. **Do not lower the tolerance** — fix the render. If the
engine fills the bottom-right region (cols 19-39, rows 19-23) with chrome we don't emit, add
that fill to the composer (compare against the `.png`).

- [ ] **Step 3: Commit.**

```bash
git add tools/parity/party-member-picker-parity.test.ts
git commit -m "test(parity): 4 pixel-parity gates for REVIEW/DISMISS WHO? (EXIT + member, tol 0)"
```

---

## Task 6: Browser e2e — picker canvas assertion

**Files:**
- Modify: `packages/viewer/e2e/review-member-flow.spec.ts`

Add a drive that injects a known 3-member active party, navigates to REVIEW WHO?, and asserts
the canvas matches `review-who-exit`, then drives `Down` and asserts `review-who-member`.

- [ ] **Step 1: Read the existing spec** to reuse its helpers (`gotoCastle`/state injection,
  `pressKeys`, `expectCanvasMatchesFixture`). Mirror how `creation-spell-pick.spec.ts` injects
  state + asserts a fixture.

- [ ] **Step 2: Add the test** (adapt selectors/injection to the existing harness):

```ts
test('REVIEW WHO? picker matches engine (EXIT then member highlighted)', async ({ page }) => {
  // Inject a 3-member active party matching the fixture (THESUS/TEMPEST/LYSANDR),
  // navigate to /castle/review-member, then assert.
  await gotoReviewPicker(page, threeMemberParty); // helper: sets localStorage active-party + navigates
  await expectCanvasMatchesFixture(page, 'review-who-exit');
  await pressKeys(page, ['ArrowDown']);
  await expectCanvasMatchesFixture(page, 'review-who-member');
});
```

- [ ] **Step 3: Run the e2e spec.**

Run: `pnpm --filter @wiz6/viewer test:e2e review-member-flow`
Expected: PASS. (Requires `playwright install chromium` once.)

- [ ] **Step 4: Commit.**

```bash
git add packages/viewer/e2e/review-member-flow.spec.ts
git commit -m "test(e2e): drive REVIEW WHO? picker, assert EXIT + member fixtures"
```

---

## Task 7: Close TODO #058 + record the correction

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Delete the `#058` entry** (per the convention, closed items are deleted; git
  preserves them). Its premise (switch to column-major) was wrong — the engine is row-major.

- [ ] **Step 2: Add a `superseded_by`/note to the RE finding** if helpful: in
  `docs/re/findings/wbase-party-pickers-and-dismiss.json`, the `picker-input-loop-keymap`
  finding's open question ("does the picker return -1 on UP-from-row-0 then ENTER?") is now
  answered (yes — verified by driving). Add a one-line `"verified_by": "live capture 2026-06-01: Up from top member row → EXIT (-1); Enter on EXIT cancels"` note to that finding object.

- [ ] **Step 3: Commit.**

```bash
git add TODO.md docs/re/findings/wbase-party-pickers-and-dismiss.json
git commit -m "docs: close #058 (engine picker is row-major, not column-major); confirm keymap"
```

---

## Final verification

- [ ] Run the full gate: `pnpm --filter @wiz6/viewer exec tsc --noEmit && pnpm --filter @wiz6/viewer exec vitest run && pnpm --filter @wiz6/parity exec vitest run && pnpm --filter @wiz6/viewer test:e2e review-member-flow`
- [ ] Manual smoke: `pnpm dev:viewer`, add ≥2 members, REVIEW MEMBER → confirm EXIT-first
  cursor, Up/Down/Left/Right match the engine, the castle scene shows behind the picker, EXIT
  cancels. Repeat for DISMISS MEMBER.
- [ ] All 4 picker parity cases at 100% (tolerance 0).
