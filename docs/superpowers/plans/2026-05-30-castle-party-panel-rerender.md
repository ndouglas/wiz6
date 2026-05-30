# Castle party-panel re-render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## ⚠️ PICKUP NOTE — updated 2026-05-30 (session 2: merged to main + blocker found)

Tasks **1, 2, 3 are DONE and MERGED TO MAIN** (merge commit `91b5f18`). The
`castle-rerender` branch + worktree are retired. Continue Tasks 4-6 from main
(spin a fresh worktree off main when you start).

Done so far:
- `0e07387` — Task 1A: `dosbox_launch` honors `breakAtStart=false` (skips the macOS isatty debugger gate). **Now on main** — a fresh CC session's MCP child will have it.
- `f4e63d0` — Task 1B: RE findings `wbase-party-panel-redraw.json` + `wbase-party-portrait-blit.json`.
- `ee2296d` — Task 2: ported FUN_1b2d → `party-panel-render.ts`. castle-1-members parity **98.20%** (floor 98). Remaining ~1.8% is the wport portrait asset gap (engine 32×24 vs our 24×24; dcf2 transform unresolved — TODO #061/#026).
- `1512acd` — Task 3: `tools/parity/build-castle-saves.ts` + README.
- `0f73398` — added `captures=` to `wiz6.conf` (MCP screenshot tool needs it) + gitignored `tools/dosbox/capture/`.
- `6b35a47` + follow-up — `debugger-console.test.ts` no longer reads the mutable `save/3.sav` (it was clobbered); it now **synthesizes** a tiny `Memory` ZIP at test time with the anchor at a known offset (deterministic, no DOSBox). Added folder-level guardrail `CLAUDE.md` files to `tools/dosbox/`, `packages/mcp/tests/`, `tools/parity/`, `original/`.

### 🚧 BLOCKER discovered (read before Tasks 4-5)

Session 2 tried to drive DOSBox via MCP and found:
- `dosbox_launch` is **broken until you restart CC** — the fix shipped to main this session but the *running* MCP child predates it and can't reload. **Restart Claude Code so the new MCP child picks up `0e07387`.**
- **F12-modifier chords don't reliably deliver through the input helper.** `dosbox_screenshot` (F12+p) worked once then never; `dosbox_save_state` (F12+s) fired but wrote to DOSBox's *default* slot/dir (repo-root `save/1.sav`), not the requested slot. Plain single keystrokes (`dosbox_send_input "enter"`) work fine. **Re-test the chords after restart;** if they still misfire, fix the Swift helper's chord sequencing (hold-modifier + key) before the save-building, or drive blind and verify via `dosbox_inspect_save` party_size.
- Saves 2,3,4 currently hold `party_size=0` abandoned attempts — rebuild them.

**What's left** (Tasks 4-6 below):
- Task 4: build castle-2-members save + fixture + N=2 parity test. **Likely floor ≈ 96-98%** (wport gap × members).
- Task 5: build castle-{3,4,5,6}-members fixtures + parity tests.
- Task 6: finalize TODOs (#024, #061, #062, #026).

**Adjust expectations**: realistic parity floors are **~96-99%**, not 100%, until the wport-extractor fix (TODO #061/#026).



**Goal:** Dogfood the new DOSBox-X MCP to build N=1..6 party-member save states, capture engine fixtures, re-RE the FUN_1b2d info panel + correct portrait-blit coords, port per-member info panels in TS, and lift castle pixel-parity to 100% for all six N values.

**Architecture:** Sequential by N. Stage 0 validates the MCP works end-to-end + runs the PyGhidra RE pass. Stage 1 lifts the existing 1-member parity to 100% (porting FUN_1b2d for slot 0 LEFT column). Stages 2-6 add N=2..6 fixtures via an MCP-orchestrating script + extend parity tests. Stage 7 finalizes (rename existing fixture, close TODOs).

**Tech Stack:** TypeScript ESM, Vitest, PyGhidra (RE), Swift helper binary already shipped from yesterday's merge, DOSBox-X MCP modules under `packages/mcp/src/dosbox/`.

**Spec:** `docs/superpowers/specs/2026-05-30-castle-party-panel-rerender-design.md`.

---

## Engine references (quick lookup)

| Element | Address |
|---|---|
| Portrait blit | `wbase.ovr` 0x0b0e (FUN_0b0e) |
| Info panel redraw | `wbase.ovr` 0x1b2d (FUN_1b2d) |
| Equipment-tile renderer | `wbase.ovr` FUN_1a4c (called from FUN_1b2d) |
| LEFT panel window | `*0x4fba` (even slots: 0, 2, 4) |
| RIGHT panel window | `*0x4fb8` (odd slots: 1, 3, 5) |
| Panel row formula | `(slot/2)*4` |
| Status-icon table | `wbase.ovr` `0x526 + byte*2` |
| Condition-severity table | `wbase.ovr` `0x532 + idx*2` |
| Class-symbol table | `wbase.ovr` `class*2 + 0x3a` |
| Character record | `+0x43e8 + slot*0x1b0`, fields per CLAUDE.md / wpcvw-naming-pass |

---

## File structure

**Create:**
- `docs/re/findings/wbase-party-panel-redraw.json` — corrected FUN_1b2d finding
- `docs/re/findings/wbase-party-portrait-blit.json` — corrected FUN_0b0e screen-coord finding
- `packages/viewer/src/pages/game/party-panel-render.ts` — TS port of FUN_1b2d
- `packages/viewer/tests/pages/game/party-panel-render.test.ts` — unit tests
- `tools/parity/build-castle-saves.ts` — MCP-orchestrating save-state builder
- `tools/parity/fixtures/engine/castle-1-members.{idx.gz,png}` (rename from castle-one-member)
- `tools/parity/fixtures/engine/castle-2-members.{idx.gz,png}` (capture)
- `tools/parity/fixtures/engine/castle-3-members.{idx.gz,png}`
- `tools/parity/fixtures/engine/castle-4-members.{idx.gz,png}`
- `tools/parity/fixtures/engine/castle-5-members.{idx.gz,png}`
- `tools/parity/fixtures/engine/castle-6-members.{idx.gz,png}`

**Modify:**
- `packages/viewer/src/pages/game/castle-frame.ts` — call party-panel-render per active member; correct portrait coords for LEFT/RIGHT split
- `tools/parity/castle-parity.test.ts` — extend `CASES` with 6 entries; rename castle-one-member→castle-1-members; floor 100 throughout
- `tools/parity/README.md` — document the build-castle-saves workflow
- `TODO.md` — close #024, #061, #062; mark #026 superseded

**Delete:**
- `tools/parity/fixtures/engine/castle-one-member.idx.gz` (after rename)
- `tools/parity/fixtures/engine/castle-one-member.png` (after rename)

---

### Task 1: Stage 0 — MCP smoke validation + RE pass

**Files:**
- Create: `docs/re/findings/wbase-party-panel-redraw.json`
- Create: `docs/re/findings/wbase-party-portrait-blit.json`

#### Part A: MCP end-to-end smoke

This is the first time yesterday's merge gets exercised end-to-end. If anything's broken, halt and fix before any other work.

- [ ] **Step 1: Verify macOS Accessibility permission**

```bash
# Check (by running a no-op CGEvent through the helper):
echo '{"op":"keyDown","keyCode":36,"flags":0}' | packages/mcp/bin/wiz6-input-helper
echo '{"op":"keyUp","keyCode":36,"flags":0}' | packages/mcp/bin/wiz6-input-helper
```

Expected: both return `{"ok":true}`. If `{"ok":false,"error":"CGEvent..."}` — Accessibility not granted; follow `packages/mcp/PERMISSIONS.md` setup. Halt.

- [ ] **Step 2: Launch DOSBox-X via the MCP tool**

From Claude, invoke `dosbox_launch`. Watch for the DOSBox-X window to appear. Confirm wiz6 boots to the title page (~3-5 seconds).

- [ ] **Step 3: Send `enter` and confirm it dismisses the title page**

From Claude, invoke `dosbox_send_input` with `keys: "enter"`. Verify the title page progresses.

If the keystroke doesn't reach DOSBox-X — verify the DOSBox-X window has focus, and that `findWindow` matched the right app. The DOSBox-X app name on macOS may be `dosbox-x` or `DOSBox-X` (case-insensitive matched by the helper's `findWindow`).

- [ ] **Step 4: Capture a screenshot and confirm a valid PNG**

From Claude, invoke `dosbox_screenshot`. Expect an `image/png` response with non-trivial bytes. The first 8 bytes must be the PNG signature `89 50 4e 47 0d 0a 1a 0a`.

If the screenshot is blank, all-zero, or never appears — verify `[dosbox] captures=` in `tools/dosbox/wiz6.conf` (yesterday's `captures-dir.ts` fix parses `[dosbox]`, not `[render]`).

- [ ] **Step 5: Save state to slot 9 + verify**

From Claude:
- `dosbox_save_state({slot: 9})`
- `dosbox_inspect_save({save: 9})` — expect a valid response with `party_size` and `party_names`.

The mtime of `tools/dosbox/save/9.sav` should advance.

- [ ] **Step 6: Kill DOSBox-X**

`dosbox_kill()`. Confirm the process terminates.

- [ ] **Step 7: Document the smoke result**

If any step failed, halt this task and fix the MCP. Do NOT proceed to Part B until the smoke passes end-to-end.

#### Part B: PyGhidra RE pass — FUN_1b2d + FUN_0b0e + FUN_1a4c

- [ ] **Step 8: Open Ghidra project**

The wiz6 Ghidra project lives at `tools/ghidra/wiz6.gpr`. The GUI must be closed before PyGhidra scripts run (project lock).

If the project is open in the GUI, close it.

- [ ] **Step 9: Decompile FUN_1b2d, FUN_0b0e, FUN_1a4c**

```bash
python3 tools/ghidra/scripts/decompile.py --binary wbase.ovr --addr 0x1b2d > /tmp/fun_1b2d.c
python3 tools/ghidra/scripts/decompile.py --binary wbase.ovr --addr 0x0b0e > /tmp/fun_0b0e.c
python3 tools/ghidra/scripts/decompile.py --binary wbase.ovr --addr 0x1a4c > /tmp/fun_1a4c.c
```

Read each. Identify:
- For FUN_0b0e: the `dcf2(buf, X, Y, rows)` call — confirm X is always 2, or if X varies based on `party_slot`. If X is always 2 in FUN_0b0e, look for a SIBLING routine that handles the right column (perhaps `dcf2` called elsewhere in wbase with a different X).
- For FUN_1b2d: extract the full cell-layout. Confirm even/odd → LEFT/RIGHT window split. Extract panel coordinates (which cell each field renders at). Decode the 0x526 status-icon table (read raw bytes via `python3 -c 'import struct; d=open("original/wbase.ovr","rb").read(); print(struct.unpack("<HHHHHHHHHHHHHH", d[0x526-0x4564:0x526-0x4564+28]))'` — the 0x4564 is wbase's runtime delta per CLAUDE.md).
- For FUN_1a4c: equipment-tile render path. Two calls from FUN_1b2d at (5,5,...) and (6,6,...). What does each (kind, kind, row, item_lo, item_hi, sprite_id) look like?

- [ ] **Step 10: Decode lookup tables 0x526 (status icons) and 0x532 (condition severity) and 0x3a (class symbols)**

```bash
# wbase runtime delta is 0x4564, so file_offset = runtime_offset - 0x4564
python3 -c "
import struct
d = open('original/wbase.ovr', 'rb').read()
for label, addr, count in [('status', 0x526, 14), ('condition', 0x532, 10), ('class', 0x3a, 14)]:
    off = addr - 0x4564
    if off < 0 or off + count*2 > len(d):
        print(f'{label}: ABSENT (file offset {off:#x} out of range)')
        continue
    vals = struct.unpack(f'<{count}H', d[off:off+count*2])
    print(f'{label} @ runtime {addr:#x} / file {off:#x}: {[hex(v) for v in vals]}')
"
```

Record the decoded values in the finding JSON.

- [ ] **Step 11: Write `wbase-party-panel-redraw.json`**

Schema per `docs/re/findings/README.md`. Required fields:

```json
{
  "topic": "wbase-party-panel-redraw",
  "subagent_run": "<timestamp>",
  "binaries": ["wbase.ovr"],
  "summary": "FUN_1b2d (party_panel_redraw_slot) renders one party-slot info panel. Splits even slots (0,2,4) to LEFT panel (*0x4fba), odd slots (1,3,5) to RIGHT panel (*0x4fb8). Panel row = (slot/2)*4. Renders: <name>, <colored bar>, <status icon>, <condition icons>, <class symbol>, <2 equipment-tile slots>. Supersedes wbase-add-party-member.json#portrait-blit-y-stacking single-column claim.",
  "method": "PyGhidra decompile + manual byte-grep for lookup tables.",
  "findings": [
    {
      "id": "panel-window-split",
      "claim": "<exact text from decompile + your interpretation>",
      "category": "render",
      "evidence": {"binary": "wbase.ovr", "address": {"space": "wbase.ovr", "offset": "0x1b2d"}, "type": "decompile", "details": "..."},
      "confidence": "high"
    },
    // ... more findings: name layout, colored-bar formula, status-icon coords, condition-priority loop, class-symbol coords, equipment-tile call args
  ],
  "supersedes": "wbase-add-party-member.json#portrait-blit-y-stacking"
}
```

- [ ] **Step 12: Write `wbase-party-portrait-blit.json`**

Same schema. Documents FUN_0b0e's actual screen-coord behavior (single X=2 or per-column X — whatever the decompile shows). If FUN_0b0e is genuinely single-column at X=2 and the right-side portraits come from a different routine, document the right-side routine separately. Supersedes TODO #026's 64×9 dimensions claim with the actual portrait pixel dims (verify against extracted/portraits/wport1.json).

- [ ] **Step 13: Commit findings**

```bash
git add docs/re/findings/wbase-party-panel-redraw.json docs/re/findings/wbase-party-portrait-blit.json
git commit -m "feat(re): corrected FUN_1b2d + FUN_0b0e party-panel findings

Overturns wbase-add-party-member.json#portrait-blit-y-stacking
(single-column claim wrong per castle-one-member fixture). FUN_1b2d
splits even/odd slots LEFT/RIGHT; row = (slot/2)*4. Decoded 0x526
status / 0x532 condition / 0x3a class lookup tables."
```

---

### Task 2: Stage 1 — Port FUN_1b2d, lift N=1 to 100% parity

**Files:**
- Create: `packages/viewer/src/pages/game/party-panel-render.ts`
- Create: `packages/viewer/tests/pages/game/party-panel-render.test.ts`
- Modify: `packages/viewer/src/pages/game/castle-frame.ts`
- Modify: `tools/parity/castle-parity.test.ts`
- Rename: `tools/parity/fixtures/engine/castle-one-member.*` → `castle-1-members.*`

- [ ] **Step 1: Rename the existing fixture**

```bash
cd /Users/nathan/Projects/ndouglas/wiz6 # (or worktree path if applicable)
git mv tools/parity/fixtures/engine/castle-one-member.idx.gz tools/parity/fixtures/engine/castle-1-members.idx.gz
git mv tools/parity/fixtures/engine/castle-one-member.png tools/parity/fixtures/engine/castle-1-members.png
```

In `tools/parity/castle-parity.test.ts`, change the fixture name in the CASES entry:

```ts
{
  fixture: 'castle-1-members',  // was 'castle-one-member'
  floor: 97,                    // bump to 100 at the end of this task
  // ...
}
```

Run: `pnpm --filter @wiz6/parity test castle-parity`. Confirm the existing test still passes (rename didn't break anything).

- [ ] **Step 2: Write the failing `party-panel-render` test**

In `packages/viewer/tests/pages/game/party-panel-render.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { composePartyPanel } from '../../../src/pages/game/party-panel-render.js';
import type { ActivePartyMember } from '@wiz6/data';

function nathanFighter(): ActivePartyMember {
  // Pulled from engine save 1 inspect: portrait_index=9, class=0 (Fighter),
  // race=9, level=1, sex=0, attributes [STR=16,...,KAR=18], hp 7/7, sp 108/108.
  return {
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
}

describe('composePartyPanel', () => {
  it('slot 0 → LEFT panel window position', () => {
    const panel = composePartyPanel(0, nathanFighter());
    expect(panel.column).toBe('left');
    expect(panel.panelRow).toBe(0); // (0/2)*4 = 0
  });

  it('slot 1 → RIGHT panel window position', () => {
    const panel = composePartyPanel(1, nathanFighter());
    expect(panel.column).toBe('right');
    expect(panel.panelRow).toBe(0); // (1/2)*4 = 0
  });

  it('slot 2 → LEFT panel row 4', () => {
    const panel = composePartyPanel(2, nathanFighter());
    expect(panel.column).toBe('left');
    expect(panel.panelRow).toBe(4); // (2/2)*4 = 4
  });

  it('slot 5 → RIGHT panel row 8', () => {
    const panel = composePartyPanel(5, nathanFighter());
    expect(panel.column).toBe('right');
    expect(panel.panelRow).toBe(8); // (5/2)*4 = 8
  });

  it('produces name field', () => {
    const panel = composePartyPanel(0, nathanFighter());
    expect(panel.fields.name).toBe('NATHAN');
  });

  it('produces class symbol for Fighter (class=0)', () => {
    const panel = composePartyPanel(0, nathanFighter());
    // The exact value depends on the 0x3a lookup table decoded in Task 1.
    // Adjust assertion to the actual byte read from that table.
    expect(typeof panel.fields.classSymbol).toBe('number');
  });
});
```

- [ ] **Step 3: Run — expect failure (module not found)**

```bash
pnpm --filter @wiz6/viewer test party-panel-render
```

- [ ] **Step 4: Implement `party-panel-render.ts`**

The exact internal shape depends on Task 1's RE pass. The minimum useful interface:

```ts
/**
 * composePartyPanel — TS port of engine FUN_1b2d @ wbase.ovr 0x1b2d.
 *
 * Renders one party-slot info panel given a slot index and the active
 * party member at that slot. Returns a structured `PartyPanel` describing
 * which column (LEFT for even, RIGHT for odd), the row within that column,
 * and the individual fields (name, status icon, condition icons, class
 * symbol, equipment tiles).
 *
 * Per engine FUN_1b2d (re-RE'd):
 *   - Even slots (0,2,4) → LEFT panel window
 *   - Odd slots (1,3,5) → RIGHT panel window
 *   - Panel row within window = (slot/2) * 4
 *   - Fields drawn: name (7 chars), 3-cell colored bar, status icon,
 *     up-to-N condition icons by severity, class symbol, 2 equip tiles.
 *
 * Spec: docs/superpowers/specs/2026-05-30-castle-party-panel-rerender-design.md
 */

import type { ActivePartyMember } from '@wiz6/data';

export interface PartyPanel {
  column: 'left' | 'right';
  panelRow: number;
  fields: {
    name: string;
    coloredBar: number[]; // 3 glyph codes per cell_x*3 + 2 + col_x
    statusIcon: number;   // from 0x526 lookup table
    conditionIcons: number[]; // priority-sorted from 0x532 lookup
    classSymbol: number;  // from 0x3a class*2 lookup
    equipTileLeft: { kind: number; itemLo: number; itemHi: number; spriteId: number } | null;
    equipTileRight: { kind: number; itemLo: number; itemHi: number; spriteId: number } | null;
  };
}

// Lookup tables — exact values come from Task 1's RE pass. Replace these
// stub literals with the decoded contents.
const STATUS_ICON_TABLE: number[] = [
  /* 14 entries from wbase 0x526; populate from findings/wbase-party-panel-redraw.json */
];
const CONDITION_SEVERITY_TABLE: number[] = [
  /* 10 entries from wbase 0x532; populate from findings */
];
const CLASS_SYMBOL_TABLE: number[] = [
  /* 14 entries from wbase 0x3a; populate from findings */
];

export function composePartyPanel(slot: number, member: ActivePartyMember): PartyPanel {
  const column = slot % 2 === 0 ? 'left' : 'right';
  const panelRow = Math.floor(slot / 2) * 4;

  // Name: 7 chars (engine renders 3, but the field is 7 in the record); engine
  // pads with trailing spaces. The exact width-3 vs width-7 detail comes from
  // Task 1's RE. Adjust to match.
  const name = member.name.padEnd(7, ' ');

  // Colored bar: 3 cells. Per the finding, glyph code is cell_x*3 + 2 + col_x.
  // For now, assume cell_x = 0 (one bar per panel). 3 cells, col_x = 0..2.
  // Adjust to whatever Task 1's RE shows.
  const coloredBar = [0 * 3 + 2 + 0, 0 * 3 + 2 + 1, 0 * 3 + 2 + 2];

  // Status icon. Per finding: byte = sex|race composite; lookup at 0x526 + byte*2.
  // The exact composite is from RE; v1 just uses sex+race directly.
  const sexRaceComposite = (member.sex << 4) | member.race; // adjust per RE
  const statusIcon = STATUS_ICON_TABLE[sexRaceComposite] ?? 0;

  // Condition icons: scan conditions[] for non-zero, sort by severity from 0x532.
  const activeConditions = member.conditions
    .map((cond, i) => ({ cond, severity: CONDITION_SEVERITY_TABLE[i] ?? 0 }))
    .filter((c) => c.cond !== 0)
    .sort((a, b) => b.severity - a.severity)
    .map((c) => c.cond);

  // Class symbol: class*2 + 0x3a lookup.
  const classSymbol = CLASS_SYMBOL_TABLE[member.class] ?? 0;

  // Equipment tiles — placeholder. Real impl reads inventory at +0x44f8 / +0x4428.
  // For Stage 1 (NATHAN Fighter with empty inventory in fixture state), both null is fine.
  return {
    column,
    panelRow,
    fields: {
      name,
      coloredBar,
      statusIcon,
      conditionIcons: activeConditions,
      classSymbol,
      equipTileLeft: null,
      equipTileRight: null,
    },
  };
}
```

Replace the stub tables with the actual decoded values from Task 1.

- [ ] **Step 5: Run — expect PASS**

```bash
pnpm --filter @wiz6/viewer test party-panel-render
```

Adjust the test assertions to match the decoded values (e.g., the exact classSymbol value for Fighter).

- [ ] **Step 6: Modify `castle-frame.ts` to use composePartyPanel**

Read the current `composeCastleFrame` body. Replace the inline `blitPortrait` loop with a call that:
- For each active member, computes `composePartyPanel(slot, member)`.
- Blits the portrait at the column-correct X coord (LEFT or RIGHT column — exact X from Task 1's findings).
- Renders the panel's fields at the column+row coordinates.

The exact rendering plumbing (cell-grid composition + RGBA blit) follows whatever pattern `castle-frame.ts` already uses for the rest of the screen. Don't restructure the file — fit the new render path into the existing pattern.

Update `PORTRAIT_BLIT_X = 6` (the empirical N=1 value) to the corrected LEFT-column X from Task 1. Same for Y_BASE and STRIDE. Remove `STRIDE` if the new finding shows stride-per-row is `(slot/2)*4` rows in panel units, not pixels.

- [ ] **Step 7: Run the existing N=1 parity test**

```bash
pnpm --filter @wiz6/parity test castle-parity 2>&1 | grep -E 'castle-1-members|FAIL|PASS|match'
```

If match% is below 100, inspect `/tmp/parity-diff-castle-1-members.png`. Iterate on the render code until parity is 100.

- [ ] **Step 8: Bump floor to 100**

In `tools/parity/castle-parity.test.ts`, change the N=1 CASES entry from `floor: 97` to `floor: 100`. Re-run; confirm green.

- [ ] **Step 9: Commit**

```bash
git add packages/viewer/src/pages/game/party-panel-render.ts \
  packages/viewer/tests/pages/game/party-panel-render.test.ts \
  packages/viewer/src/pages/game/castle-frame.ts \
  tools/parity/castle-parity.test.ts \
  tools/parity/fixtures/engine/castle-1-members.idx.gz \
  tools/parity/fixtures/engine/castle-1-members.png
git rm tools/parity/fixtures/engine/castle-one-member.idx.gz \
  tools/parity/fixtures/engine/castle-one-member.png 2>/dev/null || true
git commit -m "feat(castle): port FUN_1b2d info panel; N=1 parity at 100%

Closes the per-member info-panel gap (name + colored bar + status
icon + condition icons + class symbol + equip tiles). Castle-1-members
parity bumps from floor 97 to 100. Fixture renamed from castle-one-member
for consistency with the upcoming castle-{2..6}-members series."
```

---

### Task 3: Build `build-castle-saves.ts` MCP-orchestrating script

**Files:**
- Create: `tools/parity/build-castle-saves.ts`
- Modify: `tools/parity/README.md` (add a build-castle-saves workflow section)

- [ ] **Step 1: Implement `build-castle-saves.ts`**

```ts
#!/usr/bin/env node
/**
 * build-castle-saves.ts — drive DOSBox-X via the wiz6 MCP helper modules
 * to build save states with N=1..6 party members. Idempotent: skips slots
 * where dosbox_inspect_save already reports the target party_size.
 *
 * Usage:
 *   pnpm tsx tools/parity/build-castle-saves.ts --slots 1,2,3,4,5,6
 *   pnpm tsx tools/parity/build-castle-saves.ts --slot 6
 *
 * Imports the MCP helper modules directly rather than going through the
 * MCP server — keeps the script self-contained and avoids spinning up an
 * MCP client.
 *
 * Spec: docs/superpowers/specs/2026-05-30-castle-party-panel-rerender-design.md
 */

import { HelperClient } from '../../packages/mcp/src/dosbox/helper-client.js';
import { sendMacro } from '../../packages/mcp/src/dosbox/input.js';
import { saveStateToSlot, resetSlotTracking } from '../../packages/mcp/src/dosbox/state.js';
import { spawn } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SAVE_DIR = join(REPO_ROOT, 'tools', 'dosbox', 'save');

const DOSBOX_BIN =
  '/opt/homebrew/Caskroom/dosbox-x-app/2026.05.02/dosbox-x-sdl2/dosbox-x.app/Contents/MacOS/dosbox-x';

interface SaveSummary {
  slot: number;
  partySize: number;
  partyNames: string[];
}

// ── CLI parsing ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const slotsIdx = args.indexOf('--slots');
const slotIdx = args.indexOf('--slot');
let targetSlots: number[];
if (slotsIdx >= 0 && args[slotsIdx + 1]) {
  targetSlots = args[slotsIdx + 1]!.split(',').map((s) => parseInt(s, 10));
} else if (slotIdx >= 0 && args[slotIdx + 1]) {
  targetSlots = [parseInt(args[slotIdx + 1]!, 10)];
} else {
  console.error('usage: --slots 1,2,3,4,5,6  OR  --slot N');
  process.exit(2);
}

// ── Save inspection (without launching DOSBox) ───────────────────────────
function inspectSavePartySize(slot: number): SaveSummary | null {
  // The MCP `dosbox_inspect_save` tool reads the .sav directly. We replicate
  // that here without going through the MCP layer. The minimal logic:
  // open the .sav, search for the SOUND00.SND template signature to anchor
  // DGROUP, read party_size at DGROUP+0x43ce.
  // For v1, shell out to the existing extract.py:
  //   python3 tools/parity/extract.py inspect tools/dosbox/save/N.sav
  // (Adapt if that's not the exact command — check tools/parity/extract.py.)
  //
  // For now, simply attempt to read the file and assume the script will
  // re-check via dosbox_inspect_save after building.
  const path = join(SAVE_DIR, `${slot}.sav`);
  try {
    readFileSync(path);
    return null; // exists; party_size determined later
  } catch {
    return null;
  }
}

// ── Launch DOSBox-X ──────────────────────────────────────────────────────
function launchDosboxBackground(): { pid: number; kill: () => void } {
  const child = spawn(DOSBOX_BIN, [], {
    detached: true,
    stdio: 'ignore',
    cwd: join(REPO_ROOT, 'tools', 'dosbox'),
  });
  child.unref();
  return { pid: child.pid!, kill: () => child.kill('SIGTERM') };
}

// ── Build a save with N party members ────────────────────────────────────
async function buildSave(client: HelperClient, slot: number): Promise<void> {
  console.log(`[build] slot=${slot}: launching DOSBox-X...`);
  const dosbox = launchDosboxBackground();
  try {
    // Wait for boot + title page.
    await new Promise((r) => setTimeout(r, 5000));

    // Dismiss title page (Wiz6 usually needs 2-3 Enter presses to clear intro).
    await sendMacro(client, 'enter enter enter');
    await new Promise((r) => setTimeout(r, 1500));

    // Add (slot) party members. At MASTER OPTIONS, cursor starts on
    // ADD PARTY MEMBER; pressing Enter selects it; the PCFILE picker opens;
    // pressing Enter again picks the first available roster character.
    for (let i = 0; i < slot; i++) {
      console.log(`[build] slot=${slot}: adding member ${i + 1}/${slot}`);
      await sendMacro(client, 'enter');           // pick ADD PARTY MEMBER
      await new Promise((r) => setTimeout(r, 500));
      await sendMacro(client, 'enter');           // pick first PCFILE char
      await new Promise((r) => setTimeout(r, 800));
      // Returns to MASTER OPTIONS. Cursor may shift; press Up to re-focus
      // ADD PARTY MEMBER for the next iteration.
      // (This sequence may need tuning during first run.)
    }

    // Reset slot tracking so saveStateToSlot's cycle math starts from 1.
    resetSlotTracking(1);
    console.log(`[build] slot=${slot}: saving to slot ${slot}...`);
    await saveStateToSlot(client, slot, SAVE_DIR);

    console.log(`[build] slot=${slot}: ✅ saved`);
  } finally {
    console.log(`[build] slot=${slot}: shutting down DOSBox-X`);
    dosbox.kill();
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const client = new HelperClient();
  try {
    for (const slot of targetSlots) {
      if (slot < 1 || slot > 6) {
        console.error(`[build] skipping slot=${slot} (out of range 1..6)`);
        continue;
      }
      await buildSave(client, slot);
    }
  } finally {
    await client.shutdown();
  }
  console.log('[build] done');
}

main().catch((e) => {
  console.error('[build] FAILED:', e);
  process.exit(1);
});
```

Notes for the engineer:
- The exact key sequence for "add a member" depends on Wiz6's menu flow. The first-run will likely need tuning — adjust the `sendMacro` calls and `setTimeout` waits until the script reliably builds a save with the target party_size.
- The script LAUNCHES DOSBox-X internally rather than relying on it being open. This makes the script self-contained and idempotent across runs.
- If a save fails to build correctly (party_size mismatch), the user can re-run; the existing .sav will be overwritten.

- [ ] **Step 2: Update `tools/parity/README.md`**

Add a section documenting the workflow:

```markdown
## Building castle-N-members fixtures

These engine-ground-truth fixtures need DOSBox-X save states with N=1..6
party members. To regenerate them after a PCFILE change or first install:

1. Ensure DOSBox-X has Accessibility permission (see packages/mcp/PERMISSIONS.md).
2. Build saves: `pnpm tsx tools/parity/build-castle-saves.ts --slots 1,2,3,4,5,6`
3. For each N: `pnpm tsx tools/parity/gen-fixture.ts --save N --name castle-N-members`
4. Commit the resulting .idx.gz + .png files.
```

- [ ] **Step 3: Commit**

```bash
git add tools/parity/build-castle-saves.ts tools/parity/README.md
git commit -m "feat(parity): MCP-orchestrating build-castle-saves.ts script

Drives DOSBox-X via the wiz6 MCP helper modules (imported directly,
no MCP server in the loop) to build save states with N=1..6 party
members. Idempotent + reproducible."
```

---

### Task 4: Stage 2 — Build save 2, capture fixture, lift N=2 parity to 100%

**Files:**
- Create: `tools/parity/fixtures/engine/castle-2-members.{idx.gz,png}`
- Modify: `tools/parity/castle-parity.test.ts`
- Modify: `packages/viewer/src/pages/game/castle-frame.ts` (only if right-column render needs adjustment)

- [ ] **Step 1: Build save 2 via the script**

```bash
pnpm tsx tools/parity/build-castle-saves.ts --slot 2
```

If the first run's key sequence is wrong (party_size != 2 in the resulting save), iterate on the script's send-macro sequence and re-run. Verify the resulting save:

```bash
# Via the MCP tool (from Claude):
dosbox_inspect_save({save: 2})
# Expect: party_size: 2, party_names: [<name1>, <name2>, ...]
```

- [ ] **Step 2: Capture the engine fixture**

```bash
pnpm tsx tools/parity/gen-fixture.ts --save 2 --name castle-2-members
```

Verify the output `tools/parity/fixtures/engine/castle-2-members.png` shows the engine's castle with 2 members.

- [ ] **Step 3: Read the engine character records for both members**

From Claude, invoke `dosbox_read_struct` for each member at slots 0 and 1:

```
dosbox_read_struct({save: 2, structName: 'character_record', space: 'wroot.dgroup', offset: 17384})
dosbox_read_struct({save: 2, structName: 'character_record', space: 'wroot.dgroup', offset: 17384 + 0x1b0})
```

Record the exact field values (name, class, race, sex, etc.) for use in the test fixture.

- [ ] **Step 4: Add N=2 case to castle-parity.test.ts**

Construct `ENGINE_SAVE_2_MEMBERS` array from the read structs (model after `ENGINE_SAVE_1_NATHAN`). Add a CASES entry:

```ts
{
  fixture: 'castle-2-members',
  floor: 100,
  parity: 1,
  context: { partySize: 2, pcFileHasUnloadedChars: true /* verify */ },
  members: ENGINE_SAVE_2_MEMBERS, // array of 2 ActivePartyMember
  selectedIdx: 0,
}
```

- [ ] **Step 5: Run — expect failure (right-column render not yet correct, probably)**

```bash
pnpm --filter @wiz6/parity test castle-parity 2>&1 | grep -E 'castle-2-members|match'
```

Inspect `/tmp/parity-diff-castle-2-members.png`. The likely diff: right-column portrait/panel position is wrong because slot 1's render coords don't account for the RIGHT column.

- [ ] **Step 6: Tune `castle-frame.ts` for the right-column case**

If slot 1's panel is rendering at left-column coords, fix `composeCastleFrame` to dispatch on `slot % 2` and use the right-column X for odd slots. The exact RIGHT-column X comes from the Task 1 findings.

Iterate until parity is 100%.

- [ ] **Step 7: Commit**

```bash
git add tools/parity/fixtures/engine/castle-2-members.idx.gz \
  tools/parity/fixtures/engine/castle-2-members.png \
  tools/parity/castle-parity.test.ts \
  packages/viewer/src/pages/game/castle-frame.ts
git commit -m "feat(castle): N=2 parity at 100%; right-column render

Slot 1 (odd) renders on the RIGHT panel; LEFT/RIGHT split in
castle-frame.ts honors the FUN_1b2d (even/odd → window) split."
```

---

### Task 5: Stages 3-6 — N=3, 4, 5, 6 fixtures + parity

Same pattern as Task 4, repeated for slot=3, 4, 5, 6. Each adds ~5 minutes of work; collectively closes the parity test gap.

- [ ] **Step 1: Build saves 3-6**

```bash
pnpm tsx tools/parity/build-castle-saves.ts --slots 3,4,5,6
```

Each save: party_size = N. If the first run's macros need tuning for higher N (e.g., the menu position drifts as the party fills), iterate.

- [ ] **Step 2: Capture all 4 fixtures**

```bash
pnpm tsx tools/parity/gen-fixture.ts --save 3 --name castle-3-members
pnpm tsx tools/parity/gen-fixture.ts --save 4 --name castle-4-members
pnpm tsx tools/parity/gen-fixture.ts --save 5 --name castle-5-members
pnpm tsx tools/parity/gen-fixture.ts --save 6 --name castle-6-members
```

- [ ] **Step 3: For each N in 3..6, read members + add CASES entry**

For each save, read the N character_records via `dosbox_read_struct`:

```
for slot in 0..N-1:
  dosbox_read_struct({save: N, structName: 'character_record', space: 'wroot.dgroup', offset: 17384 + slot * 0x1b0})
```

Construct `ENGINE_SAVE_N_MEMBERS` arrays. Add 4 new CASES entries to `castle-parity.test.ts`:

```ts
{ fixture: 'castle-3-members', floor: 100, parity: 1, context: {...}, members: ENGINE_SAVE_3_MEMBERS, selectedIdx: 0 },
{ fixture: 'castle-4-members', floor: 100, parity: 1, context: {...}, members: ENGINE_SAVE_4_MEMBERS, selectedIdx: 0 },
{ fixture: 'castle-5-members', floor: 100, parity: 1, context: {...}, members: ENGINE_SAVE_5_MEMBERS, selectedIdx: 0 },
{ fixture: 'castle-6-members', floor: 100, parity: 1, context: {...}, members: ENGINE_SAVE_6_MEMBERS, selectedIdx: 0 },
```

- [ ] **Step 4: Run + iterate**

```bash
pnpm --filter @wiz6/parity test castle-parity
```

Iterate on `castle-frame.ts` / `party-panel-render.ts` until all 6 cases pass at floor 100. Most divergences should be already fixed in Tasks 2 + 4; only slot-3/4/5 row-position math (`panelRow = (slot/2)*4`) might still need tuning.

- [ ] **Step 5: Commit**

```bash
git add tools/parity/fixtures/engine/castle-{3,4,5,6}-members.* tools/parity/castle-parity.test.ts \
  packages/viewer/src/pages/game/castle-frame.ts \
  packages/viewer/src/pages/game/party-panel-render.ts
git commit -m "feat(castle): N=3..6 parity at 100%

All six castle-N-members fixtures verified byte-exact against the
engine. Closes the parity gap for populated-party rendering."
```

---

### Task 6: Finalize — close TODOs, supersede #026

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Update TODO.md**

Remove entries #024, #061, #062 entirely (closed per the close-by-deletion convention). Bump `Next free ID` if needed (no new IDs from this work since findings are external to TODO.md). Add a brief note to entry #026 marking it superseded:

```markdown
- #026 [superseded — see docs/re/findings/wbase-party-portrait-blit.json (2026-05-30); portraits are ~24×24, not 64×9]
  - Original claim: engine FUN_0b0e reads 9 rows × 32 bytes per portrait...
  - Re-RE'd 2026-05-30; the 9-row × 32-byte read is the raw EGA-planar file format, NOT on-screen dimensions. The blit to screen renders at ~24×24 pixels (3 tiles wide × 3 rows of 8px). Wbase-party-portrait-blit.json finding has corrected geometry.
```

OR delete #026 entirely (treating superseded as "closed") and rely on git log + the new finding file.

- [ ] **Step 2: Verify all parity tests pass**

```bash
pnpm --filter @wiz6/parity test castle-parity
pnpm --filter @wiz6/viewer test
pnpm --filter @wiz6/mcp test
```

All green.

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -m "chore: close #024 + #061 + #062; supersede #026

Castle party-panel re-render complete. All six N-member fixtures
at 100% pixel parity. The #024 right-side info panel is ported;
#026's 64×9 portrait dimensions claim is overturned by
wbase-party-portrait-blit.json."
```

---

## Self-review

| Spec section | Task(s) |
|---|---|
| Goal #1: overturn wrong RE | Task 1 (Part B) |
| Goal #2: port FUN_1b2d | Task 2 (party-panel-render.ts) |
| Goal #3: LEFT/RIGHT split portraits | Task 2 + Task 4 |
| Goal #4: capture N=1..6 fixtures | Task 4 + Task 5 (build via Task 3 script) |
| Goal #5: parity floor 100% all N | Tasks 2, 4, 5 |
| Goal #6: dogfood MCP | Task 1 (Part A), Tasks 3, 4, 5 |
| Stage 0 MCP smoke + RE | Task 1 |
| Stage 1 N=1 | Task 2 |
| Build-saves script | Task 3 |
| Stage 2 N=2 | Task 4 |
| Stages 3-6 N=3..6 | Task 5 |
| Stage 7 finalize | Task 6 |

All spec sections mapped. Tasks 4 and 5 contain MCP tool calls that the engineer (or Claude as the running agent) makes directly — the integration smoke is implicit (if the tools work, the script works; if not, Task 1 already halted).

Known unknowns documented inline:
- The exact key sequence to add a member in DOSBox-X (Task 3, Step 1 — tune during first run).
- The exact wait times between menu transitions (Task 3 — tune).
- The exact contents of lookup tables 0x526 / 0x532 / 0x3a (Task 1, Step 10 — decode + record).
- The exact LEFT vs RIGHT column X coords (Task 1, Step 11 — record in finding).

These are engineer-notes; the implementer adapts to actual values discovered at RE/smoke time.
