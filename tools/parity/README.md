# tools/parity/

Byte-level parity testing between the original DOS game and our TS engine output.

> **Backend (2026-06):** Engine framebuffer fixtures are rebuilt from the pinned
> `test-fixtures/` image via **`tools/libretro/build-state.ts`** (dosbox-pure /
> libretro harness) — see "Committed engine fixtures" below. `gen-fixture.ts` and
> `build-castle-saves.ts` are removed. The `extract.py` / `diff.py` /
> `decode-*.ts` tools documented next are standalone RE byte tools for
> decoder/RNG/struct ground-truth checks against a raw image — NOT the fixture
> pipeline.

## The decoder-validation pattern

The wiz6 reimplementation needs to match the original binary's behavior. For
*decoder/struct* validation (as opposed to whole-screen fixtures), differential
testing against a raw image makes that empirical:

1. Locate the buffer of interest in physical memory (or read a known file offset)
2. Dump it
3. Compute the same buffer with our TS engine
4. Byte-diff

When the diff is BYTE-PERFECT, you've validated the decoder. When it isn't, the offset of first divergence is a precise pointer to the bug.

## Tools

### `extract.py` — read regions of DOSBox-X save-state physical memory

```bash
# What's in the ZIP?
python3 tools/parity/extract.py info tools/dosbox/save/1.sav

# Find a byte pattern (e.g., ega.drv decoder prologue)
python3 tools/parity/extract.py find tools/dosbox/save/1.sav \
    --pattern '55 8B EC 83 EC 08 1E 06'

# Find a sprite-buffer header (descriptor[0]: pos=0x258, W=9, H=13)
python3 tools/parity/extract.py find tools/dosbox/save/1.sav \
    --pattern '58 02 09 0d'

# Dump a region
python3 tools/parity/extract.py dump tools/dosbox/save/1.sav \
    --offset 0x5b928 --length 4096 --output /tmp/engine-mon11.bin
```

### `diff.py` — byte-level diff with hex context

```bash
python3 tools/parity/diff.py /tmp/engine-mon11.bin /tmp/ours-mon11.bin
# → BYTE-PERFECT MATCH: 4096 bytes identical
# OR
# → DIVERGENCE at offset 0xfff (4095) ...
```

Exit code 0 on match, 1 on divergence — usable in CI guards.

### `decode-pic.ts` — engine-side helper for .pic

```bash
pnpm tsx tools/parity/decode-pic.ts original/mon11.pic /tmp/ours-mon11.bin
```

Writes the raw decoded buffer (the engine's view), not the JSON envelope the regular extractor produces. Equivalent helpers can be added per-format as we tackle other subsystems.

## Worked example: validate the .pic decoder against mon11

```bash
# 1. Locate the cyclops sprite buffer in the save state (W=9, H=13 → bytes 09 0d at +2/+3)
python3 tools/parity/extract.py find tools/dosbox/save/1.sav --pattern '58 02 09 0d'
# → phys=0x0005b928  seg:off=0x5b92:8

# 2. Dump engine buffer
python3 tools/parity/extract.py dump tools/dosbox/save/1.sav \
    --offset 0x5b928 --length 24376 --output /tmp/engine-mon11.bin

# 3. Compute ours
pnpm tsx tools/parity/decode-pic.ts original/mon11.pic /tmp/ours-mon11.bin

# 4. Diff
python3 tools/parity/diff.py /tmp/engine-mon11.bin /tmp/ours-mon11.bin
# Expect: BYTE-PERFECT MATCH
```

If the diff fails at offset N, that's the first byte where the TS decoder diverges from the engine — the bug is at or before N.

## Save-state mechanics

DOSBox-X save states are ZIPs. The `Memory` entry is the full emulated physical RAM at save time (16 MiB for our config). Physical offsets in the dump map 1:1 to physical addresses the BIOS/DOS would have seen.

Conversion: `seg:off` → physical = `seg * 16 + off`. The `find` subcommand reports both.

## Character-creation parity

### `decode-character.ts` — parity harness for 432-byte character records

```bash
# Extract a raw 432-byte record from pcfile.dbs (slot 0 = THESUS)
pnpm tsx tools/parity/decode-character.ts extract \
    --pcfile original/pcfile.dbs --slot 0 --output /tmp/raw.bin

# Re-encode via encodeCharacterRecord (proves the round-trip)
pnpm tsx tools/parity/decode-character.ts extract \
    --pcfile original/pcfile.dbs --slot 0 --output /tmp/reencoded.bin --re-encoded

# Diff them — should be BYTE-PERFECT MATCH (exit 0)
pnpm tsx tools/parity/decode-character.ts compare /tmp/raw.bin /tmp/reencoded.bin

# Compare two different slots — DIVERGENCE + exit 1
pnpm tsx tools/parity/decode-character.ts compare /tmp/raw.bin /tmp/other-slot.bin
```

### What can be validated NOW (static/stock)

The harness can already validate the **encoder round-trip** for all 6 stock characters:

- `decodePcfile(pcfile.dbs)` → decode all 16 slots
- `encodeCharacterRecord(slot)` → re-encode each populated slot
- `compare raw reencoded` → confirm byte-perfect match for all 6 (A7 guarantee)

This proves the `compare` path and the `extract --pcfile` path both work.

### What is BLOCKED on a manual save capture

Full **RNG-sequence parity** — confirming that our engine produces the exact same
character for a given `(seed1, seed2, seed3)` + player inputs as the DOS original —
requires a DOSBox-X save state captured at the precise moment the engine commits a
new character (`wpcmk_create_character_master` return / pcfile slot written).

**No such save exists yet.** Creating one is a manual DOSBox-X step:

1. Boot Wiz6 under DOSBox-X.
2. Navigate to character creation (MASTER OPTIONS → Create Character).
3. Complete the wizard up to the confirmation step ("ACCEPT THIS CHARACTER?"),
   then save state **before** pressing ACCEPT so the creation buffer at `*0x5470`
   (DGROUP-relative, 432-byte window) is still populated.
4. Note the game state / save slot number used; write it to `docs/re/dynamic-traces/`.
5. The save can then be used to:
   a. Read `CS:[0x1d3b]`, `CS:[0x1d3d]`, `CS:[0x1d3f]` — the three Wichmann-Hill
      stream states at the moment of creation (needed to replay the exact RNG sequence).
   b. Dump `*0x5470 + 432 bytes` — the engine's finished character record — via
      `extract.py dump --offset <dgroup_base + 0x5470> --length 0x1b0`.
   c. Compare that dump against our engine's output for the same seed + inputs.

### Fixed-seed strategy for deterministic tests

Until a creation-commit save exists, use these known constant seeds for
unit/integration tests:

```
stream1 = 3000    (wroot image bytes at CS:0x1d3b → LE word 0x0bb8)
stream2 = 1       (arbitrary deterministic override for testing; normally BIOS-tick non-deterministic)
stream3 = 29999   (wroot image bytes at CS:0x1d3f → LE word 0x752f)
```

Inject via `new WichmannHill(3000, 1, 29999)` in test setup. Each character-creation
sub-function consumes a known number of RNG calls in order:

| Sub-function      | RNG calls                       |
| ----------------- | ------------------------------- |
| `rollAttributes`  | 8 (one per stat, independently) |
| `rollBonusPoints` | 1                               |
| `rollSkillBudget` | 1–3 (class-dependent)           |
| `rollKarma`       | 1                               |

Replaying the exact sequence for a given class + race deterministically reproduces
the same character every time — once the RNG call count per sub-function is confirmed
against the engine. Currently confirmed for Fighter (A2/A3 test coverage).

### Open questions a creation-commit save would settle

1. **Skill-budget tier-2 details** — is there a `rng(3)` call? a second subtraction?
   a Fighter "clamp" (e.g. budget capped at some fighter-specific max)?
   See `docs/re/wpcmk-screens.md` "Open Questions".

2. **Remaining field offsets** — any pcfile fields with `unknown_*` annotations in
   `encode-character-record.ts` that are populated at creation time (not just stock values).

## Committed engine fixtures — `fixtures/engine/`

The canonical approach for screen-level parity tests. The fixture decode is
deterministic, so we rebuild each reference screen from the **pinned
`test-fixtures/` image** via `tools/libretro/build-state.ts` (dosbox-pure harness),
write tiny committed derivatives, and all subsequent tests diff our render against
those committed fixtures — no per-developer save state needed.

### Fixture format

| File | Content | Typical size |
|------|---------|-------------|
| `<name>.idx.gz` | Gzipped Uint8Array(64000): one 4-bit EGA index per pixel | ~0.7–1 KB |
| `<name>.png`    | PNG render via wiz6-main AC→DAC palette, for human viewing | ~2–3 KB |
| `<name>.character.json` | (non-deterministic creation rolls only) the engine draft decoded from DGROUP `0x5470`, loaded by parity render fns via `draftFromEngineDump` | small |

The `.idx.gz` is palette-independent — the test applies the wiz6-main AC→DAC pipeline
at load time via `indicesToRgba()` from `decode-screen.ts`. This means if the palette
mapping is refined, the index fixture stays valid; only the test RGBA changes.

### Rebuilding a fixture via `build-state.ts`

Recipes are named in `tools/dosbox/state-catalog.ts`. Four modes:

```bash
# recipe-replay (deterministic screens): drive a named recipe to its waypoint
pnpm tsx tools/libretro/build-state.ts <recipe>

# --mint (non-deterministic creation ROLLS): freeze a serialize-state to
#   test-fixtures/states/<name>.state.gz + write the <name>.character.json sidecar
#   (the draft from LiveSession.dumpDraft). --mint accepts whatever roll comes up.
pnpm tsx tools/libretro/build-state.ts <recipe> --mint

# --check: re-mint + diff vs the committed fixture (NO overwrite); 100% match
#   is the gate (exit 0 on match, 1 on divergence).
pnpm tsx tools/libretro/build-state.ts <recipe> --check
```

- **`pcfileFixture`** recipes boot a fresh image overlaid with a committed
  `test-fixtures/states/<name>.pcfile.dbs` roster, then drive forward — used for
  roster-management screens whose state can't be reached by replay alone.
- **`bootCapture`** recipes capture cold-boot intro frames (deterministic boot
  frames, no committed state).

`build-state.ts` writes the `.idx.gz` + `.png` (+ `.character.json` for `--mint`)
to `tools/parity/fixtures/engine/`. Commit the results:

```bash
git add tools/parity/fixtures/engine/ test-fixtures/states/
```

### Loading a fixture in tests

```ts
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { indicesToRgba } from './decode-screen.js';

function loadFixtureRgba(name: string): Uint8Array {
  const compressed = readFileSync(`tools/parity/fixtures/engine/${name}.idx.gz`);
  const raw = gunzipSync(compressed);
  const indices = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  return indicesToRgba(indices); // apply wiz6-main AC→DAC palette
}

const engineRgba = loadFixtureRgba('character-menu-partial');
// → Uint8Array(256000) — RGBA, 320×200 pixels
```

Or use the helper in `fixtures.ts`:

```ts
import { loadFixture } from './fixtures.js';
const { indices, rgba } = loadFixture('character-menu-partial');
```

### Screen-parity test (no .sav, runs in CI)

The canonical parity test for the CHARACTER MENU (partial state) lives in `@wiz6/viewer`:

```bash
pnpm --filter @wiz6/viewer test tests/pages/roster/creation/ega/screen-parity.test.ts
```

Actual match as of implementation: **46.78%** (tolerance=8). Main sources of divergence:
our renderer fills the entire background with dark-gray before compositing windows; the
engine only fills the non-window-covered background region. Window interiors are black.

Regression floor: 40% (actual − 7% safety margin).

---

## Decode engine screen from a save state

`decode-screen.ts` reads the DOSBox-X save state's `Vga` blob, decodes the 320×200
mode-0x0D planar screen to RGBA via the wiz6-main AC→DAC palette, and writes a PNG —
entirely offline, no DOSBox process required.

It also exports `decodeSaveToScreen(savePath)`, `decodeVgaIndices(blob)`, and
`indicesToRgba(indices)` for programmatic use in `fixtures.ts`. (Reading a DOSBox-X
`.sav` directly is now a standalone-RE convenience; committed fixtures come from
`build-state.ts` against the pinned image, not from a `.sav`.)

```bash
# Decode save 1 → /tmp/engine-screen-1.png (default output path)
pnpm tsx tools/parity/decode-screen.ts --save 1

# Explicit save path + custom output
pnpm tsx tools/parity/decode-screen.ts \
    --save tools/dosbox/save/1.sav \
    --out /tmp/wpcmk-screen.png
```

Output shows color statistics and a structural check:

```
decoded 320×200 from .../tools/dosbox/save/1.sav
  → /tmp/engine-screen-1.png
  black:     43.7%
  dark-gray: 50.4%
  light-gray: 4.1%
  white:      1.7%
  structural check: PASS
```

### VGA blob layout (DOSBox-X 2026.05.02)

Confirmed empirically — see `docs/re/findings/dosbox-vga-save-layout.json`:

| Parameter | Value |
|---|---|
| VRAM start in blob | `0x84000` (not 0x80000) |
| Plane layout | Interleaved: `blob[0x84000 + vga_addr*4 + plane]` |
| Row stride | 40 bytes/row/plane (CRTC reg 0x13 = 0x14) |
| Display start | VGA address 0 (CRTC regs 0x0C/0x0D = 0) |
| Palette | wiz6-main AC→DAC (not EGA_DEFAULT) — see WIZ6_MAIN_AC in decode-screen.ts |

### Using decoded screens for one-off inspection

```bash
pnpm tsx tools/parity/decode-screen.ts --save N
```

For regression testing, use `build-state.ts <recipe>` to rebuild a committed fixture
from the pinned image instead — then the test runs against the committed derivative.

## Pixel-diff harness

### `diff-image.ts` — compareRgba + writeDiffPng

```ts
import { compareRgba, writeDiffPng } from './diff-image.js';

const result = compareRgba(ourRgba, engineRgba, { tolerance: 8 });
// { width, height, total, diffCount, matchPct, firstDiffs }

writeDiffPng(ourRgba, engineRgba, '/tmp/diff.png', { tolerance: 8 });
// Red pixels = mismatch; copied pixels = match
```

**Tolerance (default 8):** A pixel matches when every RGBA channel differs by ≤ tolerance.
This accommodates the AC→DAC rounding that can shift palette entries by a few LSBs between
our EGA_DEFAULT constants and the live DAC values in a save.

**firstDiffs:** Up to 10 mismatching `{x, y, a, b}` entries — the first diverging pixels
in scan order (top-left to bottom-right). Use these to quickly identify what region is wrong.

**Unit tests:** `cd tools/parity && npx vitest run diff-image.test.ts`

### `screen-parity.ts` — headless CHARACTER MENU harness (CLI)

Loads the committed `character-menu-partial` fixture and compares against our headless
render of the CHARACTER MENU in PARTIAL roster state. Prints the match % and writes
PNG artifacts. No `.sav` file is read.

```bash
pnpm tsx tools/parity/screen-parity.ts
# → Match: 46.78%  (29942/64000 pixels match)
# → /tmp/our-character-menu-partial.png     (our render)
# → /tmp/engine-character-menu-partial.png  (from fixture, NOT a .sav)
# → /tmp/diff-character-menu-partial.png    (red = mismatch)
```

**Current match: ~46.78%** (tolerance=8). Main sources of divergence:

| Source | Approx. contribution |
|---|---|
| Background fill: our renderer fills entire 320×200 with dark-gray; engine uses black in window interiors | ~25% |
| Window chrome tiles drawn where engine is blank/black | ~15% |
| Menu text / highlight rows differ slightly | ~8% |
| DOSBox-X internal-state noise (~161 pixels in rows 15–16) | < 0.3% |

Layout refinement will raise this number. The regression floor is set conservatively
in the test (40%) so the test does not break on minor improvements.

**Canonical regression test (no .sav, runs in CI):**

```bash
pnpm --filter @wiz6/viewer test tests/pages/roster/creation/ega/screen-parity.test.ts
```

The test asserts `matchPct ≥ 40%` (actual ~46.78%, 7% safety margin).

### Adding a new (screen, fixture) parity case

The fixture-based workflow — add a recipe, rebuild from the pinned image, commit
the derivative, then test against it in CI:

1. **Add a recipe** to `tools/dosbox/state-catalog.ts` that drives to the exact
   screen you want to validate (recipe-replay, `pcfileFixture`, or `bootCapture`).

2. **Rebuild the committed fixture** via the dosbox-pure harness:
   ```bash
   pnpm tsx tools/libretro/build-state.ts <recipe>          # deterministic
   pnpm tsx tools/libretro/build-state.ts <recipe> --mint    # non-deterministic roll (+ .character.json)
   # Writes: tools/parity/fixtures/engine/<fixture-name>.{idx.gz,png[,character.json]}
   ```

3. **Commit the fixture** (and the frozen state, for `--mint`):
   ```bash
   git add tools/parity/fixtures/engine/<fixture-name>.* \
           test-fixtures/states/<fixture-name>.state.gz
   git commit -m "test(parity): add <fixture-name> engine fixture"
   ```

4. **Write the parity test:**
   - **Headless path** (for non-routable screens or sub-states): add a test in
     `packages/viewer/tests/pages/roster/creation/ega/screen-parity.test.ts` or a
     sibling file. Load the fixture with `loadFixtureRgba(name)` + `indicesToRgba()`,
     render headlessly via `renderCreationFrame`, compare with `compareRgba`.
   - **Playwright path** (for URL-addressable screens): add to `PARITY_CASES` in
     `packages/viewer/e2e/parity.spec.ts` with `fixtureName` pointing to the committed fixture.
     The spec loads the fixture and compares against the Playwright canvas capture.

5. **Set threshold conservatively** (actual match − 7–10%) and document actual match % in comments.

6. **Check the diff PNG** — mismatching pixels shown in red. Common patterns:
   - Solid red region = missing window or completely wrong fill color
   - Red border = geometry offset by 1–2 cells
   - Red pixels in text = wrong font or wrong attribute byte
   - Sparse red pixels in rows 15–16 = DOSBox-X internal-state contamination (expected, invariant)

7. **Tighten the threshold** once layout refinement is complete.

### Playwright parity spec

`packages/viewer/e2e/parity.spec.ts` — route-based parity scaffold using committed fixtures.
The CHARACTER MENU case is `skip: true` until the route can be initialized with a matching
roster state. Extend PARITY_CASES with `fixtureName` (not `savePath`) following step 4 above.

```bash
cd packages/viewer && pnpm test:e2e e2e/parity.spec.ts
```

## Sprite-level checks

`sprite.ts` — helpers to render a single sprite/tile by index, dump it to PNG,
and assert it matches an expected reference (a fixture or an engine-decoded cell).

### CLI: dump a single tile to PNG

```bash
# 4bpp font glyph (wfont1, wfont2, wfont3, wfont4)
pnpm tsx tools/parity/sprite.ts --font wfont1 --char 0x00 --out /tmp/fill.png
pnpm tsx tools/parity/sprite.ts --font wfont4 --char 0x20 --out /tmp/ring.png

# 1bpp font glyph (wfont0)
pnpm tsx tools/parity/sprite.ts --font wfont0 --char 0x41 --out /tmp/A.png

# Pic sprite by descriptor index (0-based)
pnpm tsx tools/parity/sprite.ts --pic original/mon11.pic --index 0 --out /tmp/sprite.png
```

The CLI reports whether the tile is all-black, which is useful for quickly
confirming fill vs. content tiles:

```
font:    wfont1
char:    0x00 (0)
output:  /tmp/fill.png
all-black: true        ← interior fill tile ✓

font:    wfont4
char:    0x20 (32)
output:  /tmp/ring.png
all-black: false       ← ring sprite tile (original bug anchor) ✓
```

### API: assert helper

```ts
import { renderFontGlyph, extractCell, assertSpriteMatches, spriteToPng } from './sprite.js';
import { Font4bppSchema, WIZ6_MAIN } from '@wiz6/data';

// Render a single glyph
const font = Font4bppSchema.parse(JSON.parse(readFileSync('extracted/fonts/wfont1.json', 'utf-8')));
const { rgba } = renderFontGlyph(font, 0x01, WIZ6_MAIN);

// Dump for visual inspection
spriteToPng(rgba, 8, 8, '/tmp/frame-corner.png');

// Compare two sprite buffers (works for any w×h, not just 320-wide frames)
const result = assertSpriteMatches(ourRgba, referenceRgba, { tolerance: 0 });
// { match: boolean, matchPct: number, diffCount: number, total: number }
```

### Engine-cell cross-check pattern

The loop-closing workflow: decode the engine screen, crop a cell, compare to
our rendered glyph.

```ts
import { extractCell, renderFontGlyph, assertSpriteMatches } from './sprite.js';
import { readVgaBlob } from '../../packages/mcp/src/vga-palette.js';

// 1. Decode engine screen from save state
const blob = readVgaBlob('tools/dosbox/save/1.sav');
const engineRgba = decodeVgaScreen(blob); // 320×200 Uint8Array

// 2. Crop the 8×8 cell at pixel (16,16) — inside the top window interior
const cellRgba = extractCell(engineRgba, 320, 16, 16, 8, 8);

// 3. Render our glyph (wfont1/0x00 = solid-black fill)
const wfont1 = Font4bppSchema.parse(...);
const { rgba: ourRgba } = renderFontGlyph(wfont1, 0x00, WIZ6_MAIN);

// 4. Assert they match
const { matchPct } = assertSpriteMatches(ourRgba, cellRgba, { tolerance: 0 }, 99);
// → 100.0% — engine drew exactly wfont1/0x00 there
```

The `extractCell` function accepts any cell size (`w`, `h` default to 8), so
you can crop multi-cell sprites or entire window regions if needed.

### Regression anchor: wfont4/0x20

The failing test that motivated this module was: the viewport interior was filled
with wfont4/0x20 instead of wfont1/0x00. Since wfont4/0x20 is the "ring sprite"
tile (21 non-zero bytes), it produced visible ring artifacts in the window interior.

`sprite.test.ts` test 3 permanently documents this: `renderFontGlyph(wfont4, 0x20)`
must NOT be all-black. If a refactor accidentally makes it all-black, that test fails
and surfaces the bug immediately.

**Run the sprite tests:**

```bash
cd tools/parity && npx vitest run sprite.test.ts
```

All 4 tests pass in < 30ms:
1. `wfont1/0x00` → all-black (fill tile)
2. `wfont1/0x01` → light-gray + black (frame corner)
3. `wfont4/0x20` → NOT all-black (ring sprite regression anchor)
4. Engine cross-check: `extractCell(16,16)` in save 1 → all-black; `assertSpriteMatches` → 100%

## Where this pattern shines next

- **Combat math**: save at "right before damage roll" → dump the combatant struct → run our combat sim from the same starting state → diff.
- **Save-file format**: dump the saved-game-in-memory snapshot, compare to the on-disk format.
- **RNG sequences**: dump RNG state at known checkpoints, validate our RNG reimplementation produces identical sequences.
- **Maze data**: dump the loaded maze grid, compare to our parsed view.

## Building castle-N-members fixtures

These engine-ground-truth fixtures (MASTER OPTIONS with N=1..6 party members) are
deterministic castle recipes in `tools/dosbox/state-catalog.ts`, rebuilt via the
dosbox-pure harness — no live DOSBox-X, no macOS Accessibility, no key-driving:

```bash
pnpm tsx tools/libretro/build-state.ts castle-1-members
# ... etc through castle-6-members
git add tools/parity/fixtures/engine/castle-*.{idx.gz,png}
```

Use `--check <recipe>` to re-mint + diff against the committed fixture (100% gate).
