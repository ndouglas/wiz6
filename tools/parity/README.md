# tools/parity/

Byte-level parity testing between the live DOS game (DOSBox-X save state) and our TS engine output. Built on the workflow that cracked the multi-segment `.pic` decoder bug.

## The pattern

The wiz6 reimplementation needs to match the original binary's behavior. Differential testing makes that empirical:

1. Run the game in DOSBox-X to a known checkpoint
2. Capture → Save State → `tools/dosbox/save/<n>.sav`
3. Locate the buffer of interest in physical memory
4. Dump it
5. Compute the same buffer with our TS engine
6. Byte-diff

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

## Decode engine screen from a save state

`decode-screen.ts` reads the DOSBox-X save state's `Vga` blob, decodes the 320×200
mode-0x0D planar screen to RGBA via the EGA_DEFAULT palette, and writes a PNG — entirely
offline, no DOSBox process required.

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
  black:     80.6%
  dark-gray:  9.1%
  light-gray: 0.1%
  white:      0.2%
  full-width dark bar: row 120 ✓
  structural check: PASS
```

### VGA blob layout (DOSBox-X 2026.05.02)

Confirmed empirically — see `docs/re/findings/dosbox-vga-save-layout.json`:

| Parameter | Value |
|---|---|
| VRAM start in blob | `0x80000` |
| Plane layout | Interleaved: `blob[0x80000 + vga_addr*4 + plane]` |
| Row stride | 40 bytes/row/plane (CRTC reg 0x13 = 0x14) |
| Display start | VGA address 0 (CRTC regs 0x0C/0x0D = 0) |
| Palette | `EGA_DEFAULT` (direct pixel→RGB, no AC stage) |

The DAC and CRTC registers are embedded at blob offsets 0x82F80–0x83800
(which overlaps VRAM rows 75–89 in the address model). This adds minor noise
to those rows but does not affect the bulk of the screen.

### Using decoded screens for parity testing

For parity testing between the engine framebuffer and our TS renderer, the typical workflow is:

1. Decode the engine screen: `pnpm tsx tools/parity/decode-screen.ts --save N`
2. Render our TS implementation to a canvas / PNG
3. Compare pixel-by-pixel using `compareRgba` (see below)

The `decode-screen.ts` tool can also be used to visually confirm which game state
a save is at — helpful for identifying which screen layout to replicate.

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

### `screen-parity.ts` — headless confirm-screen harness (CLI)

Reconstructs the NUG confirm screen (screen-15: "SAVE THIS CHARACTER?") headlessly
via `renderCreationFrame` + `loadCreationFontSet`, and compares against the engine's
decoded save 1. Prints the match % and writes PNG artifacts.

```bash
pnpm tsx tools/parity/screen-parity.ts
# → Match: 67.22%  (43019/64000 pixels match)
# → /tmp/our-confirm-nug.png    (our render)
# → /tmp/engine-screen-1.png    (engine reference)
# → /tmp/diff-confirm-nug.png   (red = mismatch)
```

**Current match: ~67.2%** (tolerance=8). Main sources of divergence:

| Source | Approx. contribution |
|---|---|
| Background fill: we use dark-gray (85,85,85), engine uses black in window interiors | ~11% |
| Top window chrome tiles drawn where engine is blank/black | ~8% |
| Bottom bar position/content difference (engine partially black) | ~7% |
| Window border row differences (minor layout shift) | ~5% |

Layout refinement will raise this number. The regression floor is set conservatively
in the test (60%) so the test does not break on minor improvements.

**Regression test:** `cd tools/parity && npx vitest run screen-parity.test.ts`

The test asserts `matchPct ≥ 60%` (actual ~67.2%, 7% safety margin). It also writes
diff artifacts to `/tmp/` for visual inspection.

### Adding a (screen, save) parity case

To validate a new screen against a DOSBox-X save:

1. **Capture the save state** at the exact screen you want to validate:
   ```bash
   # Boot Wiz6 in DOSBox-X, navigate to the screen, press Alt-F5 to save state
   # → saves to tools/dosbox/save/<n>.sav (DOSBox-X default numbering)
   ```

2. **Determine whether the screen is directly URL-addressable** in the viewer:
   - If YES (e.g. `/castle/character-menu`): use the Playwright route-based parity spec
   - If NO (e.g. confirm screen — sub-state of creation wizard): use the headless harness

3. **Headless harness path** (preferred for non-routable screens):
   - Create `tools/parity/<screen-name>-parity.ts` (runnable CLI + PNG artifacts)
   - Create `tools/parity/<screen-name>-parity.test.ts` (vitest regression floor)
   - Model it on `screen-parity.ts` / `screen-parity.test.ts`
   - Run: `cd tools/parity && npx vitest run <screen-name>-parity.test.ts`

4. **Playwright route-based path** (for directly-addressable screens):
   - Add a new entry to `PARITY_CASES` in `packages/viewer/e2e/parity.spec.ts`
   - Set `threshold` conservatively (actual match % − 10%)
   - Run: `cd packages/viewer && pnpm test:e2e e2e/parity.spec.ts`
   - Diff PNG is attached to the Playwright HTML report (`/tmp/playwright-parity/`)

5. **Check the diff PNG** — mismatching pixels are shown in red. Common patterns:
   - Solid red region = missing window or completely wrong fill color
   - Red border on a window = geometry offset by 1–2 cells
   - Red pixels scattered through text = wrong font or wrong attribute byte
   - Red in known-black region = DOSBox contamination (rows 27–36, 75–90) — these are expected

6. **Tighten the threshold** once layout refinement is complete.

### Playwright parity spec

`packages/viewer/e2e/parity.spec.ts` — route-based parity scaffold. Currently seeded
with a `test.skip` for the character menu (no matching save yet). Extend PARITY_CASES
following step 4 above once you have a (route, save) pair.

```bash
cd packages/viewer && pnpm test:e2e e2e/parity.spec.ts
```

## Where this pattern shines next

- **Combat math**: save at "right before damage roll" → dump the combatant struct → run our combat sim from the same starting state → diff.
- **Save-file format**: dump the saved-game-in-memory snapshot, compare to the on-disk format.
- **RNG sequences**: dump RNG state at known checkpoints, validate our RNG reimplementation produces identical sequences.
- **Maze data**: dump the loaded maze grid, compare to our parsed view.
