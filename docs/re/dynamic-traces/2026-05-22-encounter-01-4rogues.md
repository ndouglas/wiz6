# Trace 01 — 4 rogues encounter (2026-05-22)

Tick-ordered MON*.PIC opens captured during a Wiz6 session:

```
tick 345118926  ->  C:MON03.PIC
tick 345192403  ->  C:MON01.PIC
tick 345267493  ->  C:MON02.PIC
tick 345390017  ->  C:MON07.PIC
tick 345439092  ->  C:MON04.PIC
tick 345492194  ->  C:MON05.PIC
tick 345539771  ->  C:MON06.PIC
tick 346318838  ->  C:MON08.PIC
tick 1158102356 ->  C:MON22.PIC
```

User-driven action: one encounter, "4 rogues" (all 4 enemies were rogues).

## Cluster A: MON01-08 at tick ~345M (8 sprites in <1s of emulator time)

These load as a tight cluster long after boot (~338M ticks after ega.drv loaded). They are NOT the per-encounter combat sprite — they preload before the rogue encounter. Plausible interpretations:

- Per-area sprite preload (8 monster types that can spawn in the starting area)
- Per-encounter-template preload (8 slots in the encounter screen)
- UI/portrait sprites for menus or party display

Order of load (`03, 01, 02, 07, 04, 05, 06, 08`) is non-sequential, ruling out a naive `for i in 1..8` loop. Suggests indexed loading driven by a list whose entries reference sprite IDs.

## Cluster B: MON22 at tick ~1158M

This is the rogue combat sprite. file size 11056 bytes (vs ~1-9KB for cluster A), consistent with a full-detail combat sprite.

## Cross-reference with scenario.json

NO monster in scenario.json has any of `combatSpriteId`, `combatSpriteAlt`, or `secondarySpriteId` equal to 22 (or 34 = 0x22). The mapping from monster fields to filename is NOT identity.

Observed sprite-id ranges in scenario.json (250 monsters total):
- `combatSpriteId`: {0, 28, 32, 33, 35, 36, 37, 51, 60, 63, 67-78, 90-93, 98, 112-152}
- `secondarySpriteId`: 0..180 with many gaps
- `spriteGroup`: 0..15
- File index space: 0..58 (59 monNN.pic files)

Since the file index range (0..58) is much smaller than any of the field value ranges, there is **definitely a lookup or compression step** between monster.fields and filename suffix.

## What's needed next

More encounter data with monsters the user can identify by descriptive name, so we can correlate (monster name → row in scenario.json → field values) against the observed MON??.PIC loads.
