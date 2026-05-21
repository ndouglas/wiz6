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

| Record bytes | Field              | Notes |
|--------------|--------------------|-------|
| 0..15        | `nameIdSingular`   | Identified singular (e.g. "GIANT RAT") |
| 16..31       | `nameIdPlural`     | Identified plural (e.g. "GIANT RATS") |
| 32..47       | `nameUnidSingular` | What the party sees before identifying — "RAT" for a GIANT RAT |
| 48..63       | `nameUnidPlural`   | Unidentified plural |
| 64..221      | `statBytes` (158)  | See decoded-fields table below. |

#### Stat-block fields (offsets relative to start of stat block; add 64 to get record offset)

| Stat offset | Field              | Confidence | Notes |
|-------------|--------------------|------------|-------|
| 0..1        | `xpOnKill`         | high | u16 LE. RAT 150, GIANT RAT 450, ISLAND GIANT 14,252, PIT FIEND 56,786. |
| 6..7        | `attack1Dice`      | high | (count, sides). First attack damage roll. RAT 1d2, ZOMBIE 3d3, PIT FIEND 4d4. |
| 9           | `attack1SpecialChance` | high | Percent chance the special effect on attack 1 triggers. ZOMBIE 80% (disease), STRANGLER VINE 15% (strangle), BANSHEE 50% (death scream), GHOSTS 50% (level drain). |
| 22..23      | `attack2Dice`      | high | (count, sides). Second attack mode; 0,0 if monster has only one attack. ROGUE 1d4, GIANT SERPENT 1d12, ZOMBIE 2d8. |
| 25          | `attack2SpecialChance` | high | Percent chance for attack 2's special. ZOMBIE 90%, ZOMBIE BONES 50%, MONSTROUS SNAKE 50% (poison). |
| 38..39      | `attack3Dice`      | high | (count, sides). Third attack mode — only 37 monsters use it (multi-attack creatures: CAPTAIN MATEY 1d6+1d6+1d6, GREMLIN 2d8+3d4+2d20, ISLAND GIANT 3d6). |
| 41          | `attack3SpecialChance` | high | Percent chance for attack 3's special. MINO-DAEMON 75%, HYDRA PLANT 20%. |
| 54..55      | `groupDice`        | high | (count, sides) for encounter group size. RAT 1d3, ROGUE LEADER 1d1 (alone), CREEPING VINE 2d3. |
| 58..59      | `hpDice`           | high | (count, sides) for the monster's HP roll. RAT 1d3, ZOMBIE 6d6, ISLAND GIANT 12d6, PIT FIEND 14d4. |
| 148         | `monsterClass`     | high | Tier enum. 1=animal/beast (105 monsters: RAT, BAT, VINE, etc.), 2=humanoid/undead (61: ROGUE, ZOMBIE, BANSHEE), 3=demon/elite (14: GREATER DEMON, FAERIE SYLPH), 4=ultimate boss (5: HAIYATO DAIKUTA, * B E L A *, FAERIE QUEEN, LORD DAIMYO, CHARRON). Rare outliers 0/21/65 exist. |
| 149         | `monsterSubClass`  | medium-high | Sub-tier within class. Mostly 1-4. Common values cluster by family — for class 1: 1=basic (RAT family, 82 monsters), 2=large (GIANT SERPENT, MAN O' WAR), 3=plant (JUNGLE VINE), 4=exotic (HYDRA PLANT). Exact semantics may also encode something like alignment. |
| 113..117    | `saveTable[5]`     | high | 5 percent values — save-throw / damage-resistance percentages by category. COLD SLIME has `[0, 100, 0, 0, 0]` (100% at index 1 → byte 114 = COLD resistance). VAMPIRE BAT 40% cold resists. PIT FIEND 65% cold (fits demon archetype). Undead family shares template `[15, 40, 30, 10, 5]`. Exact category mapping for indices 0, 2, 3, 4 still TBD. |
| 121..125    | `effectChanceTable[5]` | high | 5 percent values paired with `saveTable` — likely chance the monster INFLICTS a status effect on the party (not the monster's own saves). Many undead have identical 113-117 and 121-125 templates `[15,40,30,10,5]` since their melee inflicts the same things they resist (life drain, paralysis). PIT FIEND has nonzero saves but zero effectChances. |
| 62          | `monsterLevel`     | high | 1-50, effective combat level used for save & spell calcs. RAT 5, BAT 5, ZOMBIE 7, ISLAND GIANT 12, PIT FIEND 12, BANE KING 50. |
| 63          | `monsterLevelMax`  | high | Usually equals `monsterLevel` (180/189 monsters). For the RAT family, this is the upper bound of an encounter-level range (RAT 5-10, GIANT RAT 8-15, etc. — only 9 monsters use the range form). |
| 70..73      | `familyId[4]`      | high | 4-byte family/sprite-set identifier shared by related monsters. RAT family `(6,4,14,16)` covers 5 rats; BAT family `(4,4,17,16)` covers 4 bats; SLIME `(4,4,4,6)` 4 slimes; SKELETON `(12,12,16,12)` 5; SPIRIT-class undead `(10,12,12,12)` 9 members; GREATER DEMON `(22,16,17,17)` 4. 110 unique families total across 189 monsters. |
| other       | TBD                | — | Dense positions still un-named: bytes 56 (scales with XP but not cleanly linear — possibly gold drop or treasure score), 60 (monotonic 50-244 but not level × 10), 144-147 (4 per-family template values plus per-variant byte 147 modifier). Stage 1j.2.6 to continue. |

**Attack record structure**: bytes 6..53 contain three 16-byte attack
records at offsets 6, 22, 38. Each record holds (dice count, dice sides)
at +0, +1 and (special-effect chance %) at +3. The remaining bytes inside
each attack record likely encode special-effect type/ID and damage type
(fire/cold/poison/etc.) — those are still TBD.

189 of the 253 slots are filled (the rest are reserved/empty). Sample
monsters showing the unidentified-name mechanic and decoded fields:

```
[  0] RAT             unid=RAT         XP=  150  HP=1d3  group=1d3  atk1=1d2  atk2=1d3
[  1] GIANT RAT       unid=RAT         XP=  450  HP=2d4  group=1d2  atk1=2d2  atk2=1d7
[  2] BAT             unid=BAT         XP=   99  HP=1d3  group=1d3  atk1=1d3
[  3] HUGE BAT        unid=BAT         XP=  318  HP=2d3  group=1d2  atk1=2d3
[  4] VAMPIRE BAT     unid=BAT         XP=  714  HP=3d3  group=1d2  atk1=1d5
[150] * XORPHITUS *                    XP=16150            (final boss)
[168] PIT FIEND                        XP=56786  HP=14d4  atk1=4d4
[170] WRAITH LORD                      XP=46889  HP=14d4  atk1=8d2
```

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

- **Stage 1j.2.6**: continue cracking the monster stat block — AC, gold drop,
  damage type per attack, special-effect IDs. Stages 1j.2.1–1j.2.5 nailed
  xpOnKill, HP dice, group dice, three attack-dice fields, per-attack
  special-effect chance %, monster class/subclass, the two 5-byte save/effect
  tables, monster level, and family ID. Remaining leads:
    - byte 60: monotonically increases with monster XP (50→244). Not strictly
      level × 10 (mismatches for 93/189). Possibly to-hit chance, max-HP
      precompute, or movement-related stat.
    - bytes 144-147: 3 family-template values + 1 per-variant modifier byte
      (byte 147). Could be 3 save throws + 1 HP/damage modifier.
    - byte 56: scales with monster XP but with non-linear ratio (XP/b56
      varies from 86 to 983). Possibly gold drop using a table-lookup
      encoding rather than direct value.
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
