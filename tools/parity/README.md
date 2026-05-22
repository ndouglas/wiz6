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

## Where this pattern shines next

- **Combat math**: save at "right before damage roll" → dump the combatant struct → run our combat sim from the same starting state → diff.
- **Save-file format**: dump the saved-game-in-memory snapshot, compare to the on-disk format.
- **RNG sequences**: dump RNG state at known checkpoints, validate our RNG reimplementation produces identical sequences.
- **Maze data**: dump the loaded maze grid, compare to our parsed view.
