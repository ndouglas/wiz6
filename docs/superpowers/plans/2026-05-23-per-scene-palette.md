# Per-scene Palette Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the empirical `WIZ6_PALETTE` (standard-EGA-plus-overrides) and the magic `wiz6-title` palette with a comprehensive RE-grounded palette catalog in `@wiz6/data`, driving every renderer off the palette the engine actually has loaded when the asset is drawn.

**Architecture:** Single source of truth (`PALETTE_CATALOG` in `@wiz6/data`) populated from a comprehensive scan of every palette-touching site in `wroot.exe`, all `*.ovr`, and all `*.drv`. Each extracted asset JSON carries a `palette` name field; renderers take a `Palette` argument; viewer reads palette name from JSON and looks up in the catalog.

**Tech Stack:** TypeScript, zod, vitest, React, Ghidra (PyGhidra), DOSBox-X, Python.

**Tracker:** [`TODO.md`](../../../TODO.md) #002. Approved spec: [`docs/superpowers/specs/2026-05-23-per-scene-palette-design.md`](../specs/2026-05-23-per-scene-palette-design.md).

---

## Pre-flight

- [ ] **Worktree on the latest `main`**

```bash
cd ~/Projects/ndouglas/wiz6
git worktree add ~/.config/superpowers/worktrees/wiz6/per-scene-palette -b per-scene-palette
cd ~/.config/superpowers/worktrees/wiz6/per-scene-palette
pnpm install --frozen-lockfile
```

- [ ] **Baseline tests**

```bash
pnpm -r test 2>&1 | grep -E "Tests|Test Files" | tail -10
```

Expected: all suites pass. Record the counts (e.g. "data: 95 / parser: 105 / cli: 43 / viewer: 300") so we can detect regressions later.

- [ ] **Symlink `original/` if missing in the worktree**

```bash
[ ! -e original ] && ln -s /Users/nathan/Projects/ndouglas/wiz6/original original
```

- [ ] **Symlink the Ghidra project too** (PyGhidra needs the project files in CWD-relative paths)

```bash
[ ! -e tools/ghidra/wiz6.gpr ] && echo "ERROR: ghidra project missing — abort" || echo "ghidra project present"
```

- [ ] **Confirm Ghidra GUI is closed** before any PyGhidra scripts (exclusive project lock).

---

## Phase 1 — Comprehensive RE pass

This phase produces evidence (a JSON findings file) before any code changes. Output drives Phase 2 catalog content and Phase 4 extractor assignments. Read-only with respect to the codebase.

### Task 1: Dispatch RE subagent for palette-touching sites

- [ ] **Step 1: Verify all binaries are present**

```bash
ls original/wroot.exe original/*.ovr original/*.drv 2>&1
```

Expected: at least one each of `.exe`, `.ovr`, `.drv` listed. Record the full list — it's the scan target set.

- [ ] **Step 2: Pre-scan with `grep`/`xxd` to size the work**

```bash
# Quick byte-pattern scan for INT 10h preceded by AX=1002h-style MOV
for f in original/wroot.exe original/*.ovr original/*.drv; do
  echo "=== $f ==="
  python3 -c "
import sys
bs = open(sys.argv[1], 'rb').read()
patterns = [
  (b'\\xb8\\x02\\x10\\xcd\\x10', 'AX=1002h INT 10h (set all palette regs)'),
  (b'\\xb8\\x00\\x10\\xcd\\x10', 'AX=1000h INT 10h (set one palette reg)'),
  (b'\\xb8\\x03\\x10\\xcd\\x10', 'AX=1003h INT 10h (blink toggle)'),
]
for pat, label in patterns:
  off = 0
  while True:
    i = bs.find(pat, off)
    if i < 0: break
    print(f'  0x{i:04x}  {label}')
    off = i + 1
" "$f"
done
```

Expected output: at least the known hits in `wroot.exe` (`0x209B`, `0x2105`). Other binaries may show zero. Capture this output — it's evidence that the scan is finding the BIOS-call mechanism.

- [ ] **Step 3: Dispatch the RE subagent**

Use the Agent tool with `subagent_type: general-purpose` (or a more specific RE subagent if available). Prompt the subagent verbatim — adapt the binary list if your pre-scan in step 2 showed different files:

> **Task:** Comprehensive RE pass over EGA palette manipulation across all Wizardry VI binaries.
>
> **Background:** Wizardry VI is a 1990 DOS game that programs the EGA palette via either BIOS `INT 10h` calls (AX=1000h/1002h/1003h) or direct port writes to the EGA Attribute Controller (port `0x3C0`). We need to find every site that touches the palette across every binary, decode the palette data being written, and attribute each site to a caller context (overlay + function + game state if traceable).
>
> **Scope:**
> - Binaries: `original/wroot.exe`, every `original/*.ovr`, every `original/*.drv`. Use `ls` to enumerate; do not guess.
> - Mechanisms to find:
>   1. `INT 10h AX=1002h` — bytes `B8 02 10 CD 10` (with the table address loaded into DX:DS or ES:DX nearby)
>   2. `INT 10h AX=1000h` — bytes `B8 00 10 CD 10` (BH = register, BL = value)
>   3. `INT 10h AX=1003h` — bytes `B8 03 10 CD 10` (blink toggle)
>   4. Direct port writes: any sequence that includes `MOV DX, 0x3C0` + `OUT DX, AL`, or shorter `OUT 0xC0, AL` (`E6 C0`). Watch for the `IN 0x3DA` reset dance preceding port-`0x3C0` writes.
>
> **Per-site analysis required:**
> - Binary name and exact file offset.
> - For overlays: use the thunk-delta law (`thunk_address = wroot_file_offset + 0xBA9C`, see `CLAUDE.md`) and overlay-runtime-delta (e.g. winit.ovr = 0x3DB7) to translate between virtual addresses and file offsets.
> - Enclosing function name (Ghidra lookup; rename `FUN_XXXX` to `palette_*` if no name yet).
> - Caller context: which game-state values reach this site? Cross-reference `ovl_install_table` at wroot 0x132d (state-machine dispatch table) and `CLAUDE.md` §"Overlay state machine".
> - For `AX=1002h` sites: decode the 17-byte palette table to RGB using the EGA `RrgGbB` bit layout already documented in `docs/re/palette-discovery.md`. Output the 16 RGB tuples (skip the overscan byte).
> - For dynamic table loads (`MOV DX, [reg]` rather than immediate): trace back to find where the variable is set, and list every possible source table.
>
> **Confidence levels:**
> - `high`: unique pattern match + decoded data + clear caller context.
> - `medium`: pattern match but caller context ambiguous, or dynamic load with multiple sources.
> - `low`: pattern match with no caller context, or speculative attribution.
>
> **Tools available:** Ghidra CLI (`/opt/homebrew/Cellar/ghidra/12.1/libexec/support/analyzeHeadless`), PyGhidra (`tools/ghidra/scripts/`), `ndisasm`, `xxd`, Python with `capstone` if needed. Ghidra GUI must be closed during PyGhidra runs.
>
> **Deliverable:** Write findings to `docs/re/findings/palette-loads.json` matching the schema in `docs/re/findings/README.md`. Each finding entry must include:
> - `id` (e.g. `pal-wroot-209b`)
> - `claim` (one sentence)
> - `category` (`int10-set-all` / `int10-set-one` / `int10-toggle-blink` / `attr-ctl-direct`)
> - `evidence.binary`, `evidence.address` (file offset hex), `evidence.byte_pattern`
> - `evidence.decoded_data`: for `int10-set-all`, the 17 register bytes + decoded RGB array (16 entries); for `int10-set-one`, register index + value
> - `evidence.caller_context`: function name + game state(s) that reach this site
> - `confidence`
>
> The JSON `summary` field must explicitly state: total sites found, count of `int10-set-all` (full-palette loads), count of direct-port-write sites, count of palettes whose RGB matches `wiz6-main` (palette 1), count matching `wiz6-dungeon` (palette 2), count matching neither.
>
> **Do NOT modify `docs/re/palette-discovery.md`** — the parent agent will promote findings after review.
>
> **Also do NOT modify any TypeScript code** — your output is JSON only. Renaming `FUN_XXXX` to `palette_*` in Ghidra is fine and welcome; emit a replay script at `tools/ghidra/scripts/apply_palette_names.py` following the pattern in `tools/ghidra/scripts/apply_wroot_names.py`.

- [ ] **Step 4: Wait for subagent completion**

The subagent runs to completion. Capture its summary in the task tracker.

- [ ] **Step 5: Commit findings as-is (before review)**

```bash
git add docs/re/findings/palette-loads.json tools/ghidra/scripts/apply_palette_names.py
git status   # verify only those files staged; nothing else touched
git commit -m "re: palette-loads.json from comprehensive scan (subagent draft)"
```

This preserves the subagent's raw output as an audit point, before any human edits.

### Task 2: Review and promote findings

- [ ] **Step 1: Read `docs/re/findings/palette-loads.json` end-to-end**

Don't skim — read every finding. For each, note:
- Does the decoded RGB match `wiz6-main` (palette 1)? `wiz6-dungeon` (palette 2)? Neither?
- Is the caller context plausible given the overlay state machine?
- Is the confidence level honest, or does it overclaim?

- [ ] **Step 2: Spot-check three `high`-confidence findings by re-running their byte patterns**

Pick three at random; for each:

```bash
xxd -s <offset> -l 16 original/<binary>
```

Verify the byte pattern in the finding matches what's actually in the file at that offset. If any mismatch, lower confidence to `medium` or `low` and add an `_audit_notes` field describing the mismatch.

- [ ] **Step 3: For each unique `int10-set-all` palette table, identify the catalog name**

Cross-reference the 16 decoded RGB tuples against `packages/viewer/src/palettes/wiz6-palette-1.ts` and `wiz6-palette-2.ts`. For each finding:
- If RGB matches palette 1 exactly: `_catalog_name: "wiz6-main"`.
- If RGB matches palette 2 exactly: `_catalog_name: "wiz6-dungeon"`.
- Otherwise: assign a new name (e.g. `wiz6-graveyard` if the caller context is the graveyard overlay).

Update each finding inline by adding the `_catalog_name` field.

- [ ] **Step 4: Validate the EGA byte-to-RGB conversion**

Pick one register byte from `wiz6-main` (e.g. byte `0x07` from palette 1, which the existing table says is `(170, 170, 170)` light gray). Verify by computing from the bit layout:
- bit 5 (R/3 = +85), bit 4 (G/3 = +85), bit 3 (B/3 = +85), bit 2 (R*2/3 = +170), bit 1 (G*2/3 = +170), bit 0 (B*2/3 = +170).
- For `0x07 = 0b000111`: bits 2,1,0 set → R=170, G=170, B=170. ✓

If your manual computation disagrees with the table in `docs/re/palette-discovery.md`, dig into which is wrong before proceeding.

- [ ] **Step 5: Promote verified findings to `docs/re/palette-discovery.md`**

Update the canonical doc:
- If only the known two palettes (wiz6-main, wiz6-dungeon) exist, leave the doc as-is and add a one-paragraph footer: "Comprehensive RE scan over all binaries on YYYY-MM-DD found no additional palette-load sites beyond the two documented here. Verified by [subagent run date]. No direct EGA Attribute Controller port writes detected."
- If more palettes exist, add a new table for each, structured exactly like the existing Palette 1/Palette 2 tables (idx | reg | RGB | rough name).
- If direct port writes were found, add a new section "## Direct port writes" with one subsection per site.

- [ ] **Step 6: Commit the review**

```bash
git add docs/re/findings/palette-loads.json docs/re/palette-discovery.md
git commit -m "re: review + promote palette findings to docs/re/palette-discovery.md

- Spot-checked N high-confidence findings against the binary
- Added _catalog_name tags identifying which catalog entry each palette maps to
- Updated docs/re/palette-discovery.md with [insert: comprehensive-scan summary OR new palette tables]"
```

### Task 3: Apply Ghidra renames from Phase 1 (if any)

- [ ] **Step 1: Check if subagent produced `tools/ghidra/scripts/apply_palette_names.py`**

```bash
ls -l tools/ghidra/scripts/apply_palette_names.py 2>&1
```

If the file doesn't exist (no Ghidra rename activity), skip to Task 4.

- [ ] **Step 2: Confirm the Ghidra GUI is closed**

```bash
pgrep -af "Ghidra|ghidra" || echo "No Ghidra process running — safe to proceed"
```

- [ ] **Step 3: Dry-run the rename script**

```bash
python3 tools/ghidra/scripts/apply_palette_names.py --dry-run
```

Expected: prints what would be renamed without applying. Sanity-check the list against the findings JSON.

- [ ] **Step 4: Apply renames**

```bash
python3 tools/ghidra/scripts/apply_palette_names.py
```

- [ ] **Step 5: Commit the rename script**

```bash
git add tools/ghidra/scripts/apply_palette_names.py
git commit -m "tools: idempotent Ghidra rename script for palette-touching functions"
```

---

## Phase 2 — Data-layer catalog

Move all named palettes into `@wiz6/data`. Build the `PALETTE_CATALOG` index. Everything downstream (parser, CLI, viewer) consumes from here.

### Task 4: Create the `packages/data/src/palettes/` directory and move palette 1

- [ ] **Step 1: Create the directory**

```bash
mkdir -p packages/data/src/palettes
```

- [ ] **Step 2: Write the failing test** — `packages/data/tests/palettes/wiz6-main.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '../../src/schemas/palette.js';
import { WIZ6_MAIN } from '../../src/palettes/wiz6-main.js';

describe('WIZ6_MAIN', () => {
  it('validates against PaletteSchema', () => {
    expect(() => PaletteSchema.parse(WIZ6_MAIN)).not.toThrow();
  });

  it('has 16 RGB triples', () => {
    expect(WIZ6_MAIN.colors).toHaveLength(16);
  });

  it('has the discovered name and provenance', () => {
    expect(WIZ6_MAIN.name).toBe('wiz6-main');
    expect(WIZ6_MAIN.provenance).toMatch(/wroot\.exe.*0x2043/);
  });

  it('matches the discovered RGB values exactly (snapshot)', () => {
    expect(WIZ6_MAIN.colors).toMatchInlineSnapshot(`
      [
        [0, 0, 0],
        [170, 255, 170],
        [0, 85, 170],
        [170, 85, 170],
        [170, 85, 0],
        [170, 255, 0],
        [0, 255, 0],
        [0, 255, 170],
        [0, 85, 0],
        [170, 170, 170],
        [0, 0, 170],
        [170, 0, 170],
        [170, 0, 0],
        [170, 170, 0],
        [0, 170, 0],
        [0, 170, 170],
      ]
    `);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd packages/data && pnpm test -- palettes/wiz6-main 2>&1 | tail -20
```

Expected: FAIL with `Cannot find module '../../src/palettes/wiz6-main.js'`.

- [ ] **Step 4: Create the palette file** — `packages/data/src/palettes/wiz6-main.ts`

```typescript
import type { Palette } from '../schemas/palette.js';

/**
 * Wizardry VI runtime palette #1 — "main".
 *
 * Applied via INT 10h AX=1002h at the call site at file offset 0x209B in
 * wroot.exe. The 17-byte palette table lives at file offset 0x2043
 * (= CS:0x1E43). Used for character creation and most in-game UI.
 *
 * Discovered in Stage 1d; see docs/re/palette-discovery.md.
 */
export const WIZ6_MAIN: Palette = {
  name: 'wiz6-main',
  provenance: 'wroot.exe @ 0x2043 (17-byte palette table loaded by INT 10h AX=1002h at 0x209B)',
  colors: [
    [0, 0, 0],
    [170, 255, 170],
    [0, 85, 170],
    [170, 85, 170],
    [170, 85, 0],
    [170, 255, 0],
    [0, 255, 0],
    [0, 255, 170],
    [0, 85, 0],
    [170, 170, 170],
    [0, 0, 170],
    [170, 0, 170],
    [170, 0, 0],
    [170, 170, 0],
    [0, 170, 0],
    [0, 170, 170],
  ],
};
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/data && pnpm test -- palettes/wiz6-main 2>&1 | tail -10
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/palettes/wiz6-main.ts packages/data/tests/palettes/wiz6-main.test.ts
git commit -m "feat(data): add WIZ6_MAIN palette to data catalog"
```

### Task 5: Move palette 2 (wiz6-dungeon)

- [ ] **Step 1: Write the failing test** — `packages/data/tests/palettes/wiz6-dungeon.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '../../src/schemas/palette.js';
import { WIZ6_DUNGEON } from '../../src/palettes/wiz6-dungeon.js';

describe('WIZ6_DUNGEON', () => {
  it('validates against PaletteSchema', () => {
    expect(() => PaletteSchema.parse(WIZ6_DUNGEON)).not.toThrow();
  });

  it('has 16 RGB triples', () => {
    expect(WIZ6_DUNGEON.colors).toHaveLength(16);
  });

  it('has the discovered name and provenance', () => {
    expect(WIZ6_DUNGEON.name).toBe('wiz6-dungeon');
    expect(WIZ6_DUNGEON.provenance).toMatch(/wroot\.exe.*0x2054/);
  });

  it('matches the discovered RGB values exactly (snapshot)', () => {
    expect(WIZ6_DUNGEON.colors).toMatchInlineSnapshot(`
      [
        [0, 0, 0],
        [170, 170, 255],
        [0, 0, 255],
        [170, 0, 255],
        [170, 0, 85],
        [170, 170, 85],
        [0, 170, 85],
        [0, 170, 255],
        [0, 0, 85],
        [170, 170, 170],
        [0, 0, 170],
        [170, 0, 170],
        [170, 0, 0],
        [170, 170, 0],
        [0, 170, 0],
        [0, 170, 170],
      ]
    `);
  });

  it('shares indices 9..15 with wiz6-main', async () => {
    const { WIZ6_MAIN } = await import('../../src/palettes/wiz6-main.js');
    for (let i = 9; i <= 15; i++) {
      expect(WIZ6_DUNGEON.colors[i]).toEqual(WIZ6_MAIN.colors[i]);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/data && pnpm test -- palettes/wiz6-dungeon 2>&1 | tail -10
```

Expected: FAIL with `Cannot find module '../../src/palettes/wiz6-dungeon.js'`.

- [ ] **Step 3: Create the palette file** — `packages/data/src/palettes/wiz6-dungeon.ts`

```typescript
import type { Palette } from '../schemas/palette.js';

/**
 * Wizardry VI runtime palette #2 — "dungeon".
 *
 * Applied via INT 10h AX=1002h at the call site at file offset 0x2105 in
 * wroot.exe. The 17-byte palette table lives at file offset 0x2054
 * (= CS:0x1E54). Blue-leaning; indices 9..15 are identical to wiz6-main.
 *
 * Discovered in Stage 1d; see docs/re/palette-discovery.md.
 */
export const WIZ6_DUNGEON: Palette = {
  name: 'wiz6-dungeon',
  provenance: 'wroot.exe @ 0x2054 (17-byte palette table loaded by INT 10h AX=1002h at 0x2105)',
  colors: [
    [0, 0, 0],
    [170, 170, 255],
    [0, 0, 255],
    [170, 0, 255],
    [170, 0, 85],
    [170, 170, 85],
    [0, 170, 85],
    [0, 170, 255],
    [0, 0, 85],
    [170, 170, 170],
    [0, 0, 170],
    [170, 0, 170],
    [170, 0, 0],
    [170, 170, 0],
    [0, 170, 0],
    [0, 170, 170],
  ],
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd packages/data && pnpm test -- palettes/wiz6-dungeon 2>&1 | tail -10
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/palettes/wiz6-dungeon.ts packages/data/tests/palettes/wiz6-dungeon.test.ts
git commit -m "feat(data): add WIZ6_DUNGEON palette to data catalog"
```

### Task 6: Add `EGA_DEFAULT` palette to data catalog

This is the standard EGA BIOS palette; used as a fallback / debug-comparison option. Already exists in the viewer; we promote it into `@wiz6/data` so the catalog is complete.

- [ ] **Step 1: Write the failing test** — `packages/data/tests/palettes/ega-default.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '../../src/schemas/palette.js';
import { EGA_DEFAULT } from '../../src/palettes/ega-default.js';

describe('EGA_DEFAULT', () => {
  it('validates against PaletteSchema', () => {
    expect(() => PaletteSchema.parse(EGA_DEFAULT)).not.toThrow();
  });

  it('has 16 RGB triples', () => {
    expect(EGA_DEFAULT.colors).toHaveLength(16);
  });

  it('has correct name and BIOS provenance', () => {
    expect(EGA_DEFAULT.name).toBe('ega-default');
    expect(EGA_DEFAULT.provenance).toMatch(/IBM EGA palette/);
  });

  it('matches the standard EGA palette exactly (snapshot)', () => {
    expect(EGA_DEFAULT.colors).toMatchInlineSnapshot(`
      [
        [0, 0, 0],
        [0, 0, 170],
        [0, 170, 0],
        [0, 170, 170],
        [170, 0, 0],
        [170, 0, 170],
        [170, 85, 0],
        [170, 170, 170],
        [85, 85, 85],
        [85, 85, 255],
        [85, 255, 85],
        [85, 255, 255],
        [255, 85, 85],
        [255, 85, 255],
        [255, 255, 85],
        [255, 255, 255],
      ]
    `);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/data && pnpm test -- palettes/ega-default 2>&1 | tail -10
```

Expected: FAIL.

- [ ] **Step 3: Create the palette file** — `packages/data/src/palettes/ega-default.ts`

```typescript
import type { Palette } from '../schemas/palette.js';

/**
 * Standard 16-color IBM EGA palette as initialized by BIOS at video mode
 * set (mode 0Dh). Used as a fallback / debug-comparison option in the
 * viewer. NOT what Wizardry VI runs with — the engine reprograms registers
 * via INT 10h AX=1002h at startup; see wiz6-main / wiz6-dungeon.
 */
export const EGA_DEFAULT: Palette = {
  name: 'ega-default',
  provenance: 'Standard IBM EGA palette as initialized by BIOS at video mode set',
  colors: [
    [0, 0, 0],
    [0, 0, 170],
    [0, 170, 0],
    [0, 170, 170],
    [170, 0, 0],
    [170, 0, 170],
    [170, 85, 0],
    [170, 170, 170],
    [85, 85, 85],
    [85, 85, 255],
    [85, 255, 85],
    [85, 255, 255],
    [255, 85, 85],
    [255, 85, 255],
    [255, 255, 85],
    [255, 255, 255],
  ],
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd packages/data && pnpm test -- palettes/ega-default 2>&1 | tail -10
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/palettes/ega-default.ts packages/data/tests/palettes/ega-default.test.ts
git commit -m "feat(data): add EGA_DEFAULT palette to data catalog"
```

### Task 7: Add any newly-discovered Phase-1 palettes

This task is conditional on Phase 1 findings. If Phase 1 found no new palettes beyond `wiz6-main` and `wiz6-dungeon`, **skip to Task 8.**

For each new palette discovered:

- [ ] **Step 1: Identify the palette's `_catalog_name`** from the findings JSON (added in Task 2 step 3).

- [ ] **Step 2: Write the failing test** — `packages/data/tests/palettes/<name>.test.ts`, structured identically to `wiz6-main.test.ts` (Task 4 step 2):
  - Validates against `PaletteSchema`.
  - Has 16 RGB triples.
  - Has the correct name and provenance (provenance string includes the binary + file offset of the table + the call site).
  - Snapshot-matches the decoded RGB values (16 entries).

- [ ] **Step 3: Run the test to verify it fails.**

- [ ] **Step 4: Create the palette file** — `packages/data/src/palettes/<name>.ts`, structured identically to `wiz6-main.ts` (Task 4 step 4):
  - Imports `Palette` type from `../schemas/palette.js`.
  - Exports a single named `Palette` const.
  - Header comment: which call site loads this palette, which game state(s) reach that site.

- [ ] **Step 5: Run the test to verify it passes.**

- [ ] **Step 6: Commit per palette**:

```bash
git add packages/data/src/palettes/<name>.ts packages/data/tests/palettes/<name>.test.ts
git commit -m "feat(data): add <name> palette to data catalog"
```

**Important:** if the title-screen palette (`wiz6-title`) is one of the discovered ones, also add a note in its file header that it supersedes the empirically-extracted `packages/viewer/src/palettes/wiz6-title.ts` (which will be deleted in Phase 5).

If `wiz6-title` was NOT discovered (no engine code loads it), create it anyway in this task as `packages/data/src/palettes/wiz6-title.ts`, copying the RGB values from `packages/viewer/src/palettes/wiz6-title.ts` and setting `provenance: "Stage 1f.2 — extracted from DOSBox-X capture of the title sequence. No engine call site located in the comprehensive RE pass; retained empirically."`. Test follows the same shape.

### Task 8: Build `PALETTE_CATALOG` index

- [ ] **Step 1: Write the failing test** — `packages/data/tests/palettes/index.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { PaletteSchema } from '../../src/schemas/palette.js';
import { PALETTE_CATALOG, type PaletteName } from '../../src/palettes/index.js';

describe('PALETTE_CATALOG', () => {
  it('includes wiz6-main', () => {
    expect(PALETTE_CATALOG['wiz6-main']).toBeDefined();
    expect(PALETTE_CATALOG['wiz6-main']?.name).toBe('wiz6-main');
  });

  it('includes wiz6-dungeon', () => {
    expect(PALETTE_CATALOG['wiz6-dungeon']).toBeDefined();
    expect(PALETTE_CATALOG['wiz6-dungeon']?.name).toBe('wiz6-dungeon');
  });

  it('includes ega-default', () => {
    expect(PALETTE_CATALOG['ega-default']).toBeDefined();
    expect(PALETTE_CATALOG['ega-default']?.name).toBe('ega-default');
  });

  it('every entry validates against PaletteSchema', () => {
    for (const [key, palette] of Object.entries(PALETTE_CATALOG)) {
      expect(() => PaletteSchema.parse(palette), `${key} should be a valid Palette`).not.toThrow();
    }
  });

  it('every key matches its palette.name', () => {
    for (const [key, palette] of Object.entries(PALETTE_CATALOG)) {
      expect(palette.name, `key ${key}`).toBe(key);
    }
  });

  it('PaletteName type accepts all catalog keys (compile-time only)', () => {
    const names: PaletteName[] = Object.keys(PALETTE_CATALOG) as PaletteName[];
    expect(names.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/data && pnpm test -- palettes/index 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the index** — `packages/data/src/palettes/index.ts`

```typescript
import type { Palette } from '../schemas/palette.js';
import { EGA_DEFAULT } from './ega-default.js';
import { WIZ6_MAIN } from './wiz6-main.js';
import { WIZ6_DUNGEON } from './wiz6-dungeon.js';

// If Phase 1 discovered additional palettes, import them here too:
// import { WIZ6_TITLE } from './wiz6-title.js';

/**
 * Single source of truth for all named EGA palettes used by Wizardry VI
 * renderers. Each entry has full RE provenance in its `provenance:` field.
 * Keyed by the palette's `name` field; `PALETTE_CATALOG[name].name === name`
 * is invariant (enforced by tests).
 */
export const PALETTE_CATALOG: Record<string, Palette> = {
  [EGA_DEFAULT.name]: EGA_DEFAULT,
  [WIZ6_MAIN.name]: WIZ6_MAIN,
  [WIZ6_DUNGEON.name]: WIZ6_DUNGEON,
  // [WIZ6_TITLE.name]: WIZ6_TITLE,
};

/** String-literal union of all catalog keys for type-safe lookup. */
export type PaletteName = keyof typeof PALETTE_CATALOG;

export { EGA_DEFAULT, WIZ6_MAIN, WIZ6_DUNGEON };
// export { WIZ6_TITLE };
```

If Phase 1 added more palettes (Task 7), include them in the imports + `PALETTE_CATALOG` initializer + named re-exports.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd packages/data && pnpm test -- palettes/index 2>&1 | tail -10
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/palettes/index.ts packages/data/tests/palettes/index.test.ts
git commit -m "feat(data): PALETTE_CATALOG index + PaletteName type union"
```

### Task 9: Re-export catalog from `@wiz6/data` root

- [ ] **Step 1: Update `packages/data/src/index.ts`**

Add to the bottom of `packages/data/src/index.ts`:

```typescript
export {
  PALETTE_CATALOG,
  EGA_DEFAULT,
  WIZ6_MAIN,
  WIZ6_DUNGEON,
  // If Phase 1 added more palettes, list them here:
  // WIZ6_TITLE,
  type PaletteName,
} from './palettes/index.js';
```

- [ ] **Step 2: Verify it imports cleanly from a consumer**

```bash
cd packages/data && pnpm build 2>&1 | tail -5
```

Expected: build succeeds. If it fails on `PaletteName` export syntax, change `type PaletteName` to a separate `export type` line:

```typescript
export { PALETTE_CATALOG, EGA_DEFAULT, WIZ6_MAIN, WIZ6_DUNGEON } from './palettes/index.js';
export type { PaletteName } from './palettes/index.js';
```

- [ ] **Step 3: Run all data tests**

```bash
cd packages/data && pnpm test 2>&1 | tail -10
```

Expected: all tests pass; counts have grown by the palette tests added in Tasks 4-8.

- [ ] **Step 4: Commit**

```bash
git add packages/data/src/index.ts
git commit -m "feat(data): re-export PALETTE_CATALOG from package root"
```

---

## Phase 3 — Parser refactor

`pic-render.renderPicDescriptor` takes a `Palette` argument. The hardcoded `WIZ6_PALETTE` and `EGA_PALETTE` constants disappear from the parser. Downstream callers (CLI extractors, viewer pages) pass an explicit palette.

### Task 10: Make `renderPicDescriptor` accept a `Palette` argument

- [ ] **Step 1: Read the existing test file**

Read `packages/parser/tests/formats/pic-render.test.ts` end-to-end. Note that tests use both `WIZ6_PALETTE` and `EGA_PALETTE` constants imported from the parser. They'll be migrated to use the data catalog.

- [ ] **Step 2: Modify the existing test to pass an explicit palette**

Replace the top of `packages/parser/tests/formats/pic-render.test.ts` with:

```typescript
import { describe, expect, it } from 'vitest';
import { renderPicDescriptor } from '../../src/formats/pic-render.js';
import { WIZ6_MAIN, EGA_DEFAULT } from '@wiz6/data';
import type { PicDescriptor } from '@wiz6/data';

function descriptor(opts: { pos: number; width: number; height: number; mask: number[] }): PicDescriptor {
  return {
    index: 0,
    pos: opts.pos,
    width: opts.width,
    height: opts.height,
    mask: [...opts.mask, ...Array(20 - opts.mask.length).fill(0)].slice(0, 20),
  };
}
```

Then change every `renderPicDescriptor(d, buffer)` call to `renderPicDescriptor(d, buffer, WIZ6_MAIN)`, and every `WIZ6_PALETTE[i]!` to `WIZ6_MAIN.colors[i]!`. If there are tests that use `EGA_PALETTE`, update them to pass `EGA_DEFAULT` and use `EGA_DEFAULT.colors[i]!`.

- [ ] **Step 3: Run the test file — expect failures**

```bash
cd packages/parser && pnpm test -- pic-render 2>&1 | tail -20
```

Expected: FAIL with type errors about `renderPicDescriptor` arg count mismatch, and possibly module-not-found for `EGA_PALETTE`/`WIZ6_PALETTE` from the parser.

- [ ] **Step 4: Update `packages/parser/src/formats/pic-render.ts`**

Open the file. Make these changes:

1. Remove the `EGA_PALETTE` and `WIZ6_PALETTE` constants entirely.
2. Remove the long comment block that documents the seven overrides and per-scene-switching TODO.
3. Update the `Palette` import: add `import type { Palette, PicDescriptor } from '@wiz6/data';` (or extend the existing `PicDescriptor`-only import).
4. Change the function signature:

```typescript
export function renderPicDescriptor(
  descriptor: PicDescriptor,
  decodedBuffer: readonly number[],
  palette: Palette,
): RenderedSprite {
```

5. In the function body, replace the lookup `const [r, g, b] = WIZ6_PALETTE[color]!;` with `const [r, g, b] = palette.colors[color]!;`.
6. Remove the lingering TODO comment about per-scene palette switching at the bottom of the file — superseded by this work.

The full updated file should be about 50 lines shorter than the original.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/parser && pnpm test -- pic-render 2>&1 | tail -20
```

Expected: PASS (same number of tests as before).

- [ ] **Step 6: Run all parser tests**

```bash
cd packages/parser && pnpm test 2>&1 | tail -10
```

If anything else in `packages/parser/tests/` breaks, fix the import and update calls to pass a palette argument.

- [ ] **Step 7: Commit**

```bash
git add packages/parser/src/formats/pic-render.ts packages/parser/tests/formats/pic-render.test.ts
git commit -m "refactor(parser): renderPicDescriptor takes Palette arg; drop hardcoded WIZ6_PALETTE/EGA_PALETTE"
```

### Task 11: Update CLI callers of `renderPicDescriptor`

- [ ] **Step 1: Find all CLI callers**

```bash
grep -rn "renderPicDescriptor\|WIZ6_PALETTE\|EGA_PALETTE" packages/cli/src 2>&1
```

Expected: hits in `packages/cli/src/extractors/extract-pic.ts`.

- [ ] **Step 2: Update `packages/cli/src/extractors/extract-pic.ts`**

At the top of the file, add to the imports:

```typescript
import { WIZ6_DUNGEON } from '@wiz6/data';
```

In the `extractPic` function, find the line that calls `renderPicDescriptor`:

```typescript
const sprites = pic.descriptors.map((d) => renderPicDescriptor(d, buffer));
```

Replace with:

```typescript
const sprites = pic.descriptors.map((d) => renderPicDescriptor(d, buffer, WIZ6_DUNGEON));
```

**Reasoning for `WIZ6_DUNGEON`:** monster sprites and most other `.pic` files are drawn during gameplay scenes where palette 2 (dungeon) is the active engine palette per the RE evidence. Title-sequence `.pic` files (if any) would use a different palette — review Phase 1 findings to see if any `.pic` files load during the title sequence. For Phase 3, ship `WIZ6_DUNGEON` as the default; Phase 4 refines this per-asset.

- [ ] **Step 3: Run CLI tests**

```bash
cd packages/cli && pnpm test 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/extractors/extract-pic.ts
git commit -m "refactor(cli): extract-pic passes WIZ6_DUNGEON palette explicitly"
```

### Task 12: Update viewer callers of `renderPicDescriptor`

- [ ] **Step 1: Find all viewer callers**

```bash
grep -rn "renderPicDescriptor" packages/viewer/src 2>&1
```

For each hit:

- [ ] **Step 2: Add explicit palette argument**

At the top of each file that calls `renderPicDescriptor`, add an import:

```typescript
import { WIZ6_DUNGEON } from '@wiz6/data';
```

Then change every `renderPicDescriptor(d, buffer)` call to `renderPicDescriptor(d, buffer, WIZ6_DUNGEON)`. (This is the same default as Task 11; Phase 4 will route per-asset.)

- [ ] **Step 3: Run viewer tests**

```bash
cd packages/viewer && pnpm test 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/viewer/src/<changed files>
git commit -m "refactor(viewer): pic renderer calls pass WIZ6_DUNGEON palette explicitly"
```

### Task 13: Verify the full test suite passes end of Phase 3

- [ ] **Step 1: Run everything**

```bash
pnpm -r test 2>&1 | grep -E "Tests|Test Files" | tail -20
```

Expected: all suites pass. Counts grew by Phase 2 palette tests; nothing decreased.

- [ ] **Step 2: Run typecheck on every package**

```bash
pnpm -r build 2>&1 | tail -20
```

Expected: clean build.

If everything passes, no commit (no diff). If anything failed, fix and amend the relevant Task 10/11/12 commit before proceeding.

---

## Phase 4 — Schema + extractor update

Add an optional `palette` field to asset schemas. CLI extractors populate it from a static per-asset heuristic informed by Phase 1.

### Task 14: Add optional `palette` field to `PicSchema`

- [ ] **Step 1: Write the failing test** — add to `packages/data/tests/pic.test.ts`

Open the file. Find a test that builds a valid `Pic` object and parses it. Add a new test:

```typescript
it('accepts an optional palette name field', () => {
  const pic = {
    id: 'test',
    sourceFile: 'test.pic',
    segments: [],
    descriptors: [],
    palette: 'wiz6-dungeon',
  };
  expect(() => PicSchema.parse(pic)).not.toThrow();
});

it('accepts a Pic without a palette field (backward compat)', () => {
  const pic = {
    id: 'test',
    sourceFile: 'test.pic',
    segments: [],
    descriptors: [],
  };
  expect(() => PicSchema.parse(pic)).not.toThrow();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/data && pnpm test -- pic 2>&1 | tail -10
```

Expected: FAIL — `palette` field rejected as unknown.

- [ ] **Step 3: Update `packages/data/src/schemas/pic.ts`**

Find `PicSchema` definition. Add `palette: z.string().min(1).optional(),` to the schema object.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd packages/data && pnpm test -- pic 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/schemas/pic.ts packages/data/tests/pic.test.ts
git commit -m "feat(data): optional palette field on PicSchema"
```

### Task 15: Add optional `palette` field to `PortraitSetSchema`, `EgaScreenSchema`, `Font4bppSchema`

Repeat the Task-14 pattern three times, once per schema. Each repeats:

- [ ] **Step 1 (PortraitSet): Write the failing test** — add to `packages/data/tests/portrait.test.ts`

```typescript
it('accepts an optional palette name field on PortraitSet', () => {
  const set = {
    sourceFile: 'test.wpx',
    portraitCount: 0,
    portraits: [],
    palette: 'wiz6-main',
  };
  expect(() => PortraitSetSchema.parse(set)).not.toThrow();
});
```

- [ ] **Step 2 (PortraitSet): Run test, expect FAIL.**

- [ ] **Step 3 (PortraitSet): Update `packages/data/src/schemas/portrait.ts`** — add `palette: z.string().min(1).optional(),` to `PortraitSetSchema`.

- [ ] **Step 4 (PortraitSet): Run test, expect PASS.**

- [ ] **Step 5 (EgaScreen): Write the failing test** — add to `packages/data/tests/ega-screen.test.ts`

```typescript
it('accepts an optional palette name field on EgaScreen', () => {
  const screen = {
    sourceFile: 'test.scr',
    width: 320,
    height: 200,
    planes: [[], [], [], []],
    palette: 'wiz6-title',
  };
  expect(() => EgaScreenSchema.parse(screen)).not.toThrow();
});
```

- [ ] **Step 6 (EgaScreen): Run, expect FAIL. Update `packages/data/src/schemas/ega-screen.ts`. Re-run, expect PASS.**

- [ ] **Step 7 (Font4bpp): Write the failing test** — add to `packages/data/tests/font-4bpp.test.ts`

```typescript
it('accepts an optional palette name field on Font4bpp', () => {
  const font = {
    sourceFile: 'test.fnt',
    glyphCount: 0,
    glyphs: [],
    palette: 'wiz6-main',
  };
  expect(() => Font4bppSchema.parse(font)).not.toThrow();
});
```

- [ ] **Step 8 (Font4bpp): Run, expect FAIL. Update `packages/data/src/schemas/font-4bpp.ts`. Re-run, expect PASS.**

- [ ] **Step 9: Commit all three**

```bash
git add packages/data/src/schemas/portrait.ts packages/data/src/schemas/ega-screen.ts packages/data/src/schemas/font-4bpp.ts packages/data/tests/portrait.test.ts packages/data/tests/ega-screen.test.ts packages/data/tests/font-4bpp.test.ts
git commit -m "feat(data): optional palette field on PortraitSet, EgaScreen, Font4bpp schemas"
```

### Task 16: Update `extract-pic` to populate the `palette` field

- [ ] **Step 1: Read the existing `decode-pic` flow**

```bash
grep -n "decodePic\|return" packages/parser/src/formats/pic.ts | head -10
```

Find where `decodePic` constructs and returns the `Pic` object. Note: it's in `packages/parser/src/formats/pic.ts`, NOT in the extractor. The extractor calls `decodePic` and writes the result to JSON.

- [ ] **Step 2: Write the failing test** — `packages/cli/tests/extractors/extract-pic.test.ts`

Look up the existing extract-pic test file, OR if it doesn't exist, create a small one alongside other extractor tests. Add:

```typescript
it('emits a palette field in extracted JSON', () => {
  const tmpdir = mkdtempSync(join(tmpdir(), 'wiz6-extract-pic-test-'));
  const outputPath = join(tmpdir, 'mon00.json');
  extractPic({
    originalPath: 'original/mon00.pic',
    outputPath,
    id: 'mon00',
    emitPngs: false,
  });
  const pic = JSON.parse(readFileSync(outputPath, 'utf-8'));
  expect(pic.palette).toBe('wiz6-dungeon');
  rmSync(tmpdir, { recursive: true });
});
```

If `extract-pic.test.ts` exists, just add the `it(...)` block; otherwise scaffold the imports too following the pattern in `packages/cli/tests/extractors/extract-ega-screen.test.ts` or similar.

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd packages/cli && pnpm test -- extract-pic 2>&1 | tail -10
```

Expected: FAIL — `pic.palette` is undefined.

- [ ] **Step 4: Update `packages/cli/src/extractors/extract-pic.ts`**

Find:

```typescript
const pic = decodePic(bytes, {
  id: opts.id,
  sourceFile: basename(opts.originalPath),
});
mkdirSync(dirname(opts.outputPath), { recursive: true });
writeFileSync(opts.outputPath, JSON.stringify(pic, null, 2));
```

Replace with:

```typescript
const decoded = decodePic(bytes, {
  id: opts.id,
  sourceFile: basename(opts.originalPath),
});
// Static palette assignment per Phase 1 RE evidence: .pic files are drawn
// during gameplay scenes where wiz6-dungeon (palette 2) is the active
// engine palette.
const pic: Pic = { ...decoded, palette: 'wiz6-dungeon' };
mkdirSync(dirname(opts.outputPath), { recursive: true });
writeFileSync(opts.outputPath, JSON.stringify(pic, null, 2));
```

The function return type `Pic` already accommodates the optional `palette` field (added in Task 14).

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/cli && pnpm test -- extract-pic 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 6: Re-run all extracts to refresh JSON outputs**

```bash
pnpm wiz6 extract --all 2>&1 | tail -20
```

Expected: clean re-extraction; no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/extractors/extract-pic.ts packages/cli/tests/extractors/extract-pic.test.ts
git commit -m "feat(cli): extract-pic emits palette='wiz6-dungeon' in extracted JSON"
```

### Task 17: Update `extract-wport`, `extract-wfont-4bpp`, `extract-ega-screen` to populate `palette`

Three extractors, same pattern as Task 16. Palette assignments per Phase-1 evidence (defaults assuming Phase 1 found no new palettes):

| Extractor             | Palette name    | Rationale                                                                 |
| --------------------- | --------------- | ------------------------------------------------------------------------- |
| `extract-wport`       | `wiz6-main`     | Portraits drawn during character creation; palette 1 is active.           |
| `extract-wfont-4bpp`  | `wiz6-main`     | Fonts shared across game; palette 1 is the most common context.           |
| `extract-ega-screen`  | `wiz6-title`    | titlepag/graveyrd/dragonsc loaded during title sequence — title palette.  |

If Phase 1 found different evidence (e.g. `wiz6-title` was discovered to be a runtime variant of `wiz6-main`), substitute the correct names.

For each extractor:

- [ ] **Step 1: Write the failing test** — `packages/cli/tests/extractors/extract-<name>.test.ts`

Pattern (substitute extractor name, sample file, expected palette):

```typescript
it('emits the expected palette field', () => {
  const tmpdir = mkdtempSync(join(tmpdir(), 'wiz6-extract-<name>-test-'));
  const outputPath = join(tmpdir, 'out.json');
  extract<Name>({
    originalPath: 'original/<sample-file>',
    outputPath,
    id: 'sample',
    // ...emitPng false if applicable
  });
  const out = JSON.parse(readFileSync(outputPath, 'utf-8'));
  expect(out.palette).toBe('<expected-palette>');
  rmSync(tmpdir, { recursive: true });
});
```

- [ ] **Step 2: Run the test, expect FAIL.**

- [ ] **Step 3: Update the extractor** to set the palette field, matching the table above.

- [ ] **Step 4: Run the test, expect PASS.**

- [ ] **Step 5: Re-extract all assets**

```bash
pnpm wiz6 extract --all 2>&1 | tail -10
```

- [ ] **Step 6: Commit all three extractors together**

```bash
git add packages/cli/src/extractors/extract-wport.ts packages/cli/src/extractors/extract-wfont-4bpp.ts packages/cli/src/extractors/extract-ega-screen.ts packages/cli/tests/extractors/extract-wport.test.ts packages/cli/tests/extractors/extract-wfont-4bpp.test.ts packages/cli/tests/extractors/extract-ega-screen.test.ts
git commit -m "feat(cli): wport/wfont-4bpp/ega-screen extractors populate palette field"
```

---

## Phase 5 — Viewer migration

Delete `packages/viewer/src/palettes/`. Viewer pages consume `PALETTE_CATALOG` from `@wiz6/data` and read the per-asset palette name from extracted JSON.

### Task 18: Migrate views to read palette from JSON + look up via `PALETTE_CATALOG`

- [ ] **Step 1: Inventory the affected views**

```bash
grep -rln "WIZ6_PALETTE_1\|WIZ6_PALETTE_2\|WIZ6_TITLE_PALETTE\|EGA_PALETTE" packages/viewer/src 2>&1
```

Expected: 5-10 files including `pages/Landing.tsx`, `pages/FontsPage.tsx`, `pages/portraits/PortraitsIndex.tsx`, `views/ScreenGallery.tsx`, `views/PortraitGallery.tsx`, `views/Font4bppGallery.tsx`, `views/ScreenAlignmentTool.tsx`.

- [ ] **Step 2: Update each affected file**

For each file in the inventory:

1. Remove the import from `'../palettes/<name>.js'` or `'../palettes/index.js'`.
2. Add `import { PALETTE_CATALOG, type PaletteName } from '@wiz6/data';`.
3. Where the file imports a specific palette (e.g. `WIZ6_PALETTE_1`), replace with `PALETTE_CATALOG['wiz6-main']`.
4. Where the file accepts a `palette` prop, change the prop type from `Palette` to `PaletteName | Palette` (allow the consumer to pass a name OR a full Palette object). Inside the component, resolve a name to the full palette via `typeof palette === 'string' ? PALETTE_CATALOG[palette] : palette`. (This makes the prop tolerant of both shapes; viewer pages can pass the name from extracted JSON directly.)
5. Where the page reads extracted JSON and renders a gallery, read `data.palette` from the parsed JSON and pass it directly as the `palette` prop.

For the gallery components, here's the exact prop-handling pattern:

```typescript
// Inside the component
const resolvedPalette: Palette = typeof palette === 'string'
  ? (PALETTE_CATALOG[palette] ?? PALETTE_CATALOG['wiz6-main']!)
  : palette;
```

Pass `resolvedPalette` into the renderer call sites.

- [ ] **Step 3: Run viewer tests after each file change**

```bash
cd packages/viewer && pnpm test 2>&1 | tail -10
```

Expected: PASS at every step.

- [ ] **Step 4: Manual sanity check via dev server**

```bash
pnpm dev:viewer
```

Open browser to whatever URL the dev server prints. Click through:
- `/screens/titlepag` — should render with `wiz6-title`.
- `/portraits` — pick a portrait; should render with `wiz6-main`.
- `/fonts/wfont1` — should render with `wiz6-main`.
- `/pics/mon57` (spaceship) — should render with `wiz6-dungeon`; this is the key validation case. Body should now be light blue, not green.

Note any visual issues for Phase 6.

- [ ] **Step 5: Commit the migration**

```bash
git add packages/viewer/src/pages packages/viewer/src/views
git commit -m "refactor(viewer): views consume PALETTE_CATALOG from @wiz6/data + read palette name from extracted JSON"
```

### Task 19: Delete `packages/viewer/src/palettes/`

- [ ] **Step 1: Verify no stale imports**

```bash
grep -rln "from.*palettes" packages/viewer/src 2>&1
```

Expected: empty output (no imports). If any remain, fix them in Task 18 before deleting.

- [ ] **Step 2: Delete the directory**

```bash
rm -rf packages/viewer/src/palettes
```

- [ ] **Step 3: Delete the corresponding tests if any**

```bash
ls packages/viewer/tests/palettes 2>&1 && rm -rf packages/viewer/tests/palettes || echo "no tests dir to remove"
```

- [ ] **Step 4: Run all tests**

```bash
pnpm -r test 2>&1 | grep -E "Tests|Test Files" | tail -10
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A packages/viewer/src/palettes packages/viewer/tests/palettes
git commit -m "refactor(viewer): delete packages/viewer/src/palettes/ — superseded by @wiz6/data catalog"
```

### Task 20: Keep palette-picker dropdown, repurpose default

- [ ] **Step 1: Inspect existing picker logic**

```bash
grep -rn "palette.*select\|select.*palette\|PaletteName" packages/viewer/src 2>&1
```

Look for the dropdown component(s). Most likely in `pages/FontsPage.tsx` or `pages/portraits/PortraitsIndex.tsx` (they had explicit dropdowns).

- [ ] **Step 2: Re-source the picker options from `PALETTE_CATALOG`**

For each page with a picker:

```typescript
import { PALETTE_CATALOG, type PaletteName } from '@wiz6/data';

// Generate options from the catalog:
const PALETTE_OPTIONS: Array<{ name: PaletteName; label: string }> =
  Object.keys(PALETTE_CATALOG).map((name) => ({
    name: name as PaletteName,
    label: name,
  }));
```

Use `PALETTE_OPTIONS` as the dropdown source. Default the dropdown's selected value to whatever `palette` field is on the asset's extracted JSON; user override flips the working palette in local state.

- [ ] **Step 3: Run viewer tests**

```bash
cd packages/viewer && pnpm test 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add packages/viewer/src/pages
git commit -m "refactor(viewer): palette picker default = extracted JSON's palette; options sourced from catalog"
```

---

## Phase 6 — Validation

Pixel-diff the rendered output against DOSBox-X captures for canonical scenes. Confirm spaceship + statue water now render correctly, and no previously-correct scene regressed.

### Task 21: Build the pixel-diff tool in `tools/parity/`

- [ ] **Step 1: Read the existing diff pattern**

```bash
cat tools/parity/diff.py
```

Note style and structure.

- [ ] **Step 2: Write the new tool** — `tools/parity/pixel-diff.py`

```python
#!/usr/bin/env python3
"""Pixel-diff two PNG images (or any image format Pillow can read).

Compares every non-transparent pixel; reports mismatches with their RGB values.
Exit 0 on identical images, 1 on any mismatch.

Usage:
    python3 tools/parity/pixel-diff.py reference.png ours.png

Optional:
    --tolerance N    Allow up to N channel-units of drift per channel (default 0)
    --max-report 10  Limit mismatch report lines (default 10)
    --ignore-alpha   Diff RGB only; ignore alpha channel
"""

from __future__ import annotations

import argparse
import sys

from PIL import Image


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("reference", help="ground-truth image (e.g. DOSBox-X capture)")
    ap.add_argument("ours", help="our render to validate")
    ap.add_argument("--tolerance", type=int, default=0)
    ap.add_argument("--max-report", type=int, default=10)
    ap.add_argument("--ignore-alpha", action="store_true")
    args = ap.parse_args()

    ref = Image.open(args.reference).convert("RGBA")
    ours = Image.open(args.ours).convert("RGBA")

    if ref.size != ours.size:
        print(f"FAIL: size mismatch — reference {ref.size}, ours {ours.size}", file=sys.stderr)
        return 1

    ref_px = ref.load()
    ours_px = ours.load()

    mismatches = []
    for y in range(ref.height):
        for x in range(ref.width):
            r = ref_px[x, y]
            o = ours_px[x, y]
            channels = 3 if args.ignore_alpha else 4
            diff = max(abs(r[c] - o[c]) for c in range(channels))
            if diff > args.tolerance:
                mismatches.append((x, y, r, o, diff))

    if not mismatches:
        print(f"PASS: {ref.size[0]}x{ref.size[1]} pixels identical (tolerance={args.tolerance})")
        return 0

    print(f"FAIL: {len(mismatches)} pixels differ (tolerance={args.tolerance})", file=sys.stderr)
    for (x, y, r, o, diff) in mismatches[: args.max_report]:
        print(f"  ({x},{y})  ref={r}  ours={o}  diff={diff}", file=sys.stderr)
    if len(mismatches) > args.max_report:
        print(f"  ... and {len(mismatches) - args.max_report} more", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: Make it executable + smoke test**

```bash
chmod +x tools/parity/pixel-diff.py
# Smoke test on identical images
python3 tools/parity/pixel-diff.py original/wroot.exe original/wroot.exe 2>&1
```

Expected: error because not a PNG. Try with two PNGs from `extracted/`:

```bash
python3 tools/parity/pixel-diff.py extracted/pics/mon00/contact-sheet.png extracted/pics/mon00/contact-sheet.png
```

Expected: `PASS: NxM pixels identical (tolerance=0)`.

- [ ] **Step 4: Commit**

```bash
git add tools/parity/pixel-diff.py
git commit -m "tools(parity): pixel-diff.py for image-to-image byte parity validation"
```

### Task 22: Capture canonical scenes from DOSBox-X

This is manual. The agent prompts the user to capture each scene, then validates.

- [ ] **Step 1: Prepare a capture target directory**

```bash
mkdir -p tools/parity/captures
```

- [ ] **Step 2: Capture each canonical scene via DOSBox-X**

DOSBox-X has a screenshot keybinding (default Ctrl+F5) that captures to its `capture/` directory. Use `tools/dosbox/wiz6.conf` for determinism.

For each scene in the canonical set, capture a 320×200 frame:

| Scene                | How to navigate                                              | Save as                            |
| -------------------- | ------------------------------------------------------------ | ---------------------------------- |
| Title screen         | Boot game; capture at first frame after `titlepag` displays. | `tools/parity/captures/title.png`  |
| Graveyard            | Lose a TPK; game shows graveyard before reset.               | `tools/parity/captures/graveyard.png` |
| Dragon scene         | Enter the room with the dragon backdrop.                     | `tools/parity/captures/dragonsc.png` |
| Main menu            | First menu after credits (MASTER OPTIONS).                   | `tools/parity/captures/main-menu.png` |
| Character creation   | Start new game; pause on race/class selection.               | `tools/parity/captures/char-create.png` |
| Dungeon view         | Enter any dungeon corridor.                                  | `tools/parity/captures/dungeon.png` |
| Spaceship (mon57)    | Encounter mon57 in combat; pause on sprite display.          | `tools/parity/captures/mon57.png`  |
| Statue water (mon08) | Find the statue scene; pause on sprite.                      | `tools/parity/captures/mon08.png`  |

Resize each to native 320×200 if DOSBox-X output is larger (Pillow can downsample, but DOSBox-X usually outputs at native resolution depending on config — verify).

If executed by a subagent: pause and ask Nate to capture the scenes (no automated DOSBox-X scripting in this project). Resume after he confirms the PNGs are in `tools/parity/captures/`.

- [ ] **Step 3: Verify the captures**

```bash
for f in tools/parity/captures/*.png; do
  echo "$f"
  python3 -c "from PIL import Image; im = Image.open('$f'); print('  size:', im.size, 'mode:', im.mode)"
done
```

Expected: every file is 320×200, mode RGB or RGBA. Resize/convert if needed.

- [ ] **Step 4: Commit the captures**

```bash
git add tools/parity/captures
git commit -m "tools(parity): canonical DOSBox-X scene captures for palette validation"
```

(These PNGs are small; safe to commit.)

### Task 23: Render the same scenes from the viewer/CLI

- [ ] **Step 1: Run the full extraction**

```bash
pnpm wiz6 extract --all 2>&1 | tail -20
```

This re-emits every PNG with the new palette pipeline.

- [ ] **Step 2: Locate the rendered PNGs**

Pixel-diff scope is restricted to scenes with extractor-emitted PNGs (no manual viewer screenshots).

| Scene                | Path                                                                |
| -------------------- | ------------------------------------------------------------------- |
| Title screen         | `extracted/screens/titlepag.png` (or whatever filename the extractor emits — check `extracted/screens/`) |
| Graveyard            | `extracted/screens/graveyrd.png`                                    |
| Dragon scene         | `extracted/screens/dragonsc.png`                                    |
| Spaceship (mon57)    | `extracted/pics/mon57/desc-NN.png` — pick the descriptor that holds the body sprite by visual inspection of the per-descriptor PNGs |
| Statue water (mon08) | `extracted/pics/mon08/desc-NN.png` — same caveat                    |

Main-menu / character-creation / dungeon-traversal scenes are tested by visual inspection in Task 18 step 4, not by pixel-diff (they require live viewer screenshots which add manual scaffolding for diminishing returns).

- [ ] **Step 3: Verify renders exist for all 8 canonical scenes**

```bash
ls extracted/screens/titlepag*.png extracted/screens/graveyrd*.png extracted/screens/dragonsc*.png extracted/pics/mon57/*.png extracted/pics/mon08/*.png 2>&1
```

Expected: all files present.

### Task 24: Run pixel-diff across all canonical scenes

- [ ] **Step 1: Diff each scene**

For each scene with both a capture and a render:

```bash
python3 tools/parity/pixel-diff.py tools/parity/captures/mon57.png extracted/pics/mon57/desc-00.png
```

Record the outcome per scene:
- PASS — no further action.
- FAIL — record the first 10 mismatched pixels and their reference/ours RGB.

- [ ] **Step 2: Analyze failures**

For any FAIL:

- Is the mismatch a transparent-pixel boundary (alpha)? Use `--ignore-alpha` and retry.
- Is the mismatch a single index everywhere (e.g. every "green" pixel is `(0,170,0)` in ours and `(0,255,0)` in the reference)? That's a wrong palette entry — check which catalog member the asset is using vs what RE evidence says.
- Is the mismatch scattered? That's likely a structural rendering bug (plane order, bit packing) — out of scope; flag for separate investigation.

- [ ] **Step 3: If any scene mismatches due to wrong palette assignment, fix the extractor**

Edit the relevant `packages/cli/src/extractors/extract-*.ts` to assign the right palette name; re-run `pnpm wiz6 extract --all`; re-diff.

- [ ] **Step 4: If a scene mismatches due to a missing catalog entry, escalate to Phase 1 gap**

If Phase 1 missed a palette load that affects this scene, add a follow-up entry to `TODO.md` and re-dispatch a targeted RE subagent. Don't paper over with hand-tuning.

- [ ] **Step 5: Commit the validation results**

Once all scenes pass (or known gaps are documented):

```bash
git add docs/superpowers/plans/<this-plan>.md   # if you marked it up with results
git commit -m "validate: phase 6 pixel-diff confirms canonical scenes (results in plan doc)"
```

If you'd rather track validation in a separate doc, write `docs/re/palette-validation-2026-05-23.md` with the per-scene pass/fail outcomes and commit that.

---

## Phase 7 — Close out

### Task 25: Update tracker + finalize docs

- [ ] **Step 1: Update `TODO.md`**

Open `TODO.md`. Delete `#002` from the Open section (per the standing "deleted on close" convention). If any Phase-1 gaps surfaced new tracker items, add them with new IDs.

- [ ] **Step 2: Update the Stage 1d spec footnote**

Open `docs/superpowers/specs/2026-05-19-stage-1d-palette-design.md`. Remove the "per-screen palette switching" non-goal entry — superseded by this work.

- [ ] **Step 3: Update CLAUDE.md**

Open the project `CLAUDE.md`. In the "Known partial / in-progress issues" section, remove the per-scene-palettes (#002) entry. If `wiz6-title` is retained empirically with no traced call site, add a new entry noting that gap.

- [ ] **Step 4: Final test pass**

```bash
pnpm -r test 2>&1 | grep -E "Tests|Test Files" | tail -10
pnpm -r build 2>&1 | tail -5
```

Expected: all green; clean build.

- [ ] **Step 5: Final commit**

```bash
git add TODO.md docs/superpowers/specs/2026-05-19-stage-1d-palette-design.md CLAUDE.md
git commit -m "docs: close #002 — per-scene palette switching shipped"
```

- [ ] **Step 6: Merge to main**

Follow the project's standard merge flow (worktree → PR or direct push to `main`). The deployment pipeline picks up the rebuilt extracted JSON + viewer code; live site at https://wiz6.goldentooth.net updates.

---

## Acceptance criteria recap

1. `docs/re/findings/palette-loads.json` exists, covers every palette-touching site across `wroot.exe`, all `*.ovr`, all `*.drv`; high-confidence sites spot-checked.
2. `docs/re/palette-discovery.md` reflects the comprehensive findings.
3. `packages/data/src/palettes/` houses all named palettes; `PALETTE_CATALOG` exported; every palette has RE provenance.
4. `packages/parser/src/formats/pic-render.ts` takes a `Palette` argument; no hardcoded color constants survive.
5. Every extracted asset JSON carries a `palette` name field referencing a `PALETTE_CATALOG` key.
6. `packages/viewer/src/palettes/` removed; viewer pages read palette via extracted JSON.
7. Spaceship (mon57) and statue water (mon08) render with light blue. Pixel-diff confirms.
8. No regressions on dragonsc, titlepag, character-creation, dungeon-traversal. Pixel-diff confirms.
9. `pnpm -r test` passes; `pnpm -r build` clean.
