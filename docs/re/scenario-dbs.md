# scenario.dbs — Wizardry VI scenario/content database

**File:** `scenario.dbs` (188,980 bytes / 0x2E234)
**Companion:** `scenario.hdr` (414 bytes) — see "scenario.hdr is unrelated" below

`scenario.dbs` is a flat sequence of game-content tables: XP curves, items,
monsters, and more tables yet to be cracked.

## Layout

| Range              | Size         | Content                                |
|--------------------|--------------|----------------------------------------|
| `0x0000..0x037F`   | 896 bytes    | XP-per-level tables — 14 classes × 16 levels × u32 LE |
| `0x0380..0x9407`   | 37,000 bytes | Item table — 500 × 74-byte records |
| `0x9408..0x154E7`  | 49,376 bytes | **unknownPreMonster** — layout TBD. Hex patterns suggest 4bpp sprite graphics (item icons / monster portraits). |
| `0x154E8..0x2304D` | 56,166 bytes | Monster table — 253 × 222-byte records |
| `0x2304E..0x2E233` | 45,542 bytes | **unknownTail** — more tables, layout TBD. ASCII strings ("SMITTY", "CAPTAIN MATEY") suggest NPC / quest data. |

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

### Monster table (0x154E8..0x2304D)

253 fixed-size 222-byte records. Each record has FOUR 16-byte name slots
followed by 158 bytes of stat data:

| Bytes  | Field              | Notes |
|--------|--------------------|-------|
| 0..15  | `nameIdSingular`   | Identified singular (e.g. "GIANT RAT") |
| 16..31 | `nameIdPlural`     | Identified plural (e.g. "GIANT RATS") |
| 32..47 | `nameUnidSingular` | What the party sees before identifying — "RAT" for a GIANT RAT |
| 48..63 | `nameUnidPlural`   | Unidentified plural |
| 64..221 | `statBytes` (158) | Per-field layout mostly TBD. **Confirmed:** bytes 64-65 = u16 LE experience-on-kill (RAT 150 XP, GIANT RAT 450, * XORPHITUS * 16,150). |

186 of the 253 slots are filled (the rest are reserved/empty). Sample
monsters showing the unidentified-name mechanic:

```
[  0] RAT             unid=RAT          XP=150
[  1] GIANT RAT       unid=RAT          XP=450
[  2] BAT             unid=BAT          XP=99
[  3] HUGE BAT        unid=BAT          XP=318
[  4] VAMPIRE BAT     unid=BAT          XP=714
[150] * XORPHITUS *                     XP=16,150  (final boss)
[151] D R A C U L A                     XP=34,244  (hidden boss)
[153] * B E L A *                       XP=44,163  (toughest)
```

The 158 stat-byte block has several visibly recurring fields — bytes 70-71,
82-83, 122-127, 134-137, etc. all show ~100% non-zero with constrained
distributions, consistent with HP, AC, attack dice, group size, etc. Cracking
those fields is Stage 1j.2.1.

### unknownPreMonster (0x9408..0x154E7)

49,376 bytes between the item table and the monster table. Best guess:
4bpp sprite graphics for inventory item icons and/or monster portraits.
The byte patterns include high-nibble/low-nibble pairs suggestive of EGA
color data, plus mirror-symmetric runs that look like pixel art.

### unknownTail (0x2304E..0x2E233)

45,542 bytes past the monster table. ASCII strings inside this region
include NPC names like "SMITTY" and "CAPTAIN MATEY". Likely contains:
- NPC definitions (dialogue triggers, quest hooks)
- Spell definitions (school, level, cost, effect handler)
- Encounter tables (zone-keyed lists of monster groups)
- Dungeon-level metadata
- Shop inventories

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

- **Stage 1j.2.1**: per-field decode of the 222-byte monster record — HP, AC,
  attack dice, group size, special abilities, etc. Bytes 64-65 (XP-on-kill)
  are confirmed; ~10 other positions show consistent population suggesting
  more fixed fields.
- **Stage 1j.3**: bind XP-table indices to character class names (probably
  resolvable by cross-reference with `newgame.dbs` records).
- **Stage 1j.4**: identify AC for armor (no obvious field in the 74-byte
  item record — AC may be implicit to equipSlot+weight, or live in a side
  table). Trace `wbase.ovr`'s combat / equip routines in Ghidra.
- **Stage 1j.5**: nail down the low-population item fields (18, 20, 22-23,
  33-49, 56-58, 70-72). Some of these likely encode resistances,
  special-attack flags, alignment/race restrictions, and identification
  difficulty.
- **Stage 1j.6**: identify the unknownPreMonster region (0x9408..0x154E7,
  49 KB). Patterns look like sprite graphics — probably the inventory-icon
  data referenced by item byte 61 (sprite index).
- **Stage 1j.7**: crack the unknownTail (0x2304E..end, 45 KB). NPC names
  visible inside — likely NPC / quest / shop / encounter data.
