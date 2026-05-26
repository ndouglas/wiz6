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

| Sub-function | RNG calls |
|---|---|
| `rollAttributes` | 8 (one per stat, independently) |
| `rollBonusPoints` | 1 |
| `rollSkillBudget` | 1–3 (class-dependent) |
| `rollKarma` | 1 |

Replaying the exact sequence for a given class + race deterministically reproduces
the same character every time — once the RNG call count per sub-function is confirmed
against the engine. Currently confirmed for Fighter (A2/A3 test coverage).

### Open questions a creation-commit save would settle

1. **Skill-budget tier-2 details** — is there a `rng(3)` call? a second subtraction?
   a Fighter "clamp" (e.g. budget capped at some fighter-specific max)?  
   See `docs/re/wpcmk-screens.md` "Open Questions".

2. **Remaining field offsets** — any pcfile fields with `unknown_*` annotations in
   `encode-character-record.ts` that are populated at creation time (not just stock values).

## Where this pattern shines next

- **Combat math**: save at "right before damage roll" → dump the combatant struct → run our combat sim from the same starting state → diff.
- **Save-file format**: dump the saved-game-in-memory snapshot, compare to the on-disk format.
- **RNG sequences**: dump RNG state at known checkpoints, validate our RNG reimplementation produces identical sequences.
- **Maze data**: dump the loaded maze grid, compare to our parsed view.
