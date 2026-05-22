# Wiz6 monster sprite filename lookup (verified 2026-05-22)

**Rule:** for any monster record `M`, the combat sprite filename is

```
mon{pad2(M.statBytes[145])}.pic
```

with `M.statBytes[145] == 0` meaning "no sprite" (mon00.pic is a 1166-byte placeholder).

The byte at offset 145 of each 158-byte monster record in `scenario.dbs` IS the sprite filename index. There is no further indirection table.

## Verification

Three dynamic-debugging encounters in DOSBox-X (INT 21h ah=0x3D logging via `tools/dosbox/wiz6.conf`):

| Encounter | File opened | Monster row | `statBytes[145]` |
| --------- | ----------- | ----------- | ---------------- |
| 4 rogues  | `MON22.PIC` | m8 ROGUE    | 22 ✓             |
| 3 rogues  | `MON22.PIC` | m8 ROGUE    | 22 ✓             |
| 1 rat     | `MON21.PIC` | m0 RAT      | 21 ✓             |
| 2 rats    | `MON21.PIC` | m0 RAT      | 21 ✓             |
| 1 bat     | `MON18.PIC` | m2 BAT      | 18 ✓             |

Byte 145 is the unique offset where (rat=21, bat=18, rogue=22) all hold simultaneously across all 158 bytes.

## Statistics across all 250 monsters

- Every monster's `statBytes[145]` is in 0..58 (the valid file index range).
- 65 monsters have value 0 (placeholder/"no sprite"). Likely encounter slots or unused rows.
- 185 monsters reference real sprites, distributed across files 9..58 with gaps at 32, 55, 56, 57.
- **NO monster references files 1..8.** Those 8 files (mon01.pic..mon08.pic, all <9KB) are UI/graphics sprites preloaded at game start, unrelated to monsters. The earlier observation in the dynamic trace of MON01-08 loading before any encounter is consistent with this — they are loaded by `winit.ovr` initialization, not by encounter logic.

```
file 9-58 used by 185 monsters; mon01-08 are UI sprites; mon00 = placeholder
gaps (unused by any monster): 32, 55, 56, 57
```

## Parser correction needed

The current scenario parser at `packages/parser/src/formats/scenario-db.ts:321` labels bytes 144-147 as `attributeSaves: [b144, b145, b146, b147]` (a 4-element save-throw vector). This is wrong for at least byte 145. The Phase 2 implementation plan should:

- Add a proper field `picId: statBytes[145]` (or `combatPicId`) to the monster schema.
- Reassess what bytes 144, 146, 147 actually are. They're probably NOT save throws either, given the family co-variance commentary in the existing source comment is more easily explained by sprite-family clustering than by save-throw clustering.

## Method

1. Set up DOSBox-X with INT 21h logging via `tools/dosbox/wiz6.conf` (DOSBox-X log section: `int21=true fileio=true files=true`, written to `tools/dosbox/dosbox.log`).
2. User drove Wiz6 into combat encounters, identified the monster types by name.
3. Captured tick-ordered MON*.PIC opens.
4. Cross-referenced the 3 observed (monster name → filename) pairs against the full 158-byte statBytes for each monster. Byte 145 was the only offset where all three matched simultaneously.

Raw traces preserved in `docs/re/dynamic-traces/2026-05-22-encounter-01-4rogues.md`.

## Phase 1C v1 retrospective

The earlier static-only investigation correctly identified that `MON00.PIC` is a runtime-patched template in 5 overlay files, but couldn't find the digit-patching code via ndisasm because the patching lives in code paths called from overlays. The dynamic-debugging approach via DOSBox-X file I/O logging bypassed that limitation: we just observed which filename actually opens for which monster, without needing to find the patching code at all.

The "Hypothesis A" heuristic the v1 agent proposed (secondarySpriteId fallback) was incorrect — `secondarySpriteId` has no direct relationship with the actual sprite file index. The real mapping is the trivial one at byte 145.
