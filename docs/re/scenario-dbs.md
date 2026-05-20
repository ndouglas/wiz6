# scenario.dbs — Wizardry VI scenario/content database

**File:** `scenario.dbs` (188,980 bytes / 0x2E234)
**Companion:** `scenario.hdr` (414 bytes) — see "scenario.hdr is unrelated" below

`scenario.dbs` is a flat sequence of game-content tables: XP curves, items,
and a long unidentified tail that almost certainly contains monsters, spells,
encounter tables, and dungeon-content data. This stage decoded two of those
tables; the other ~151 KB stays as `unknownTail` for future stages.

## Layout

| Range              | Size        | Content                                |
|--------------------|-------------|----------------------------------------|
| `0x0000..0x037F`   | 896 bytes   | XP-per-level tables — 14 classes × 16 levels × u32 LE |
| `0x0380..0x9407`   | 37,000 bytes | Item table — 500 × 74-byte records   |
| `0x9408..0x2E233`  | 151,084 bytes | **unknownTail** — more tables, layout TBD |

### XP tables (0x0000..0x037F)

14 character classes, each with 16 little-endian u32 entries giving the XP
total needed to advance from level N to level N+1. The first 8 entries of
each table double (classic Wiz progression: 1000, 2000, 4000, 8000, 16000,
32000, 64000, 128000) and entries 8..15 grow linearly with a fixed
increment.

Sample values from the real file:

```
class  0: 1000, 2000, 4000, 8000, ..., 128000, 256000, 512000, ..., 2048000
class  1: 1250, 2500, 5000, 10000, ..., 160000, 320000, 640000, ..., 2890000
class  3:  900, 1800, 3600, 7200, ..., 115200, 230400, 460800, ..., 1810800
class  9: 1500, 3000, 6000, 12000, ..., 192000, 384000, 768000, ..., 3438000
```

Several classes share an identical XP curve — likely Bishop/Priest/Alchemist
(arcane-heavy classes converge on the 1250-base curve), and Samurai/Lord etc.
which classes get which curve isn't yet identified by class name, only by
index.

### Item table (0x0380..0x9407)

500 fixed-size 74-byte records, each holding up to two null-terminated names
(singular + plural) followed by binary stat fields whose layout isn't yet
decoded. 452 of the 500 slots are filled; 48 are all-zero placeholder slots
reserved by the original game-data tooling, scattered through the table.

Identifiable sub-blocks based on contiguous name patterns:

| Slot range  | Apparent category | Examples                                |
|-------------|-------------------|-----------------------------------------|
| 0..163      | Weapons (164 entries) | DAGGER, MAIN GAUCHE, SHORT SWORD, RAPIER, KATANA, BOW |
| 164..169    | Reserved (6 empty) | — |
| 170..?      | Armor & misc gear | BRONZE CUIRASS, LEATHER GREAVES, HELM&COIF, ROUND SHIELD |
| ?..?        | Accessories       | RING=DELPHI, SCARAB NECKLACE, MEDICINE BAG |
| ?..?        | Books / wands     | BOOK=LEVITATION, WAND=GHOSTS, NECROLOGY ROD |
| ?..482      | Quest items / keys | KEY=WIZARD CAVE, NORTH EXIT KEY, J.R. DECODER |

The sub-block boundaries aren't sharply marked — empty slots act as soft
dividers but don't always sit on category transitions.

#### Record layout (partial)

Each 74-byte record starts with two null-terminated ASCII strings:
- `name1` — primary name (usually singular)
- `name2` — alternate name; often empty, sometimes plural ("DAGGER"/"DAGGER")
  or alternate spelling

The remaining bytes hold the item's stats. Specific field positions aren't
yet identified — likely candidates based on Wiz6 mechanics:
- gold price (LE word, probably the 1000-2000 range visible in many records)
- damage dice (for weapons)
- AC (for armor)
- usable-by-class bitmask
- equip-slot flags
- spell-cast-when-used pointer
- weight (the small byte values like 6, 8, 10 seen consistently)

A future stage can crack these by either tracing the routine that loads
items in `wbase.ovr` or by correlating known in-game item stats with
specific record-byte positions.

### unknownTail (0x9408..0x2E233)

151,084 bytes of additional tables. Best guesses based on what a CRPG of
this vintage typically packs into one content file:
- monster definitions (stats, AI flags, encounter groups)
- spell definitions (school, level, cost, effect handler)
- encounter tables (zone-keyed lists of monster groups)
- dungeon-level metadata (linking back to mazedata.ega per-zone records)
- shop inventories
- NPC dialogue trees / event scripts

These aren't structurally similar to items — none of the strings in this
region look like item names, and the 74-byte stride breaks down. Decoding
this region needs new RE work, probably starting from the `wbase.ovr`
routines that load scenario data at game-init time.

## scenario.hdr is unrelated to scenario.dbs

`scenario.hdr` (414 bytes) is **not** an index for `scenario.dbs`. It
contains:
- A 64-byte block that byte-for-byte matches the first record of
  `newgame.dbs` (likely the "current scenario" cached template)
- The string `"C:\BANE\"` at offset 0x148 — the game's install path
- Mostly zeros elsewhere

Best interpretation: `scenario.hdr` is a savegame-state header, possibly
written by the installer to remember the install directory and the active
scenario's initial conditions. Its name confused us — it's a header for
the *running scenario state*, not for the *scenario content file*.

## What this stage shipped

- `ScenarioDbSchema` in `@wiz6/data` (XP tables + items + unknownTail)
- `decodeScenarioDb` + `extractScenarioDb` in `@wiz6/parser`
- `extract-scenario` CLI subcommand
- `loadScenarioDb` + `ScenarioGallery` in `@wiz6/viewer` — renders the XP
  table as a grid and the items as a searchable, hex-annotated list

## Future work

- **Stage 1j.1**: per-field decode of the 74-byte item record (price,
  damage, AC, class mask, etc.). Best path: trace `wbase.ovr`'s item-load
  routine in Ghidra and correlate with in-game stats.
- **Stage 1j.2**: identify the next table after 0x9408 (likely monsters).
  Look for repeating-stride patterns and name-like ASCII strings.
- **Stage 1j.3**: bind XP-table indices to character class names (probably
  resolvable by cross-reference with `newgame.dbs` records).
