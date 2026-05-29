# Tooling + Hygiene Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the five-phase roadmap from `docs/superpowers/specs/2026-05-28-tooling-hygiene-roadmap-design.md` — test hygiene, wbase picker RE follow-up, RE toolkit (four tools), tile-catalog + per-region pixel-parity tests, and a Presenter rendering abstraction.

**Architecture:** Phases run sequentially. Each phase ends with at least one commit. Tools live under `tools/` and run via `pnpm tsx`. Test conventions follow the spec's `*.diagnostic.test.ts` convention. The Presenter is a thin wrapper around the existing `putImageData` path; the WebGL backend is explicitly deferred.

**Tech Stack:** TypeScript ESM (`.js` extensions in imports), pnpm monorepo, vitest, Python3 (for dump-cells.py only), PyGhidra (for Phase 2 RE), Node `pngjs`-free path (we'll add `pngjs` as a dev dep in this plan).

**Spec:** [`docs/superpowers/specs/2026-05-28-tooling-hygiene-roadmap-design.md`](../specs/2026-05-28-tooling-hygiene-roadmap-design.md)

---

## File structure

**Create:**
- `tools/wfont/glyph-decode.ts` — shared 4bpp plane decoder (used by inspect + find-tile + tile-catalog tests)
- `tools/wfont/inspect.ts` — render font glyphs to PNG sheet
- `tools/wfont/find-tile.ts` — search for a glyph matching a pattern
- `tools/parity/save-state-diff.ts` — diff two save-state Memory blobs by DGROUP offset
- `packages/parser/tests/wfont-catalog.test.ts` — chrome-tile pattern assertions
- `docs/re/findings/wbase-picker-internals.json` — Phase 2 RE output
- Possibly: `tools/parity/vitest.config.ts` if it doesn't exist (for the diagnostic exclude pattern)

**Rename:**
- `packages/viewer/tests/pages/roster/creation/ega/cell-parity.test.ts` → `cell-parity.diagnostic.test.ts`
- `packages/viewer/tests/pages/castle/add-party-cell-parity.test.ts` → `add-party-cell-parity.diagnostic.test.ts`

**Modify:**
- `packages/viewer/vitest.config.ts` — add `exclude: ['**/*.diagnostic.test.{ts,tsx}']`
- `packages/parser/vitest.config.ts` — same exclude
- `packages/data/vitest.config.ts` — same exclude
- `packages/cli/vitest.config.ts` — same exclude
- `packages/mcp/vitest.config.ts` — same exclude
- `tools/parity/dump-cells.py` — add `--scan` mode
- `tools/parity/diff-image.ts` — extend `compareRgba` with `regions` option
- `package.json` (root) — add `test:diagnostics` script
- `CLAUDE.md` — add test-layer convention
- `docs/re/wbase-main-menu.md` — promote Phase 2 findings
- `TODO.md` — add entries #028..#035

---

## Phase 1 — Test hygiene

### Task 1: Rename cell-parity tests + update vitest configs

**Files:**
- Rename: `packages/viewer/tests/pages/roster/creation/ega/cell-parity.test.ts` → `cell-parity.diagnostic.test.ts`
- Rename: `packages/viewer/tests/pages/castle/add-party-cell-parity.test.ts` → `add-party-cell-parity.diagnostic.test.ts`
- Modify: `packages/viewer/vitest.config.ts`, `packages/parser/vitest.config.ts`, `packages/data/vitest.config.ts`, `packages/cli/vitest.config.ts`, `packages/mcp/vitest.config.ts`
- Modify: root `package.json` (add `test:diagnostics` script)
- Modify: `CLAUDE.md` (test-layer convention)

#### Steps

- [ ] **Step 1: Rename the two cell-parity test files**

```bash
git mv packages/viewer/tests/pages/roster/creation/ega/cell-parity.test.ts \
       packages/viewer/tests/pages/roster/creation/ega/cell-parity.diagnostic.test.ts
git mv packages/viewer/tests/pages/castle/add-party-cell-parity.test.ts \
       packages/viewer/tests/pages/castle/add-party-cell-parity.diagnostic.test.ts
```

- [ ] **Step 2: Update each package's vitest config to exclude diagnostic tests**

Apply the same change to all 5 configs:

```typescript
// Before (packages/viewer/vitest.config.ts as example):
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});

// After:
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/*.diagnostic.test.{ts,tsx}'],
  },
});
```

For the simpler configs (parser/data/cli/mcp) the `exclude` block lands the same way alongside `include`. Apply to all 5 files.

- [ ] **Step 3: Add test:diagnostics script at root**

Edit `package.json` (root) — add to `scripts`:

```json
"test:diagnostics": "pnpm -r --filter './packages/*' exec vitest run --testPathPattern '\\.diagnostic\\.test\\.[tj]sx?$'"
```

- [ ] **Step 4: Update CLAUDE.md with the test-layer convention**

Find the "Project conventions" section in `CLAUDE.md` (around line 93). Add this bullet after the existing "Every ported screen requires a pixel-exact parity test" bullet:

```markdown
- **Test-layer convention.** Tests fall into four buckets, signaled by filename:
  - `*.test.ts` (gate) — runs in default CI. Includes pixel-parity, schema/composer/store unit tests.
  - `*.diagnostic.test.ts` (informational) — excluded from default CI; runnable via `pnpm test:diagnostics`. Cell-grid parity tests live here — they validate intermediate data structures and are useful for debugging pixel-parity failures, but they can pass while the rendered output is visually wrong (e.g. windows at incorrect screen coords). Don't promote a diagnostic to a gate without a clear reason.
  - Component tests with `skipAssetLoad` (weak) — should be flagged in the test file's docstring if they don't verify rendering, only key handling.
  - End-to-end (e2e) tests via Playwright — manual feature smoke; not in default CI.
```

- [ ] **Step 5: Run the default test suite — diagnostic tests should be excluded**

```bash
pnpm test 2>&1 | tail -20
```

Expected: all packages green. The two renamed cell-parity tests should NOT appear in the test output. Total test count should drop by 2 files (likely 6 tests removed from the count — 5 from cell-parity.diagnostic + 1 from add-party-cell-parity.diagnostic, but verify against the previous run's count).

- [ ] **Step 6: Run the diagnostics suite — should run the two renamed tests**

```bash
pnpm test:diagnostics 2>&1 | tail -10
```

Expected: 2 test files run, both pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(hygiene): rename cell-parity → *.diagnostic.test.ts, exclude from default CI"
```

---

## Phase 2 — RE follow-up on the wbase picker

### Task 2: Dispatch RE subagent for wbase_pcfile_picker internals

**Files:**
- Create: `docs/re/findings/wbase-picker-internals.json`
- Modify: `docs/re/wbase-main-menu.md` (promote findings)
- Modify: `docs/re/findings/wbase-window-struct.json` (update or close unresolved entries if findings resolve them)

This is a parent-agent task — dispatch a subagent for the RE pass, review the findings JSON, then promote verified prose into the canonical doc.

#### Steps

- [ ] **Step 1: Dispatch the RE subagent**

Use the Agent tool with `general-purpose` subagent_type, description "RE wbase_pcfile_picker internals", and the following prompt (adapt working directory if running in a worktree):

```
You are doing a focused reverse-engineering pass on wbase_pcfile_picker @ wbase.ovr 0x2143 — the function that creates and runs the ADD PARTY MEMBER picker.

## Working directory

`cd /Users/nathan/Projects/ndouglas/wiz6` first. Verify with `pwd && git branch --show-current`.

## Existing context (don't redo)

Read first:
- `docs/re/wbase-main-menu.md` (current canonical doc for wbase main menu)
- `docs/re/findings/wbase-add-party-member.json` (the prior RE pass — has the picker function call graph already)
- `docs/re/findings/wbase-window-struct.json` (documents the unresolved cells_off discrepancy)
- `CLAUDE.md` (project conventions, thunk-delta law, address-typed offsets, RE caveats)

The picker has these known properties from the prior pass:
- Outer window struct in memory says x=20, but engine renders content at x=22 (NATHAN highlight lands at global cells 22-27, not 20-25).
- Right panel's cells_off = struct + 0x14 (vs +0x10 for the left panel). 4 unexplained bytes at struct+0x10..0x13.
- Banner row (cell row 18) uses specific chrome tiles: wfont3 0x5f (cells 0-18), wfont3 0x1d (cell 19, banner-bar + right-edge), wfont1 0x23 (cells 20-39, top-edge-only).
- Middle strip at cell 19 across rows 19-23: wfont1 0x1c (right-edge vertical line).
- Corner at cell (19, 24): wfont1 0x1f (bottom-right L).
- Picker title at cells 5-14 row 18 uses lowercase 'add\x5fmember' at attr 0x03 (wfont3, same convention as MASTER OPTIONS).

These were derived empirically from pixel data — the engine routines that PRODUCE them are still uncharted.

## Open questions to answer

1. **`ui_window_create` arg semantics for the outer + inner picker windows.** Read the two `func_bbb6` call sites in `wbase_pcfile_picker` and document exactly which arg slots are x, y, w, h, attr. Then explain the x=20-stored-but-renders-at-x=22 discrepancy — is there a post-creation adjustment, an offset added during render, or is the struct misnamed?

2. **The chrome tile painting routine.** Find the routine that writes the banner's chrome tiles (0x5f / 0x1d / 0x23) and the right-edge line (0x1c) and corner (0x1f). Is there a generic "draw bordered picker frame" helper, or are these inline writes? Document which thunks it calls (apply the thunk-delta law from CLAUDE.md to translate to wroot offsets).

3. **The cells_off discrepancy.** Why does the left panel's cells start at struct+0x10 but the right panel's at struct+0x14? What are the 4 bytes at struct+0x10..0x13 for the right panel? Are they a separate sub-header, padding, or a different struct variant?

## Tools available

- `tools/ghidra/scripts/decompile.py --binary wbase.ovr --addr 0x2143` (PyGhidra; Ghidra GUI must be closed).
- `tools/ghidra/scripts/list_functions.py`, `find_string_xrefs.py` for cross-reference queries.
- `ndisasm -b 16 -o 0x2143 original/wbase.ovr` for raw byte disasm.
- MCP tools: `mcp__wiz6__dosbox_read_memory`, `mcp__wiz6__dosbox_find_pattern`, `mcp__wiz6__dosbox_map_segments`, `mcp__wiz6__dosbox_read_struct`.

## Critical address conventions (re-read CLAUDE.md if uncertain)

- Thunk-delta law: `wroot_image = thunk_addr - 0xBA9C`, then `wroot_file = wroot_image + 0x200`.
- wbase.ovr data-segment delta: `file_offset = CS_disp16 - 0x4564`.
- Findings JSON address format: `{ "space": "wbase.ovr", "offset": "0x2143" }`.

## RE caveats

- Mark `confidence: low` on any comparator (JL/JG/JLE/JGE) the disasm is ambiguous about.
- Don't trust "findings/wbase-add-party-member.json" implicitly — even its high-confidence claims could have errors. Cross-check.
- 1-indexed vs 0-indexed: always verify.

## Deliverable

Write findings to `docs/re/findings/wbase-picker-internals.json` matching the schema in `docs/re/findings/README.md`:

- Top-level: `topic`, `subagent_run` (ISO 8601 UTC), `binaries`, `summary`, `method`, `stats`.
- `findings` array — each finding has a unique `id`, a `claim`, segment-typed `address` evidence, `confidence` (high/medium/low), and `applied_name` if proposing a function/var name.
- Sections to include:
  - `ui_window_create_arg_layout` — what each push position means
  - `picker_geometry_render_adjustment` — explanation for x=20 → renders at 22 (if found)
  - `cells_off_discrepancy` — explanation for +0x10 vs +0x14 split
  - `chrome_tile_painting_routine` — the routine + thunks that write the chrome tiles
- `unresolved` array for anything that needs further investigation.

**Do NOT modify** `docs/re/wbase-main-menu.md` or `docs/re/findings/wbase-window-struct.json` — the parent will promote findings after review.

Make your final report under 400 words: just summarize what you found, surprises vs. the prior sketch, the JSON file path, and any critical TODOs.
```

- [ ] **Step 2: Review the subagent's findings JSON**

Read `docs/re/findings/wbase-picker-internals.json`. Spot-check the high-confidence claims:

- For the `ui_window_create_arg_layout` finding, disasm the actual `call 0xbbb6` instruction in `wbase_pcfile_picker` (around wbase 0x2200) and verify the push order matches what the finding claims.
- For the `cells_off_discrepancy` finding, read the actual memory in `save/1.sav` at the right panel struct address to confirm the proposed interpretation.

Run:
```bash
dd if=original/wbase.ovr bs=1 skip=$((0x2143)) count=400 2>/dev/null | ndisasm -b 16 -o 0x2143 - | head -80
```

Look for the two `bbb6` calls and verify the finding's arg-order claim.

- [ ] **Step 3: Promote verified findings to docs/re/wbase-main-menu.md**

Append a new section "### Picker internals (chrome + geometry mechanism)" under the "Slot 0 — ADD PARTY MEMBER (deep dive)" section. The prose should:
- State the resolved `ui_window_create` arg layout (with example: `func_bbb6(parent, x, y, w, h, attr, ?, ?)`).
- Explain the x=20-but-renders-at-22 mechanism.
- Document the cells_off split with a clear table.
- Reference the chrome tile painting routine + the thunks involved.

Add to the README of `docs/re/findings/` the promoted-from line:
```
- wbase-picker-internals.json → docs/re/wbase-main-menu.md "Picker internals (chrome + geometry mechanism)", YYYY-MM-DD
```

- [ ] **Step 4: Update wbase-window-struct.json**

If the cells_off discrepancy was resolved in Phase 2's findings, update `docs/re/findings/wbase-window-struct.json`:
- Move resolved items from `unresolved` to a new `resolved` array with a pointer to `wbase-picker-internals.json`.
- Keep any genuinely-still-unresolved items in `unresolved`.

- [ ] **Step 5: Opportunistic simplification check**

Now that we understand the geometry: can we simplify `packages/viewer/src/pages/castle/compose-add-party-picker-frame.ts`? Specifically — if the x=22 hack was actually a struct-x of 22 (not 20), we might be able to read the value directly from the fixture instead of hardcoding. If a clean simplification is possible, apply it (single small commit). If not, leave as-is.

Run pixel-parity after any change to confirm we still hit 100%:
```bash
cd tools/parity && npx vitest run add-party-parity 2>&1 | grep match=
```

Expected: `match=100.00% diff=0px`.

- [ ] **Step 6: Commit**

```bash
git add docs/re/findings/wbase-picker-internals.json docs/re/wbase-main-menu.md docs/re/findings/README.md docs/re/findings/wbase-window-struct.json
# Plus any compose-add-party-picker-frame.ts changes from step 5
git commit -m "re(wbase): resolve picker internals — cells_off, render-x adjustment, chrome routine"
```

---

## Phase 3 — RE toolkit

Each tool is its own task. Order: 3a → 3b → 3c → 3d.

### Task 3: wfont inspector (`tools/wfont/inspect.ts`)

**Files:**
- Create: `tools/wfont/glyph-decode.ts` (shared 4bpp plane decoder)
- Create: `tools/wfont/inspect.ts` (CLI)
- Create: `tools/wfont/glyph-decode.test.ts` (unit test for the decoder)
- Modify: `tools/parity/package.json` or create `tools/wfont/package.json` (workspace setup)

#### Steps

- [ ] **Step 1: Add tools/wfont as a workspace package**

Check the root `pnpm-workspace.yaml`:
```bash
cat pnpm-workspace.yaml
```

Add `'tools/wfont'` to the packages list if not already covered by a glob pattern.

Create `tools/wfont/package.json`:
```json
{
  "name": "@wiz6/wfont-tools",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "@types/node": "^20.14.0"
  }
}
```

Run `pnpm install` to wire the workspace.

- [ ] **Step 2: Write the failing test for glyph-decode**

Create `tools/wfont/glyph-decode.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { decodeGlyph, encodePattern } from './glyph-decode.js';

describe('decodeGlyph', () => {
  it('decodes a 32-byte 4bpp tile into an 8×8 palette-index grid', () => {
    // wfont3 char 0x5f (underscore-bar): black row 0 + 6 gray rows + black row 7
    // 4 plane bytes per row: planes G, B, R, I (MSB-first within each plane byte)
    // Row N's 4 planes are at bytes [N], [N+8], [N+16], [N+24].
    // For "all 0" rows: all plane bits are 0. For "all 8" rows: only plane I bit is set.
    const bytes = new Uint8Array(32);
    // rows 1-6: all 8 (plane I = 0xff, others 0)
    for (let r = 1; r <= 6; r++) bytes[24 + r] = 0xff;
    // rows 0 and 7 stay as zeros (all black)

    const grid = decodeGlyph(bytes);
    expect(grid).toHaveLength(8);
    expect(grid[0]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]); // black top
    expect(grid[1]).toEqual([8, 8, 8, 8, 8, 8, 8, 8]); // gray
    expect(grid[6]).toEqual([8, 8, 8, 8, 8, 8, 8, 8]); // gray
    expect(grid[7]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]); // black bottom
  });

  it('encodePattern parses a pattern string into a grid', () => {
    const grid = encodePattern('00000000;88888888;88888888;88888888;88888888;88888888;88888888;00000000');
    expect(grid).toHaveLength(8);
    expect(grid[0]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(grid[1]).toEqual([8, 8, 8, 8, 8, 8, 8, 8]);
    expect(grid[7]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('encodePattern allows ? as wildcard', () => {
    const grid = encodePattern('????????;88888888;????????;????????;????????;????????;????????;00000000');
    expect(grid[0]).toEqual(['?', '?', '?', '?', '?', '?', '?', '?']);
    expect(grid[1]).toEqual([8, 8, 8, 8, 8, 8, 8, 8]);
  });
});
```

Run:
```bash
pnpm --filter @wiz6/wfont-tools test 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement glyph-decode.ts**

Create `tools/wfont/glyph-decode.ts`:

```typescript
/**
 * 4bpp wfont glyph decoder.
 *
 * Each glyph is 32 bytes: 4 EGA planes (G, B, R, I) × 8 rows.
 * Row N's plane bytes are at indices [N, N+8, N+16, N+24].
 * Within each plane byte, bit 7 is the leftmost pixel.
 *
 * Output: 8 rows × 8 columns of 4-bit palette indices (0..15).
 */
export type GlyphGrid = number[][];
export type Pattern = (number | '?')[][];

export function decodeGlyph(bytes: ArrayLike<number>): GlyphGrid {
  const out: GlyphGrid = [];
  for (let row = 0; row < 8; row++) {
    const pG = bytes[row] ?? 0;
    const pB = bytes[8 + row] ?? 0;
    const pR = bytes[16 + row] ?? 0;
    const pI = bytes[24 + row] ?? 0;
    const cells: number[] = [];
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      cells.push(
        ((pG >> bit) & 1) |
        (((pB >> bit) & 1) << 1) |
        (((pR >> bit) & 1) << 2) |
        (((pI >> bit) & 1) << 3),
      );
    }
    out.push(cells);
  }
  return out;
}

/**
 * Parse a pattern string into a grid. Pattern syntax:
 *   - 8 rows separated by ';'
 *   - Each row 8 chars, each char a hex digit (0..f) OR '?' for wildcard.
 * Example: '00000000;88888888;88888888;88888888;88888888;88888888;88888888;00000000'
 *          (the wfont3 0x5f banner-bar pattern)
 */
export function encodePattern(pattern: string): Pattern {
  const rows = pattern.split(';');
  if (rows.length !== 8) {
    throw new Error(`pattern must have 8 rows, got ${rows.length}`);
  }
  return rows.map((row, ri) => {
    if (row.length !== 8) {
      throw new Error(`row ${ri} must have 8 chars, got ${row.length}`);
    }
    return [...row].map((ch) => {
      if (ch === '?') return '?' as const;
      const n = parseInt(ch, 16);
      if (Number.isNaN(n)) throw new Error(`invalid pattern char '${ch}' at row ${ri}`);
      return n;
    });
  });
}

export function gridMatchesPattern(grid: GlyphGrid, pattern: Pattern): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = pattern[r]![c]!;
      if (p === '?') continue;
      if (grid[r]![c]! !== p) return false;
    }
  }
  return true;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @wiz6/wfont-tools test 2>&1 | tail -10
```
Expected: 3 tests pass.

- [ ] **Step 5: Add pngjs as a dev dep**

```bash
pnpm --filter @wiz6/wfont-tools add -D pngjs @types/pngjs
```

- [ ] **Step 6: Write the inspect.ts CLI**

Create `tools/wfont/inspect.ts`:

```typescript
#!/usr/bin/env -S pnpm tsx
/**
 * wfont inspect — render every glyph of a wfont to a labeled PNG sheet.
 *
 * Usage:
 *   pnpm tsx tools/wfont/inspect.ts <font-name>   # one font (wfont0..wfont4)
 *   pnpm tsx tools/wfont/inspect.ts --all         # all five
 *
 * Output: extracted/font-sheets/<font-name>.png (16×8 grid at 4× scale, with
 * hex char codes labeled below each glyph).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { decodeGlyph } from './glyph-decode.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const FONTS_DIR = join(REPO_ROOT, 'extracted', 'fonts');
const OUT_DIR = join(REPO_ROOT, 'extracted', 'font-sheets');

// WIZ6_MAIN palette (16 entries, RGB). Inline to avoid pulling in @wiz6/data.
const PALETTE: [number, number, number][] = [
  [0x00, 0x00, 0x00], [0xff, 0xff, 0xff], [0x00, 0xaa, 0x00], [0x55, 0xff, 0x55],
  [0xff, 0x55, 0x55], [0xff, 0xff, 0x55], [0x55, 0xff, 0xff], [0x00, 0x00, 0x00],
  [0x55, 0x55, 0x55], [0xaa, 0xaa, 0xaa], [0xff, 0x00, 0x00], [0xff, 0x55, 0xff],
  [0xff, 0x00, 0x00], [0xff, 0x55, 0xff], [0x00, 0xaa, 0xaa], [0xaa, 0xaa, 0xaa],
];
// Note: this palette is APPROXIMATE for visualization — the engine's exact
// AC→DAC chain is in @wiz6/data WIZ6_MAIN. For inspection purposes, the
// per-pixel distinction matters more than the exact colors.

const SCALE = 4;
const GLYPH_W = 8;
const GLYPH_H = 8;
const COLS = 16;
const ROWS = 8;
const LABEL_H = 8;
const CELL_W = GLYPH_W * SCALE;
const CELL_H = GLYPH_H * SCALE + LABEL_H;
const PAD = 2;
const SHEET_W = COLS * (CELL_W + PAD) + PAD;
const SHEET_H = ROWS * (CELL_H + PAD) + PAD;

// Minimal 5×7 digit font for labels (chars '0'..'9', 'a'..'f', 'x')
// Each glyph is 7 bytes; bit 0 = leftmost pixel.
const LABEL_FONT: Record<string, number[]> = {
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x0e, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  'a': [0x00, 0x00, 0x0e, 0x01, 0x0f, 0x11, 0x0f],
  'b': [0x10, 0x10, 0x1e, 0x11, 0x11, 0x11, 0x1e],
  'c': [0x00, 0x00, 0x0e, 0x10, 0x10, 0x11, 0x0e],
  'd': [0x01, 0x01, 0x0f, 0x11, 0x11, 0x11, 0x0f],
  'e': [0x00, 0x00, 0x0e, 0x11, 0x1f, 0x10, 0x0e],
  'f': [0x06, 0x09, 0x08, 0x1c, 0x08, 0x08, 0x08],
  'x': [0x00, 0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11],
};

function drawLabel(png: PNG, x: number, y: number, text: string): void {
  let cx = x;
  for (const ch of text) {
    const glyph = LABEL_FONT[ch] ?? [0, 0, 0, 0, 0, 0, 0];
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        const bit = (glyph[r]! >> (4 - c)) & 1;
        if (bit) {
          const px = cx + c;
          const py = y + r;
          if (px < png.width && py < png.height) {
            const i = (py * png.width + px) * 4;
            png.data[i] = 0xff;
            png.data[i + 1] = 0xff;
            png.data[i + 2] = 0xff;
            png.data[i + 3] = 0xff;
          }
        }
      }
    }
    cx += 6;
  }
}

function renderFontSheet(fontName: string): void {
  const fontPath = join(FONTS_DIR, `${fontName}.json`);
  if (!existsSync(fontPath)) {
    console.error(`font not found: ${fontPath}`);
    process.exitCode = 1;
    return;
  }
  const font = JSON.parse(readFileSync(fontPath, 'utf-8'));
  const png = new PNG({ width: SHEET_W, height: SHEET_H });
  // Background: dark gray (palette 8) for visual contrast.
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0x22;
    png.data[i + 1] = 0x22;
    png.data[i + 2] = 0x22;
    png.data[i + 3] = 0xff;
  }
  for (let code = 0; code < 128; code++) {
    const bytes = font.glyphs?.[code];
    if (!bytes || bytes.length !== 32) continue;
    const grid = decodeGlyph(bytes);
    const col = code % COLS;
    const row = Math.floor(code / COLS);
    const cx0 = PAD + col * (CELL_W + PAD);
    const cy0 = PAD + row * (CELL_H + PAD);
    for (let gy = 0; gy < GLYPH_H; gy++) {
      for (let gx = 0; gx < GLYPH_W; gx++) {
        const pi = grid[gy]![gx]!;
        const rgb = PALETTE[pi] ?? [0xff, 0x00, 0xff]; // magenta sentinel
        for (let sy = 0; sy < SCALE; sy++) {
          for (let sx = 0; sx < SCALE; sx++) {
            const px = cx0 + gx * SCALE + sx;
            const py = cy0 + gy * SCALE + sy;
            const i = (py * png.width + px) * 4;
            png.data[i] = rgb[0]!;
            png.data[i + 1] = rgb[1]!;
            png.data[i + 2] = rgb[2]!;
            png.data[i + 3] = 0xff;
          }
        }
      }
    }
    drawLabel(png, cx0, cy0 + GLYPH_H * SCALE + 1, `0x${code.toString(16).padStart(2, '0')}`);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `${fontName}.png`);
  writeFileSync(outPath, PNG.sync.write(png));
  console.log(`wrote ${outPath}`);
}

const args = process.argv.slice(2);
if (args[0] === '--all') {
  for (const name of ['wfont0', 'wfont1', 'wfont2', 'wfont3', 'wfont4']) renderFontSheet(name);
} else if (args[0]) {
  renderFontSheet(args[0]);
} else {
  console.error('usage: pnpm tsx tools/wfont/inspect.ts <font-name> | --all');
  process.exitCode = 1;
}
```

- [ ] **Step 7: Run inspect on a known font and visually verify**

```bash
pnpm tsx tools/wfont/inspect.ts wfont3
```
Expected: `wrote .../extracted/font-sheets/wfont3.png`. Open the PNG — confirm:
- 128 glyph cells visible in a 16×8 grid
- Each cell has its hex char code (e.g. `0x5f`) labeled below
- Char 0x5f's tile shows black top + gray middle + black bottom (the banner-bar tile we identified during ADD PARTY work)
- Char 0x20 (space) tile shows all gray

- [ ] **Step 8: Run --all and verify all five fonts produced**

```bash
pnpm tsx tools/wfont/inspect.ts --all
ls extracted/font-sheets/
```
Expected: `wfont0.png`, `wfont1.png`, `wfont2.png`, `wfont3.png`, `wfont4.png` all exist.

- [ ] **Step 9: Commit**

```bash
git add tools/wfont/ pnpm-workspace.yaml pnpm-lock.yaml extracted/font-sheets/
git commit -m "tools(wfont): add inspect.ts — render every glyph to a labeled PNG sheet"
```

Note: commit the PNGs as well — they're permanent artifacts useful for RE work and tile lookup. Update `.gitignore` if needed to NOT exclude `extracted/font-sheets/`.

---

### Task 4: find-tile CLI (`tools/wfont/find-tile.ts`)

**Files:**
- Create: `tools/wfont/find-tile.ts`
- Create: `tools/wfont/find-tile.test.ts`

#### Steps

- [ ] **Step 1: Write the failing test**

Create `tools/wfont/find-tile.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { searchForPattern } from './find-tile.js';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function loadFont(name: string) {
  const path = join(REPO_ROOT, 'extracted', 'fonts', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

describe('searchForPattern', () => {
  it('finds wfont3 char 0x5f for the underscore-bar pattern', () => {
    const fonts = { wfont3: loadFont('wfont3') };
    const matches = searchForPattern(
      fonts,
      '00000000;88888888;88888888;88888888;88888888;88888888;88888888;00000000',
    );
    expect(matches).toContainEqual({ font: 'wfont3', char: 0x5f });
  });

  it('wildcards match any value', () => {
    const fonts = { wfont3: loadFont('wfont3') };
    // Pattern that matches ANY glyph (all wildcards)
    const matches = searchForPattern(
      fonts,
      '????????;????????;????????;????????;????????;????????;????????;????????',
    );
    expect(matches.length).toBeGreaterThan(50);
  });

  it('returns empty when no glyph matches', () => {
    const fonts = { wfont3: loadFont('wfont3') };
    // Pattern of all 0xf — unlikely to match any actual glyph
    const matches = searchForPattern(
      fonts,
      'ffffffff;ffffffff;ffffffff;ffffffff;ffffffff;ffffffff;ffffffff;ffffffff',
    );
    expect(matches).toEqual([]);
  });
});
```

Run:
```bash
pnpm --filter @wiz6/wfont-tools test find-tile 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 2: Implement find-tile.ts**

Create `tools/wfont/find-tile.ts`:

```typescript
#!/usr/bin/env -S pnpm tsx
/**
 * find-tile — search wfonts for a glyph matching an 8×8 pixel pattern.
 *
 * Usage:
 *   pnpm tsx tools/wfont/find-tile.ts --pattern '00000000;88888888;...'
 *
 * Pattern syntax: 8 rows separated by ';', each row 8 hex chars (0..f).
 * '?' = wildcard, matches any palette index.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGlyph, encodePattern, gridMatchesPattern } from './glyph-decode.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const FONTS_DIR = join(REPO_ROOT, 'extracted', 'fonts');
const FONT_NAMES = ['wfont0', 'wfont1', 'wfont2', 'wfont3', 'wfont4'];

export interface Match {
  font: string;
  char: number;
}

export function searchForPattern(
  fonts: Record<string, { glyphs: number[][] }>,
  patternStr: string,
): Match[] {
  const pattern = encodePattern(patternStr);
  const matches: Match[] = [];
  for (const [name, font] of Object.entries(fonts)) {
    for (let code = 0; code < font.glyphs.length; code++) {
      const bytes = font.glyphs[code];
      if (!bytes || bytes.length !== 32) continue;
      const grid = decodeGlyph(bytes);
      if (gridMatchesPattern(grid, pattern)) {
        matches.push({ font: name, char: code });
      }
    }
  }
  return matches;
}

function loadAllFonts(): Record<string, { glyphs: number[][] }> {
  const out: Record<string, { glyphs: number[][] }> = {};
  for (const name of FONT_NAMES) {
    const path = join(FONTS_DIR, `${name}.json`);
    if (existsSync(path)) {
      out[name] = JSON.parse(readFileSync(path, 'utf-8'));
    }
  }
  return out;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const patternIdx = args.indexOf('--pattern');
  if (patternIdx < 0 || patternIdx + 1 >= args.length) {
    console.error('usage: pnpm tsx tools/wfont/find-tile.ts --pattern \'<8x8 grid>\'');
    console.error('example: --pattern \'00000000;88888888;88888888;88888888;88888888;88888888;88888888;00000000\'');
    process.exit(1);
  }
  const matches = searchForPattern(loadAllFonts(), args[patternIdx + 1]!);
  if (matches.length === 0) {
    console.log('no matches');
  } else {
    for (const m of matches) {
      console.log(`${m.font} char 0x${m.char.toString(16).padStart(2, '0')} (${m.char})`);
    }
  }
}
```

- [ ] **Step 3: Run tests — verify they pass**

```bash
pnpm --filter @wiz6/wfont-tools test find-tile 2>&1 | tail -10
```
Expected: 3 tests pass.

- [ ] **Step 4: Run the CLI to verify**

```bash
pnpm tsx tools/wfont/find-tile.ts --pattern '00000000;88888888;88888888;88888888;88888888;88888888;88888888;00000000'
```
Expected output includes `wfont3 char 0x5f (95)` (the banner-bar tile we identified during ADD PARTY work). Possibly also `wfont1 char 0x5f` if the same pattern exists there.

- [ ] **Step 5: Commit**

```bash
git add tools/wfont/find-tile.ts tools/wfont/find-tile.test.ts
git commit -m "tools(wfont): add find-tile.ts — search wfonts for glyphs matching a pattern"
```

---

### Task 5: dump-cells.py --scan mode

**Files:**
- Modify: `tools/parity/dump-cells.py`

#### Steps

- [ ] **Step 1: Read the current dump-cells.py structure**

```bash
wc -l tools/parity/dump-cells.py
grep -n "^def \|argparse\|sys.argv" tools/parity/dump-cells.py
```

- [ ] **Step 2: Add the --scan mode**

Edit `tools/parity/dump-cells.py`. Add this function at the bottom (before `main`):

```python
def scan_for_windows(b: bytes):
    """Scan the full Memory blob for plausible TileWindow structs.

    A candidate is a byte offset where:
      - byte[0] (w) in [1, 40]
      - byte[1] (h) in [1, 25]
      - byte[2] (x) in [0, 39]
      - byte[3] (y) in [0, 24]
      - x + w <= 40, y + h <= 25
      - cells region (struct+0x10 .. struct+0x10+w*h*2) is non-empty AND has
        a plausible char/attr alternation (most chars in printable range or
        common control codes; most attrs in [0x00, 0xff] — which is all of
        them, but a 'plausible' attr is one that doesn't look like uniform
        garbage)
    Yields (struct_off, w, h, x, y, attr, content_preview, confidence_score).
    """
    candidates = []
    n = len(b)
    for off in range(0, n - 0x10 - 16):
        w, h, x, y, attr = b[off], b[off + 1], b[off + 2], b[off + 3], b[off + 4]
        if not (1 <= w <= 40 and 1 <= h <= 25): continue
        if not (0 <= x <= 39 and 0 <= y <= 24): continue
        if x + w > 40 or y + h > 25: continue
        cells_off = off + 0x10
        cells_len = w * h * 2
        if cells_off + cells_len > n: continue
        # Score: count cells that have a printable char OR a known control
        # code (0x00..0x1f frame tiles, 0x20 space).
        score = 0
        sample = b[cells_off:cells_off + min(cells_len, 80)]
        chars = sample[::2]
        for c in chars:
            if (0x20 <= c < 0x7f) or (c < 0x20):
                score += 1
        score = score / max(1, len(chars))
        if score < 0.5: continue
        # Build a preview of row 0
        row0 = b[cells_off:cells_off + w * 2]
        preview = ''.join(chr(c) if 0x20 <= c < 0x7f else '.' for c in row0[::2])
        candidates.append((off, w, h, x, y, attr, preview, score))
    # Sort by confidence (highest first), then offset
    candidates.sort(key=lambda c: (-c[7], c[0]))
    return candidates


def cmd_scan(save_path):
    b = mem(save_path)
    cands = scan_for_windows(b)
    print(f"Found {len(cands)} candidate window structs (confidence >= 0.5):\n")
    for off, w, h, x, y, attr, preview, score in cands[:50]:
        print(f"  off=0x{off:x} {w}x{h}@({x},{y}) attr=0x{attr:02x} score={score:.2f}")
        print(f"    row0: {preview!r}")
```

- [ ] **Step 3: Wire --scan into the CLI**

Find `def main()` in `dump-cells.py`. Add the `--scan` flag handling. Example:

```python
def main():
    save = Path(sys.argv[1])
    if '--scan' in sys.argv:
        cmd_scan(save)
        return
    # ... existing code ...
```

- [ ] **Step 4: Run --scan on save 1 and verify output**

```bash
python3 tools/parity/dump-cells.py tools/dosbox/save/1.sav --scan 2>&1 | head -30
```

Expected: at least 5-10 candidate windows printed. Specifically should find:
- The picker's left panel (`19x5@(0,19)` or similar)
- The picker's right panel (`20x5@(22,19)` or `20x5@(20,19)` — depending on which struct it finds)
- The castle's menu pane (`40x5@(0,20)`)

If the output is empty or only finds 1-2 windows, the heuristic is too strict — adjust the score threshold or character-range check until known windows appear.

- [ ] **Step 5: Commit**

```bash
git add tools/parity/dump-cells.py
git commit -m "tools(parity): dump-cells --scan mode finds ALL plausible window structs"
```

---

### Task 6: save-state diff tool (`tools/parity/save-state-diff.ts`)

**Files:**
- Create: `tools/parity/save-state-diff.ts`
- Create: `tools/parity/save-state-diff.test.ts`

#### Steps

- [ ] **Step 1: Add `unzipper` or use built-in zlib for reading save .sav files**

Check what's available:
```bash
grep "unzipper\|adm-zip\|zlib" packages/mcp/package.json tools/parity/package.json 2>&1
```

The MCP package may already extract Memory from .sav files. Reuse if possible. Otherwise add a minimal extraction.

Look at how `tools/parity/dump-cells.py` extracts Memory (Python `zipfile`) — we want the TypeScript equivalent. Spawn `unzip -p <file> Memory` is the simplest cross-platform option:

- [ ] **Step 2: Write the failing test**

Create `tools/parity/save-state-diff.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { diffMemoryBlobs } from './save-state-diff.js';

describe('diffMemoryBlobs', () => {
  it('finds no diffs between identical buffers', () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 2, 3, 4, 5]);
    expect(diffMemoryBlobs(a, b)).toEqual([]);
  });

  it('finds a single-byte diff and reports it as a 1-byte run', () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 2, 7, 4, 5]);
    const runs = diffMemoryBlobs(a, b);
    expect(runs).toEqual([{ start: 2, length: 1, oldBytes: [3], newBytes: [7] }]);
  });

  it('groups contiguous diffs into a single run', () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array([1, 9, 8, 7, 5]);
    const runs = diffMemoryBlobs(a, b);
    expect(runs).toEqual([{ start: 1, length: 3, oldBytes: [2, 3, 4], newBytes: [9, 8, 7] }]);
  });

  it('returns multiple runs when diffs are non-contiguous', () => {
    const a = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const b = new Uint8Array([9, 2, 3, 7, 5, 8]);
    const runs = diffMemoryBlobs(a, b);
    expect(runs).toHaveLength(3);
    expect(runs[0]!.start).toBe(0);
    expect(runs[1]!.start).toBe(3);
    expect(runs[2]!.start).toBe(5);
  });
});
```

Run:
```bash
pnpm --filter @wiz6/parity test save-state-diff 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement save-state-diff.ts**

Create `tools/parity/save-state-diff.ts`:

```typescript
#!/usr/bin/env -S pnpm tsx
/**
 * save-state-diff — diff two DOSBox-X save-state Memory blobs.
 *
 * Reports byte offsets that differ, grouped into contiguous runs.
 * When run offsets fall within a known DGROUP segment (per the segment
 * map from MCP), the report annotates them with segment-typed addresses.
 *
 * Usage:
 *   pnpm tsx tools/parity/save-state-diff.ts <save-a> <save-b>
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export interface DiffRun {
  start: number;
  length: number;
  oldBytes: number[];
  newBytes: number[];
}

export function diffMemoryBlobs(a: Uint8Array, b: Uint8Array): DiffRun[] {
  const len = Math.min(a.length, b.length);
  const runs: DiffRun[] = [];
  let inRun = false;
  let runStart = 0;
  for (let i = 0; i <= len; i++) {
    const differ = i < len && a[i] !== b[i];
    if (differ && !inRun) {
      inRun = true;
      runStart = i;
    } else if (!differ && inRun) {
      const length = i - runStart;
      runs.push({
        start: runStart,
        length,
        oldBytes: Array.from(a.slice(runStart, i)),
        newBytes: Array.from(b.slice(runStart, i)),
      });
      inRun = false;
    }
  }
  return runs;
}

function loadMemory(savPath: string): Uint8Array {
  const r = spawnSync('unzip', ['-p', savPath, 'Memory'], { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`unzip -p ${savPath} Memory failed: ${r.stderr?.toString()}`);
  }
  return new Uint8Array(r.stdout);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [argA, argB] = process.argv.slice(2);
  if (!argA || !argB) {
    console.error('usage: pnpm tsx tools/parity/save-state-diff.ts <save-a> <save-b>');
    process.exit(1);
  }
  const a = loadMemory(resolve(argA));
  const b = loadMemory(resolve(argB));
  const runs = diffMemoryBlobs(a, b);
  console.log(`memory length: a=${a.length}, b=${b.length}`);
  console.log(`diff runs: ${runs.length}`);
  for (const run of runs.slice(0, 100)) {
    const oldHex = run.oldBytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const newHex = run.newBytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`  0x${run.start.toString(16)}..0x${(run.start + run.length - 1).toString(16)} (${run.length} bytes)`);
    console.log(`    old: ${oldHex}`);
    console.log(`    new: ${newHex}`);
  }
  if (runs.length > 100) console.log(`  ... and ${runs.length - 100} more runs`);
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm --filter @wiz6/parity test save-state-diff 2>&1 | tail -10
```
Expected: 4 tests pass.

- [ ] **Step 5: Run the CLI against two existing saves to verify**

```bash
pnpm tsx tools/parity/save-state-diff.ts tools/dosbox/save/1.sav tools/dosbox/save/2.sav 2>&1 | head -30
```
Expected: shows multiple diff runs between the two save states (party_size, NATHAN's location, etc.).

- [ ] **Step 6: Commit**

```bash
git add tools/parity/save-state-diff.ts tools/parity/save-state-diff.test.ts
git commit -m "tools(parity): add save-state-diff for DGROUP-level state comparison"
```

---

## Phase 4 — Test patterns

### Task 7: Tile-catalog snapshot tests

**Files:**
- Create: `packages/parser/tests/wfont-catalog.test.ts`

#### Steps

- [ ] **Step 1: Write the catalog test**

Create `packages/parser/tests/wfont-catalog.test.ts`:

```typescript
/**
 * wfont-catalog.test.ts — assert that critical chrome glyphs have the
 * expected pixel pattern.
 *
 * These tiles are load-bearing for screen ports (banner bars, scrollbars,
 * border lines, status row). If the font asset is ever regenerated or
 * corrupted, these tests catch it before a parity test fails 1000 px
 * later.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const FONTS_DIR = join(REPO_ROOT, 'extracted', 'fonts');

function decodeGlyph(bytes: ArrayLike<number>): number[][] {
  const out: number[][] = [];
  for (let row = 0; row < 8; row++) {
    const pG = bytes[row] ?? 0, pB = bytes[8 + row] ?? 0, pR = bytes[16 + row] ?? 0, pI = bytes[24 + row] ?? 0;
    const cells: number[] = [];
    for (let col = 0; col < 8; col++) {
      const bit = 7 - col;
      cells.push(((pG >> bit) & 1) | (((pB >> bit) & 1) << 1) | (((pR >> bit) & 1) << 2) | (((pI >> bit) & 1) << 3));
    }
    out.push(cells);
  }
  return out;
}

function loadFont(name: string) {
  return JSON.parse(readFileSync(join(FONTS_DIR, `${name}.json`), 'utf-8'));
}

// Expected patterns. Each is the 8×8 grid of palette indices.
const PATTERNS = {
  'wfont3 0x5f banner-bar (black top + gray middle + black bottom)': {
    font: 'wfont3', char: 0x5f,
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  'wfont3 0x1d banner-bar + right-edge (used at cell 19 row 18)': {
    font: 'wfont3', char: 0x1d,
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  'wfont3 0x1e status-row underline (gray + black bottom only)': {
    font: 'wfont3', char: 0x1e,
    grid: [
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  'wfont1 0x23 top-edge-only (used at cells 20-39 row 18)': {
    font: 'wfont1', char: 0x23,
    grid: [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
      [8, 8, 8, 8, 8, 8, 8, 8],
    ],
  },
  'wfont1 0x1c right-edge vertical line (used at cell 19 rows 19-23)': {
    font: 'wfont1', char: 0x1c,
    grid: [
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
    ],
  },
  'wfont1 0x1f bottom-right L-corner (used at cell (19, 24))': {
    font: 'wfont1', char: 0x1f,
    grid: [
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [8, 8, 8, 8, 8, 8, 8, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
};

describe('wfont chrome-tile catalog', () => {
  for (const [name, spec] of Object.entries(PATTERNS)) {
    it(`${name}`, () => {
      const font = loadFont(spec.font);
      const bytes = font.glyphs[spec.char];
      expect(bytes, `glyph 0x${spec.char.toString(16)} missing from ${spec.font}`).toBeDefined();
      expect(decodeGlyph(bytes)).toEqual(spec.grid);
    });
  }
});
```

- [ ] **Step 2: Run the test — verify it passes**

```bash
pnpm --filter @wiz6/parser test wfont-catalog 2>&1 | tail -10
```
Expected: 6 tests pass (one per chrome tile).

- [ ] **Step 3: Commit**

```bash
git add packages/parser/tests/wfont-catalog.test.ts
git commit -m "test(parser): tile-catalog snapshot tests for critical wfont chrome glyphs"
```

---

### Task 8: Per-region pixel tolerances in compareRgba

**Files:**
- Modify: `tools/parity/diff-image.ts`
- Modify: `tools/parity/diff-image.test.ts`

#### Steps

- [ ] **Step 1: Check if any current parity test would benefit from this**

```bash
grep -rn "tolerance" tools/parity/*.test.ts | head
```

If no current test uses a non-zero tolerance OR no current parity test has animation drift, this task is vacuously useful — design the API but skip the implementation. Decide based on what you find. If skipping, jump to step 5.

If implementing, continue:

- [ ] **Step 2: Add the failing test**

Edit `tools/parity/diff-image.test.ts` — add:

```typescript
import { describe, expect, it } from 'vitest';
import { compareRgba } from './diff-image.js';

describe('compareRgba — per-region tolerances', () => {
  it('applies a region-specific tolerance', () => {
    // Build two 320×200 buffers identical except for a 2-channel diff of 4 in
    // the top-left 8×8 area.
    const a = new Uint8ClampedArray(320 * 200 * 4);
    const b = new Uint8ClampedArray(320 * 200 * 4);
    for (let i = 0; i < 8 * 8; i++) {
      const off = i * 4;
      a[off] = 100; a[off + 1] = 100; a[off + 2] = 100; a[off + 3] = 255;
      b[off] = 104; b[off + 1] = 104; b[off + 2] = 100; b[off + 3] = 255;
    }
    // With defaultTolerance=0 and no region: those 64 pixels would all differ.
    const strict = compareRgba(a, b, { tolerance: 0 });
    expect(strict.diffCount).toBe(64);
    // With a region covering the top-left at tolerance 8: those pixels match.
    const lenient = compareRgba(a, b, {
      tolerance: 0,
      regions: [{ name: 'top-left', x: 0, y: 0, w: 8, h: 8, tolerance: 8 }],
    });
    expect(lenient.diffCount).toBe(0);
  });

  it('falls back to defaultTolerance outside any region', () => {
    const a = new Uint8ClampedArray(320 * 200 * 4);
    const b = new Uint8ClampedArray(320 * 200 * 4);
    // Diff at pixel (100, 100) — outside the top-left region.
    const off = (100 * 320 + 100) * 4;
    a[off] = 100; b[off] = 110;
    const result = compareRgba(a, b, {
      tolerance: 0,
      regions: [{ name: 'top-left', x: 0, y: 0, w: 8, h: 8, tolerance: 100 }],
    });
    expect(result.diffCount).toBe(1);
  });
});
```

Run:
```bash
cd tools/parity && npx vitest run diff-image 2>&1 | tail -10
```
Expected: FAIL — `regions` option not implemented.

- [ ] **Step 3: Extend `compareRgba` with regions option**

Edit `tools/parity/diff-image.ts`. Find the `DiffOptions` interface and the `compareRgba` function. Update:

```typescript
export interface RegionTolerance {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tolerance: number;
}

export interface DiffOptions {
  /** Default per-channel max diff for non-region pixels. Default 8. */
  tolerance?: number;
  /** Optional named regions with their own tolerances. */
  regions?: RegionTolerance[];
}
```

In `compareRgba`, replace the inner pixel-compare with:

```typescript
function toleranceForPixel(x: number, y: number, regions: RegionTolerance[] | undefined, fallback: number): number {
  if (!regions) return fallback;
  for (const r of regions) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.tolerance;
  }
  return fallback;
}

// Inside the compare loop, replace tolerance with:
const t = toleranceForPixel(px, py, opts?.regions, tolerance);
// then check channels against t.
```

(Adapt to the exact existing loop structure.)

- [ ] **Step 4: Run the tests — verify they pass**

```bash
cd tools/parity && npx vitest run diff-image 2>&1 | tail -10
```
Expected: existing tests still pass + 2 new tests pass.

- [ ] **Step 5: Update CLAUDE.md test-layer convention**

Add to the bullet list in CLAUDE.md (in the test-layer convention block added in Task 1):

```markdown
  - Pixel-parity tests can use per-region tolerances (`{regions: [{ name, x, y, w, h, tolerance }]}`) when a screen has animation drift in a known area. Default tolerance for non-region pixels should be 0; widening tolerances should be a deliberate, documented choice with a TODO if not engine-faithful.
```

- [ ] **Step 6: Commit**

```bash
git add tools/parity/diff-image.ts tools/parity/diff-image.test.ts CLAUDE.md
git commit -m "test(parity): per-region tolerances in compareRgba + CLAUDE.md convention"
```

---

## Phase 5 — Presenter abstraction

### Task 9: Presenter interface + CanvasPresenter + 4-component refactor

**Files:**
- Create: `packages/viewer/src/lib/presenter.ts`
- Create: `packages/viewer/tests/lib/presenter.test.ts`
- Modify: `packages/viewer/src/pages/game/CastleScreen.tsx`
- Modify: `packages/viewer/src/pages/game/GameTitle.tsx`
- Modify: `packages/viewer/src/pages/castle/AddPartyPage.tsx`
- Modify: `packages/viewer/src/pages/roster/creation/ega/CreationCanvas.tsx`

#### Steps

- [ ] **Step 1: Write the failing test**

Create `packages/viewer/tests/lib/presenter.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { CanvasPresenter } from '../../src/lib/presenter.js';

describe('CanvasPresenter', () => {
  it('calls putImageData with the given RGBA buffer', () => {
    const putImageData = vi.fn();
    const canvas = {
      getContext: vi.fn(() => ({ putImageData })),
    } as unknown as HTMLCanvasElement;

    const presenter = new CanvasPresenter(canvas);
    const buf = new Uint8ClampedArray(320 * 200 * 4);
    buf[0] = 0xff;
    presenter.present(buf, 320, 200);

    expect(putImageData).toHaveBeenCalledTimes(1);
    const arg = putImageData.mock.calls[0]?.[0] as ImageData;
    expect(arg).toBeInstanceOf(ImageData);
    expect(arg.width).toBe(320);
    expect(arg.height).toBe(200);
    expect(arg.data[0]).toBe(0xff);
  });

  it('is a no-op if the canvas has no 2D context (jsdom guard)', () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    const presenter = new CanvasPresenter(canvas);
    // Should not throw.
    presenter.present(new Uint8ClampedArray(4), 1, 1);
  });
});
```

Run:
```bash
pnpm --filter @wiz6/viewer test presenter 2>&1 | tail -10
```
Expected: FAIL — module not found.

- [ ] **Step 2: Implement Presenter**

Create `packages/viewer/src/lib/presenter.ts`:

```typescript
/**
 * Presenter — abstraction for the final canvas-render step.
 *
 * Composers produce 320×200 RGBA buffers. The Presenter takes those buffers
 * and renders them to the screen. Today there's one implementation
 * (CanvasPresenter, wrapping ctx.putImageData), but the interface exists
 * so that future shader/HD/WebGL backends drop in without changing every
 * page component.
 *
 * Design constraint: the Presenter only sees the final RGBA buffer; it
 * doesn't know about TileWindows or composers. This keeps composers
 * decoupled from the rendering backend.
 */
export interface Presenter {
  /** Render the given RGBA buffer to the presentation surface. */
  present(rgba: Uint8ClampedArray, width: number, height: number): void;
}

/** The default presenter — uses `ctx.putImageData` on a 2D canvas. */
export class CanvasPresenter implements Presenter {
  constructor(private readonly canvas: HTMLCanvasElement) {}

  present(rgba: Uint8ClampedArray, width: number, height: number): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return; // jsdom + headless safety
    // Allocate an ImageData ourselves rather than constructing it from the
    // Uint8ClampedArray directly — the latter trips a SharedArrayBuffer
    // type mismatch in the DOM lib types.
    const img = new ImageData(width, height);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
  }
}
```

- [ ] **Step 3: Run tests — verify they pass**

```bash
pnpm --filter @wiz6/viewer test presenter 2>&1 | tail -10
```
Expected: 2 tests pass.

- [ ] **Step 4: Refactor CastleScreen to use Presenter**

Edit `packages/viewer/src/pages/game/CastleScreen.tsx`. Find the canvas-paint effect (the RAF loop). Replace the direct `putImageData` block with a `CanvasPresenter`:

```typescript
// Add at top:
import { CanvasPresenter } from '../../lib/presenter.js';

// Inside the RAF effect, replace:
//   const img = new ImageData(ENGINE_W, ENGINE_H);
//   img.data.set(buf);
//   ctx.putImageData(img, 0, 0);
// with:
//   presenter.present(buf, ENGINE_W, ENGINE_H);

// Construct presenter once when canvas is available:
const presenter = new CanvasPresenter(canvas);
```

Concretely, the RAF tick function becomes:

```typescript
const tick = (now: number) => {
  if (now - lastFlip >= PARITY_FLIP_MS) {
    parity = parity === 0 ? 1 : 0;
    lastFlip = now;
  }
  const buf = composeCastleFrame(/* ...existing args... */);
  presenter.present(buf, ENGINE_W, ENGINE_H);
  raf = requestAnimationFrame(tick);
};
```

- [ ] **Step 5: Refactor AddPartyPage to use Presenter**

Edit `packages/viewer/src/pages/castle/AddPartyPage.tsx`. Find the paint effect. Same pattern as CastleScreen:

```typescript
// Add import:
import { CanvasPresenter } from '../../lib/presenter.js';

// Inside the paint effect, replace the ImageData/putImageData calls with:
const presenter = new CanvasPresenter(canvas);
// ...compose buf...
presenter.present(buf, ENGINE_W, ENGINE_H);
```

- [ ] **Step 6: Refactor CreationCanvas to use Presenter**

Edit `packages/viewer/src/pages/roster/creation/ega/CreationCanvas.tsx`. Replace the `putImageData` block with `CanvasPresenter`:

```typescript
import { CanvasPresenter } from '../../../../lib/presenter.js';

// In the useEffect:
const presenter = new CanvasPresenter(canvas);
const rgba = renderCreationFrame(windows, fontSet, palette);
presenter.present(rgba, ENGINE_W, ENGINE_H);
```

- [ ] **Step 7: Refactor GameTitle to use Presenter (if it has canvas rendering)**

Check first:
```bash
grep "putImageData" packages/viewer/src/pages/game/GameTitle.tsx
```

If found, apply the same pattern. If not, skip this step.

- [ ] **Step 8: Run full viewer tests — verify no regressions**

```bash
pnpm --filter @wiz6/viewer test 2>&1 | tail -8
```
Expected: all tests still pass (test count up by 2 from Presenter tests).

- [ ] **Step 9: Run all parity tests**

```bash
cd tools/parity && npx vitest run 2>&1 | tail -15
```
Expected: all parity tests still pass at their existing floors (castle-parity at 100, screen-parity at floors, add-party-parity at 100).

- [ ] **Step 10: Run typecheck**

```bash
pnpm -r typecheck 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add packages/viewer/src/lib/presenter.ts packages/viewer/tests/lib/presenter.test.ts \
        packages/viewer/src/pages/game/CastleScreen.tsx \
        packages/viewer/src/pages/castle/AddPartyPage.tsx \
        packages/viewer/src/pages/roster/creation/ega/CreationCanvas.tsx \
        packages/viewer/src/pages/game/GameTitle.tsx
git commit -m "feat(viewer): introduce Presenter abstraction (CanvasPresenter as default)"
```

---

## Final TODO updates

### Task 10: Update TODO.md

After completing all the phases above, add follow-up entries to `TODO.md` for the deferred items mentioned in the spec's "Out of scope" section. Bump `Next free ID` to `#036`.

- [ ] **Step 1: Edit TODO.md**

Add these entries to the `## Open` section (or close any old roadmap entries that became redundant):

```markdown
- #035 [open] — WebGL presenter for shader / HD rendering
  - Implement a second Presenter backend that takes RGBA and runs it through a WebGL pipeline. Enables CRT shaders, scanline effects, scale-up filters.
  - Blocked on: concrete need (no shader experiment in flight yet).
  - Touches only `packages/viewer/src/lib/presenter.ts`; composers are unaffected.

- #036 [open] — Asset format migration JSON → spritesheets
  - Move wfont, wport, and .pic from JSON to PNG spritesheets + small metadata JSON. JSON bloats binary by 10-30×; this would significantly reduce viewer load time.
  - Touches: extractor pipeline (packages/cli), loaders (packages/viewer/src/data-loader.ts), test fixtures.
  - Defer until we have measured load-time pain or want to ship to mobile.
```

Update `Next free ID:` to `#037`.

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "todo: track deferred follow-ups (WebGL presenter, asset format migration)"
```

---

## Self-review checklist (run before declaring complete)

After executing all tasks:

- [ ] `pnpm test` clean (all packages green, NO diagnostic tests in output)
- [ ] `pnpm test:diagnostics` runs and passes (2 cell-parity diagnostic tests)
- [ ] `pnpm -r typecheck` clean
- [ ] `pnpm tsx tools/wfont/inspect.ts --all` produces 5 font sheets
- [ ] `pnpm tsx tools/wfont/find-tile.ts --pattern '00000000;88888888;88888888;88888888;88888888;88888888;88888888;00000000'` finds wfont3 char 0x5f
- [ ] `python3 tools/parity/dump-cells.py tools/dosbox/save/1.sav --scan` finds at least 5 plausible windows
- [ ] `pnpm tsx tools/parity/save-state-diff.ts tools/dosbox/save/1.sav tools/dosbox/save/2.sav` produces a sensible diff
- [ ] `cd tools/parity && npx vitest run` — all parity tests still pass at 100%
- [ ] `docs/re/wbase-main-menu.md` has new "Picker internals" section (from Phase 2)
- [ ] `CLAUDE.md` has test-layer convention added
- [ ] All seven new chrome-tile catalog tests in `wfont-catalog.test.ts` pass

## Notes for the engineer

- **Worktree:** if running in a worktree per the `using-git-worktrees` skill, all paths above are relative to the worktree root.
- **Phase ordering matters:** Phase 1 unblocks the convention; Phase 2 is the highest-uncertainty phase and may take longer than 1-2h if Ghidra disasm is tricky; Phase 3 is mostly mechanical; Phase 4 is fast; Phase 5 is a careful refactor that touches 4 files.
- **`pngjs` is added as a dev dep in Task 3 step 5** — don't redo this in later tasks.
- **The Presenter refactor (Task 9) is deliberately small in scope.** Do NOT change canvas sizing, scale, or RAF behavior. Just substitute the `putImageData` call with the presenter. If you find tangentially-related cleanup, defer to a follow-up commit.
- **`extracted/font-sheets/`** is intentionally committed to git as a permanent artifact (per Task 3 step 9). Check `.gitignore` doesn't exclude it; if `extracted/` is broadly ignored, add a `!extracted/font-sheets/` exception.
