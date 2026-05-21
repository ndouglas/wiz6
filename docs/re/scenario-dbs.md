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

500 fixed-size 74-byte records. 452 of the 500 slots are filled; 48 are
all-zero placeholder slots reserved by the original game-data tooling,
scattered through the table.

#### Record layout

| Bytes  | Type   | Field             | Confidence | Notes |
|--------|--------|-------------------|------------|-------|
| 0..15  | name slot | `name1`, optional `name2` | high | 15-char max name1, null-terminated. Optional alt name2 fits in remaining slot bytes. Anything past byte 15 is stat data — never read as ASCII. |
| 16..17 | u16 LE | `price`           | high | Gold cost. DAGGER 15g, LONGSWORD 60g, KATANA 400g, PLATE MAIL 1850g — all match Wiz6 economy. |
| 22..23 | u8, u8 | (effect dice?)    | low  | Mostly 0 except on consumables / magical items. Possibly effect-roll dice for potions and scrolls. |
| 24     | u8     | `hitBonus`        | high | Weapon +to-hit/damage. CLAYMORE +2, BEASTMASTER +4, FANG +8, EXCALIBER +4, SWORD=LADING +8. |
| 26     | u8     | `damageDiceCount` | high | Weapon damage dice count. |
| 27     | u8     | `damageDiceSides` | high | Weapon damage dice sides. DAGGER 1d4, LONGSWORD 1d8, BASTARD SWORD 2d4. |
| 28..29 | u16 LE | `spellOrSongId`   | high | Spell ID for scrolls (slot 13) and song/effect ID for instruments (slot 14). 0 otherwise. |
| 30     | u8     | `weight`          | high | Tenths of pounds. DAGGER 10 (1.0 lb), BASTARD SWORD 100 (10 lb), BRONZE CUIRASS 210 (21 lb). |
| 33..49 | u8 × N | (resistances?)    | low  | Sparse 25/50/75 values suggest percent resistance to damage types. Only on magic-resistant gear. |
| 54..55 | u16 LE | `classMask`       | high | 14-bit bitmask, classes 0..13. STAFF = 0x3fff (all classes). KATANA = restricted few. |
| 56     | u8     | (race mask?)      | medium | 8 bits, mostly 0xff/0xdf. Likely race restriction. |
| 57     | u8     | (alignment?)      | medium | Mostly 0x07 (3 low bits = G/N/E?). |
| 58     | u8     | (?)               | low | Mostly 0x03. Possibly sex restriction (2 bits). |
| 60     | u8     | `equipSlot`       | high | Enum: 0=1H weapon, 1=pole, 2=thrown, 3=ranged, 4=ammo, 5=cloak, 6=head, 7=body, 8=legs, 9=hands, 10=feet, 11=shield, 12=potion, 13=scroll, 14=instrument/book/misc, 15=key, 16=dust. |
| 61     | u8     | (sprite index?)   | medium | 100 distinct values, 0..119. Likely index into an inventory-sprite catalog. |
| other  | —      | TBD               | — | A handful of low-population fields (18, 20, 70..72) remain unidentified. |

#### Sub-block summary (by name + equip slot)

| Slot range  | Apparent category | Examples                                |
|-------------|-------------------|-----------------------------------------|
| 0..163      | Weapons (164 entries) | DAGGER, MAIN GAUCHE, SHORT SWORD, RAPIER, KATANA, BOW |
| 164..169    | Reserved (6 empty) | — |
| 170..?      | Armor & misc gear | BRONZE CUIRASS, LEATHER GREAVES, HELM&COIF, ROUND SHIELD |
| ?..?        | Accessories       | RING=DELPHI, SCARAB NECKLACE, MEDICINE BAG |
| ?..?        | Books / wands     | BOOK=LEVITATION, WAND=GHOSTS, NECROLOGY ROD |
| ?..482      | Quest items / keys | KEY=WIZARD CAVE, NORTH EXIT KEY, J.R. DECODER |

The sub-block boundaries aren't sharply marked — empty slots act as soft
dividers but don't always sit on category transitions. The decoded
`equipSlot` field is a more reliable category signal than slot-range.

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

- **Stage 1j.2**: identify the next table after 0x9408 (likely monsters).
  Look for repeating-stride patterns and name-like ASCII strings.
- **Stage 1j.3**: bind XP-table indices to character class names (probably
  resolvable by cross-reference with `newgame.dbs` records).
- **Stage 1j.4**: identify AC for armor (no obvious field in the 74-byte
  record — AC may be implicit to equipSlot+weight, or live in a side
  table). Trace `wbase.ovr`'s combat / equip routines in Ghidra.
- **Stage 1j.5**: nail down the low-population fields (18, 20, 22-23, 33-49,
  56-58, 70-72). Some of these likely encode resistances, special-attack
  flags, alignment/race restrictions, and identification difficulty.
