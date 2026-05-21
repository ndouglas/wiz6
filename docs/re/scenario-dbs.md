# scenario.dbs — Wizardry VI scenario/content database

**File:** `scenario.dbs` (188,980 bytes / 0x2E234)
**Companion:** `scenario.hdr` (414 bytes) — see "scenario.hdr is unrelated" below

`scenario.dbs` is a flat sequence of game-content tables: XP curves, items,
monsters, and more tables yet to be cracked.

## Layout

| Range              | Size         | Content                                                                                                         |
| ------------------ | ------------ | --------------------------------------------------------------------------------------------------------------- |
| `0x0000..0x037F`   | 896 bytes    | XP-per-level tables — 14 classes × 16 levels × u32 LE                                                           |
| `0x0380..0x9407`   | 37,000 bytes | Item table — 500 × 74-byte records                                                                              |
| `0x9408..0x154E7`  | 49,376 bytes | **unknownPreMonster** — layout TBD. Hex patterns suggest 4bpp sprite graphics (item icons / monster portraits). |
| `0x154E8..0x2304D` | 56,166 bytes | Monster table — 253 × 222-byte records                                                                          |
| `0x2304E..0x2E233` | 45,542 bytes | **unknownTail** — more tables, layout TBD. ASCII strings ("SMITTY", "CAPTAIN MATEY") suggest NPC / quest data.  |

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

| Bytes  | Type      | Field                     | Confidence | Notes                                                                                                                                                                                |
| ------ | --------- | ------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0..15  | name slot | `name1`, optional `name2` | high       | 15-char max name1, null-terminated. Optional alt name2 fits in remaining slot bytes. Anything past byte 15 is stat data — never read as ASCII.                                       |
| 16..17 | u16 LE    | `price`                   | high       | Gold cost. DAGGER 15g, LONGSWORD 60g, KATANA 400g, PLATE MAIL 1850g — all match Wiz6 economy.                                                                                        |
| 22..23 | u8, u8    | (effect dice?)            | low        | Mostly 0 except on consumables / magical items. Possibly effect-roll dice for potions and scrolls.                                                                                   |
| 24     | u8        | `hitBonus`                | high       | Weapon +to-hit/damage. CLAYMORE +2, BEASTMASTER +4, FANG +8, EXCALIBER +4, SWORD=LADING +8.                                                                                          |
| 26     | u8        | `damageDiceCount`         | high       | Weapon damage dice count.                                                                                                                                                            |
| 27     | u8        | `damageDiceSides`         | high       | Weapon damage dice sides. DAGGER 1d4, LONGSWORD 1d8, BASTARD SWORD 2d4.                                                                                                              |
| 28..29 | u16 LE    | `spellOrSongId`           | high       | Spell ID for scrolls (slot 13) and song/effect ID for instruments (slot 14). 0 otherwise.                                                                                            |
| 30     | u8        | `weight`                  | high       | Tenths of pounds. DAGGER 10 (1.0 lb), BASTARD SWORD 100 (10 lb), BRONZE CUIRASS 210 (21 lb).                                                                                         |
| 33..49 | u8 × N    | (resistances?)            | low        | Sparse 25/50/75 values suggest percent resistance to damage types. Only on magic-resistant gear.                                                                                     |
| 54..55 | u16 LE    | `classMask`               | high       | 14-bit bitmask, classes 0..13. STAFF = 0x3fff (all classes). KATANA = restricted few.                                                                                                |
| 56     | u8        | (race mask?)              | medium     | 8 bits, mostly 0xff/0xdf. Likely race restriction.                                                                                                                                   |
| 57     | u8        | (alignment?)              | medium     | Mostly 0x07 (3 low bits = G/N/E?).                                                                                                                                                   |
| 58     | u8        | (?)                       | low        | Mostly 0x03. Possibly sex restriction (2 bits).                                                                                                                                      |
| 60     | u8        | `equipSlot`               | high       | Enum: 0=1H weapon, 1=pole, 2=thrown, 3=ranged, 4=ammo, 5=cloak, 6=head, 7=body, 8=legs, 9=hands, 10=feet, 11=shield, 12=potion, 13=scroll, 14=instrument/book/misc, 15=key, 16=dust. |
| 61     | u8        | (sprite index?)           | medium     | 100 distinct values, 0..119. Likely index into an inventory-sprite catalog.                                                                                                          |
| other  | —         | TBD                       | —          | A handful of low-population fields (18, 20, 70..72) remain unidentified.                                                                                                             |

#### Sub-block summary (by name + equip slot)

| Slot range | Apparent category     | Examples                                                 |
| ---------- | --------------------- | -------------------------------------------------------- |
| 0..163     | Weapons (164 entries) | DAGGER, MAIN GAUCHE, SHORT SWORD, RAPIER, KATANA, BOW    |
| 164..169   | Reserved (6 empty)    | —                                                        |
| 170..?     | Armor & misc gear     | BRONZE CUIRASS, LEATHER GREAVES, HELM&COIF, ROUND SHIELD |
| ?..?       | Accessories           | RING=DELPHI, SCARAB NECKLACE, MEDICINE BAG               |
| ?..?       | Books / wands         | BOOK=LEVITATION, WAND=GHOSTS, NECROLOGY ROD              |
| ?..482     | Quest items / keys    | KEY=WIZARD CAVE, NORTH EXIT KEY, J.R. DECODER            |

The sub-block boundaries aren't sharply marked — empty slots act as soft
dividers but don't always sit on category transitions. The decoded
`equipSlot` field is a more reliable category signal than slot-range.

### Monster table (0x154E8..0x2304D)

253 fixed-size 222-byte records. Each record has FOUR 16-byte name slots
followed by 158 bytes of stat data:

| Record bytes | Field              | Notes                                                          |
| ------------ | ------------------ | -------------------------------------------------------------- |
| 0..15        | `nameIdSingular`   | Identified singular (e.g. "GIANT RAT")                         |
| 16..31       | `nameIdPlural`     | Identified plural (e.g. "GIANT RATS")                          |
| 32..47       | `nameUnidSingular` | What the party sees before identifying — "RAT" for a GIANT RAT |
| 48..63       | `nameUnidPlural`   | Unidentified plural                                            |
| 64..221      | `statBytes` (158)  | See decoded-fields table below.                                |

#### Stat-block fields (offsets relative to start of stat block; add 64 to get record offset)

| Stat offset | Field                  | Confidence  | Notes                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ---------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0..1        | `xpOnKill`             | high        | u16 LE. RAT 150, GIANT RAT 450, ISLAND GIANT 14,252, PIT FIEND 56,786.                                                                                                                                                                                                                                                                                   |
| 6..7        | `attack1Dice`          | high        | (count, sides). First attack damage roll. RAT 1d2, ZOMBIE 3d3, PIT FIEND 4d4.                                                                                                                                                                                                                                                                            |
| 9           | `attack1SpecialChance` | high        | Percent chance the special effect on attack 1 triggers. ZOMBIE 80% (disease), STRANGLER VINE 15% (strangle), BANSHEE 50% (death scream), GHOSTS 50% (level drain).                                                                                                                                                                                       |
| 22..23      | `attack2Dice`          | high        | (count, sides). Second attack mode; 0,0 if monster has only one attack. ROGUE 1d4, GIANT SERPENT 1d12, ZOMBIE 2d8.                                                                                                                                                                                                                                       |
| 25          | `attack2SpecialChance` | high        | Percent chance for attack 2's special. ZOMBIE 90%, ZOMBIE BONES 50%, MONSTROUS SNAKE 50% (poison).                                                                                                                                                                                                                                                       |
| 38..39      | `attack3Dice`          | high        | (count, sides). Third attack mode — only 37 monsters use it (multi-attack creatures: CAPTAIN MATEY 1d6+1d6+1d6, GREMLIN 2d8+3d4+2d20, ISLAND GIANT 3d6).                                                                                                                                                                                                 |
| 41          | `attack3SpecialChance` | high        | Percent chance for attack 3's special. MINO-DAEMON 75%, HYDRA PLANT 20%.                                                                                                                                                                                                                                                                                 |
| 54..55      | `groupDice`            | high        | (count, sides) for encounter group size. RAT 1d3, ROGUE LEADER 1d1 (alone), CREEPING VINE 2d3.                                                                                                                                                                                                                                                           |
| 58..59      | `hpDice`               | high        | (count, sides) for the monster's HP roll. RAT 1d3, ZOMBIE 6d6, ISLAND GIANT 12d6, PIT FIEND 14d4.                                                                                                                                                                                                                                                        |
| 148         | `monsterClass`         | high        | Tier enum. 1=animal/beast (105 monsters: RAT, BAT, VINE, etc.), 2=humanoid/undead (61: ROGUE, ZOMBIE, BANSHEE), 3=demon/elite (14: GREATER DEMON, FAERIE SYLPH), 4=ultimate boss (5: HAIYATO DAIKUTA, * B E L A *, FAERIE QUEEN, LORD DAIMYO, CHARRON). Rare outliers 0/21/65 exist.                                                                     |
| 149         | `monsterSubClass`      | medium-high | Sub-tier within class. Mostly 1-4. Common values cluster by family — for class 1: 1=basic (RAT family, 82 monsters), 2=large (GIANT SERPENT, MAN O' WAR), 3=plant (JUNGLE VINE), 4=exotic (HYDRA PLANT). Exact semantics may also encode something like alignment.                                                                                       |
| 113..117    | `saveTable[5]`         | high        | 5 percent values — save-throw / damage-resistance percentages by category. COLD SLIME has `[0, 100, 0, 0, 0]` (100% at index 1 → byte 114 = COLD resistance). VAMPIRE BAT 40% cold resists. PIT FIEND 65% cold (fits demon archetype). Undead family shares template `[15, 40, 30, 10, 5]`. Exact category mapping for indices 0, 2, 3, 4 still TBD.     |
| 121..125    | `effectChanceTable[5]` | high        | 5 percent values paired with `saveTable` — likely chance the monster INFLICTS a status effect on the party (not the monster's own saves). Many undead have identical 113-117 and 121-125 templates `[15,40,30,10,5]` since their melee inflicts the same things they resist (life drain, paralysis). PIT FIEND has nonzero saves but zero effectChances. |
| 62          | `monsterLevel`         | high        | 1-50, effective combat level used for save & spell calcs. RAT 5, BAT 5, ZOMBIE 7, ISLAND GIANT 12, PIT FIEND 12, BANE KING 50.                                                                                                                                                                                                                           |
| 63          | `monsterLevelMax`      | high        | Usually equals `monsterLevel` (180/189 monsters). For the RAT family, this is the upper bound of an encounter-level range (RAT 5-10, GIANT RAT 8-15, etc. — only 9 monsters use the range form).                                                                                                                                                         |
| 70..73      | `familyId[4]`          | high        | 4-byte family/sprite-set identifier shared by related monsters. RAT family `(6,4,14,16)` covers 5 rats; BAT family `(4,4,17,16)` covers 4 bats; SLIME `(4,4,4,6)` 4 slimes; SKELETON `(12,12,16,12)` 5; SPIRIT-class undead `(10,12,12,12)` 9 members; GREATER DEMON `(22,16,17,17)` 4. 110 unique families total across 189 monsters.                   |
| 64          | `creatureKind`         | high        | Body-type enum. 1=humanoid soldier (ROGUE, BRIGAND, PIRATE, AMAZULU), 2=stone elemental (GUARDIAN=ROCK, ROCK=RUMBLE), 3=elite humanoid (HIGHLANDER, DROW ELF), 4=rodent/cat (RAT family, HELLCAT), 5=flying creature (BAT family, GIANT SERPENT), 6=plant (VINE family, RUBBER BEAST), 7=blob/slime (SLIME, JELLY CLOUD, MAN O' WAR), 8=undead (ZOMBIE, BANSHEE, SPECTRE), 10=elite warrior (NINJA, ASSASSIN, PIT FIEND). Orthogonal to `monsterClass`.                                              |
| 150         | `monsterSex`           | high        | 0=male humanoid (54 monsters: ROGUE, BRIGAND, PIRATE, etc.), 1=female (23: AMAZULU, SHAMANESS, PRIESTESS, AMAZULU QUEEN, FAERIE QUEEN), 2=neuter/creature (110: RAT, BAT, VINE, ZOMBIE, PIT FIEND). The female-Amazonian cluster + female-Faerie cluster makes this categorization unambiguous.                                                              |
| 60          | `moveStat`             | medium-high | Defaults to `monsterLevel × 10` (verified exactly for 171/189 monsters). Designers override for special creatures: PIT FIEND (lvl 12) 200, HAIYATO (lvl 20) 244, but WILL O' WISP & FAERIE QUEEN (lvl 20) only 44 — ethereal/teleporting monsters look "slow" on this scale. Likely movement speed or combat-engagement stat. Exact semantics still TBD. |
| 157         | `spriteGroup`          | medium-high | Sprite/animation group enum. 2 = small beast (48: RAT, BAT, GIANT SERPENT), 3 = vine (4), 4 = exotic plant (HYDRA PLANT, RUBBER BEAST), 6 = blob/humanoid-flexible (71: SLIME, AMAZULU types), 7 = large creature (16: GIANT, MINO-DAEMON), 14 = generic humanoid (34: ROGUE, BRIGAND), 15 = armored (8: DARK CRUSADER, VALKYRIE). |
| 126         | `monsterAC`            | high        | Signed int8. Wiz6 AC convention (lower = better). Range -14 to +12. Normal monsters AC 4-8 (RAT 5, BAT 7, ZOMBIE 10, GIANT SERPENT 4). Tough monsters AC 2-3 (PIT FIEND 2, GIANT RAT 3). Legendary monsters get NEGATIVE AC: FAERIE SYLPH -4, FAERIE QUEEN / * B E L A * -6, * XORPHITUS * -2, WILL O' WISP -14 (nearly untouchable). |
| 144..147    | `attributeSaves[4]`    | medium-high | 4 save-throw percentages, heavily family-shared with per-variant tweaks. RAT family 16/21/18/{14 or 18}; BAT family 16/18/19/{10 or 14}; SPIRIT-class undead 20/44/34/18 (high middle = good vs spell); GIANT family 14/26/24/{16 or 20}; LESSER DEMON family 21/12/15/{18 or 12}; WILL O' WISP 26/53/38/24. Likely correspond to (save vs Magic, save vs Mental/Spell, save vs Death/Para, save vs Breath) or similar 4-category save system. |
| 56          | `goldStat`             | medium-high | Scales with monster strength. RAT 1 (= 10 gp), ZOMBIE 20 (200 gp), PIT FIEND 140 (1,400 gp), BANE KING / DRACULA 150 (1,500 gp), HELLCAT=FIRE 60 (600 gp). Best-fit interpretation: average gold drop in tens of gold pieces. Byte 57 is nearly always 0 (no high byte), so this is a one-byte field. |
| 152         | `specialAttackElement` | high        | Damage-type / element enum: 1=fire (HELLCAT, PIT FIEND, HELLION), 2=earth (GUARDIAN=ROCK, ROCK=RUMBLE), 3=cold (COLD SLIME, WHITE WYRM, WEIRD), 4=acid (RUBBER BEAST, GOOP GLOOP, MAN O' WAR), 5=disease (ZOMBIE family — 7 members), 6=water (FLOATER, WATER DRAGON), 7=vampiric (BANE KING, DRACULA, REBECCA), 8=poison (DRAGONFLY, BLUE TAIL FLY, B E L A), 9=plant poison (FUMING VINE, HYDRA PLANT), 11=mental/scream (BANSHEE, SPECTRE, ghosts), 12=charm (SIREN family). |
| 156         | `monsterBehaviorClass` | medium      | 7-value enum (0/1/2/5/8/10/11) clustering by combat behavior: 0=normal (103 monsters), 1=humanoid elite leader (19: CAPTAIN MATEY, QUEEQUEG, AMAZULU QUEEN, GUARDIAN=ROCK), 2=undead (27: BANSHEE, SPECTRE, SPIRIT, WRAITH, ghosts), 5=vampire boss (2: BANE KING, DRACULA), 8=swarm/flying/plant (33: BAT family, VINE family), 10=faerie ethereal (4: FAERIE SYLPH, WILL O' WISP, TWISTED SYLPH, PIXIE), 11=unique boss (1: FAERIE QUEEN). |
| 18..19, 34..35, 50..51 | `attack1Extra[2]`, `attack2Extra[2]`, `attack3Extra[2]` | high (structural) | Per-attack 2-byte data fields, present iff the corresponding attack exists. Perfect 100% correlation: byte 34-35 nonzero for all 84 monsters with atk2 and zero for all 105 without; same for atk3 (byte 50-51 nonzero for 37/37 monsters with atk3, zero otherwise). Exact semantic interpretation TBD — likely encodes (damage type, attack flags / spell ID) per attack. byte 18 distribution favors multiples of 5 (65/75/50/85/70/35); byte 19 has many small values (1-4) plus powers of 2 (32/64/128) suggesting a flags bitfield. |
| 10, 26, 42  | `attackNPoisonChance`  | high        | Percent chance attack N inflicts poison/disease/acid status. POISON VIPER 100%, CATERPILLAR 100%, MAN O' WAR 95%, ASSASSIN 95%, GIANT SERPENT 90%, AMAZULU QUEEN 90%, HUGE SPIDER/TARANTULA 85%, GREMLIN 50%, VAMPIRE BAT 40%, ACID SLIME 35%, POISON SLIME 25%, FLOATER 25%, POISON VINE 25%. Matches Wiz6 poison/disease inflictor archetype. |
| 13, 29, 45  | `attackNDrainChance`   | high        | Percent chance attack N inflicts level drain. All matches are classic Wiz6 level-drain undead: WRAITH 100%, WRAITH LORD 100%, PHANTASM 100%, LICHE 100%, CHARRON 100%, ACCURSED ONE 100%, BANE KING 100%, DRACULA 100%, REBECCA 100%; SPECTRE 90%, GHOSTLY SHE-HAG 90%, EILA'S GHOST 90%; BANSHEE 50%, SPIRIT 50%, ghosts 50%; SHADE 35%; WILL O' WISP 25%. |
| 15, 31, 47  | `attackNStunChance`    | high        | Percent chance attack N stuns/bashes. Pattern matches heavy-hitting / blunt-attack monsters: GUARDIAN=ROCK 25%, PRIEST=RAMM 25%, ROCK=RUMBLE 20%, SMITTY 20%, ARIEL SERVANT 20%, KING CRAB 15%, BORK 15%; ISLAND GIANT, HILL/MINER/MOUNTAIN GIANT, FRYTZ/KLAUS GRYNS, MAJOR DWARF, VALKYRIE, KNOLL TROLL, POISON GIANT all 10%. |
| 8, 24, 40   | `attackNHpDrainChance` | medium-high | Percent chance attack N drains stamina/HP. Pattern matches incorporeal undead: SPIRIT 25%, SHADE 25%, SHADOW 25%, WILL O' WISP 25%, HAUNT 20%, CAPTAIN MATEY 4%. Atk2/atk3 are very sparse. |
| 11, 27, 43  | `attackNAgeChance`     | medium-high | Percent chance attack N inflicts aging. CHARRON 100%, WRAITH 50%, WRAITH LORD 50%, PHANTASM 50%, FAERIE QUEEN 50%, WILL O' WISP 25%, HAUNT 20%, WRAITH (variant) 15%. Classic Wiz6 aging-undead pattern. |
| 14, 30, 46  | `attackNDecapitateChance` | high     | Percent chance attack N decapitates / scores instant-kill critical. NINJA 8%, ASSASSIN 8%, CHUNIN 10%, HAIYATO DAIKUTA 10%, MAI-LAI 10%, ROBIN WINDMARNE 10%, BRIGERD WOLTAN 10%, KNIGHT=DEATH 2%, GRANDFATHER 12%, * XORPHITUS * 15%, HORASTHMUS 15%, TYRANNASAURUS 50%. Matches Wiz6 Ninja / elite-warrior critical-strike mechanic. Atk2/atk3: DEMONIC HELLCAT/MAI-LAI/LORD DAIMYO/HELLCAT=FIRE/HELLION (atk2 byte 30) and GREMLIN/* B E L A * (atk3 byte 46). |
| 17, 33, 49  | `attackNStyle`         | high        | Attack style enum: 0=default melee (most monsters), 1=grapple/entangle (CREEPING/FUMING/STRANGLER/JUNGLE VINE, GIANT SERPENT, HYDRA PLANT, DUNGEON LEECH — 39 monsters), 2=stun/crush (GUARDIAN=ROCK, ROCK=RUMBLE, ARIEL SERVANT — 3 monsters), 3=ranged/precision (AMAZULU ARCHER, ROBIN WINDMARNE, HIGHLANDER, DROW ELF — 4 monsters). Every match aligns with the monster's archetypal attack form. |
| 20, 36, 52  | `attackNDamageBonus`   | high        | Flat damage bonus added to the attack roll. Values monotonically scale with monster strength: GIANT RAT +1, HYDRA PLANT +2, GIANT SERPENT +4, HIGHLANDER/CHIMERA +4, NINJA +8, GREATER DEMON +20, ISLAND GIANT/GRANDFATHER +20, POISON GIANT +30, TYRANNASAURUS +10. Adds to the base XdY dice roll for total damage. |
| 16, 32, 48  | `attackNPoisonStrength` | medium-high | Poison/status-effect intensity (likely poison dice count per turn or turns of duration). Set on poison/disease-inflicting monsters: CATERPILLAR 20, ASSASSIN 10, POISON VIPER 8, KUWALI KUBONA 6, MYSTAPHAPHAS 5, MAN O' WAR / AMAZULU QUEEN / TARANTULA 4, GIANT SERPENT / AMEN-TUT-BUTT / ACID SLIME / RABID RAT 3, GELATIN VAPOR / HUGE SPIDER / FORAGER / JAIL RAT 2, VAMPIRE BAT / POISON SLIME / JELLY CLOUD / FLOATER 1. Correlates with `attackNPoisonChance`. |
| 85..96      | `extendedSaves[12]`    | medium-high | 12-byte cluster of save/resistance percentages (values 0, 25, 35, 50, 65, 75, 95, 125 — all multiples of 5 with 125 as immunity sentinel). Heavily family-shared: SPIRIT family (SPIRIT/WRAITH/LICHE/HAUNT/WRAITH LORD/SHADE/SHADOW/PHANTASM/ACCURSED ONE) shares `[65,65,65,125,125,125,125,125,125,125,*,*]` template — seven 125s indicate 7 categories of immunity for incorporeal undead. RAT family has all zeros (no special resistances). Likely encodes resistance to: physical/blade/blunt/piercing/missile/fire/cold/acid/poison/electric/mental/death — but exact category mapping is TBD. |
| 98          | `combatSpriteId`       | high        | Combat-screen sprite / portrait ID. Strong family-sharing pattern: humanoid pirates (ROGUE/BUSHWACKER/BRIGAND/PIRATE) share 35, GIANT family (HILL/MINER/MOUNTAIN/ISLAND/FRYTZ/KLAUS GRYNS) share 124, SPIRIT-class undead (BANSHEE/SPECTRE/SPIRIT/WRAITH) share 128, GREATER DEMON / PIT FIEND / WRAITH LORD share 147, NINJA/ASSASSIN/CHUNIN share 140, BANE KING/DRACULA/REBECCA share 98. 63 distinct values in total. Unique values for unique bosses (CAPTAIN MATEY 4/28, FAERIE QUEEN 116, * XORPHITUS * 112, * B E L A * 113). |
| 99          | `combatSpriteAlt`      | high        | Alternate / variant sprite ID. Byte 99 == byte 98 for 185/189 monsters. The 4 mismatches (BUSHWACKER/BRIGAND/PIRATE/CAPTAIN MATEY) have byte 99 = byte 98 + 1 — likely alternate-pose sprites for these encounter variants. |
| 100         | `secondarySpriteId`    | high        | Secondary sprite / portrait ID, 80 distinct values, family-shared independently of `combatSpriteId`. All four named GHOSTs + ZOMBIE GUARD share 104; AMAZULU/SHAMANESS/PRIESTESS share 36; dwarves/giants share 55; sea creatures (SEA SERPENT, WATER DRAGON, DRAGONFLY, BLUE TAIL FLY) share 79; vines share 5; blobs (JELLY CLOUD, GELATIN VAPOR, FLOATER) share 42; sirens share 73; demons (GUARDIAN=RAMM, MIND FLAYER, PRIEST=RAMM) share 130. Likely an "encounter context" or "secondary appearance" identifier. |
| 102         | `magicResistChance`    | medium | Percent value (15 distinct: 0/5/10/15/20/25/30/35/40/45/50/65/75/80/100). High values cluster on spell-casters and bosses — FAERIE QUEEN 100%, AMAZULU QUEEN 100%, MAU-MU-MU 100%, * XORPHITUS * 100%, PIT FIEND/GREATER DEMON 80%, LICHE 50%, WRAITH 40%, PRIESTESS 30%. Pattern is consistent with magic-resistance / save-vs-spell, BUT some non-caster outliers (RAT 50%) don't fit cleanly, so the exact category may be different (e.g., a generic save percentage). |
| 112         | `combatTraitId`        | medium-high | Small enum (8 distinct values 5/10/15/20/25/30/35) with strong family grouping. 5=wyrms / large flying (DUNGEON LEECH, GIANT WYRM, WHITE WYRM, DEMONIC HELLCAT, NIGHTGAUNT, GOBLIN); 10=rats (RAT family + MINO-DAEMON); 15=large beasts (FAT RAT, CATERPILLAR, * B E L A *, GREATER DEMONs); 20=serpents (GIANT SERPENT, MYSTAPHAPHAS, SEA SERPENT, WATER DRAGON, MONSTROUS SNAKE, POISON VIPER); 25=blob/flying (JELLY CLOUD, GELATIN VAPOR, FLOATER, MAN O' WAR, DRAGONFLY, GIANT MOSQUITO); 35=sirens. Likely an attack-animation / combat-behavior trait. |
| 103         | `auxSave103`           | low         | Percent-style byte (10-100, multiples of 5). Sparse across the table — no obvious family clustering by name. Named neutrally because the semantics aren't clear yet; could be a per-creature save-throw modifier, a resist category, or a difficulty-tuning knob. |
| 104         | `spellPowerChance`     | medium-high | Percent value with a clean spell-caster signature: SIREN SORCERESS / MAI-LAI / GOBLIN SHAMAN 100%, PRIESTESS 95%, WRAITH / LICHE / * XORPHITUS * 90%, GREATER DEMON 75%, ghost-class undead 65%. Looks like a "successful spell-cast" or "spell power roll" chance, distinct from `magicResistChance` (byte 102) which is the defensive side. |
| 106         | `auxSave106`           | low         | Another percent byte (multiples of 5). Mixed patterns: vines / acid creatures around 20%, undead around 35%, sirens 75-80%. Doesn't fit cleanly into spell-resist or status-save categories, so named neutrally; could be an environmental-effect resistance or a behavior trigger. |
| 111         | `flyEvadeChance`       | medium-high | Percent value strongly associated with the BAT family — every named BAT (BAT, HUGE, VAMPIRE, BLACK, MONSTROUS, INDIGO) has exactly 50%. Insects (DRAGONFLY, MOSQUITO) cluster around 25%, faerie/undead-ghost types around 20%. Pattern fits an evade / flight / "miss me on attack" mechanic for flying creatures; the name is provisional and could equally read as "agility evade". |
| (per-attack) +6 and +15 | (unused padding in real monsters) | high | Confirmed unused padding within attack records of real monster combat records: across all 250 regular monsters (indices 0-249), zero records have non-zero bytes at +6 or +15. The three records with apparent non-zero values at these offsets (indices 250-252) are not real monsters — they are special quest/event data records reusing the 222-byte format (see "Special quest-data records" below). |

#### Special quest-data records (indices 250-252)

The last three entries of the monster table are not combat monsters — they
are NPC / quest / minigame data structures that reuse the 222-byte
monster-record format. They appear in the monster decoder as regular
monsters but their byte-level interpretation is completely different from
combat records:

| Record | Name slot          | Embedded content                                       | Interpretation |
|--------|--------------------|--------------------------------------------------------|----------------|
| 250    | "CAPTAIN MATEY"    | "QUEEQUEG" (Matey's first mate) + u16 LE sequences `[0,1,2,3,4,5,6,7]` and `[25,20,21,22,23,24]` | Drinking-contest minigame data |
| 251    | (empty)            | "COSMIC FORGE" (the central plot artifact) + "* B E L A *" + u16 LE sequences | Cosmic-Forge quest event data |
| 252    | (empty)            | "L'MONTES" (Wiz6 quest NPC) + u16 LE sequences `[285,286,287,288,289]` and `[12,13,14,15,16,17]` | L'MONTES quest event data |

The "byte +6" CAPTAIN MATEY value of 6 — which initially looked like an
attack-record anomaly — is in fact just position 12 of record 250's u16 LE
sequence `[0, 1, 2, 3, 4, 5, 6, 7]`. It belongs to the drinking-contest
data structure, not the monster attack record.

Future stages should either expose these three records as a separate
schema or pull them out of the monster decoder entirely.

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

- Monster attack records FULLY decoded (Stages 1j.2.1–1j.2.14). Plus
  `extendedSaves[12]` at 85-96 (resistance/immunity table) and
  `combatSpriteId` / `combatSpriteAlt` at 98-99 (sprite IDs with strong
  family-sharing pattern).
- Remaining un-decoded stat-block territory: bytes 100-112. Mix of dense
  fields (100 with 80 distinct, 102 with 15 percent-like, 104 with 16)
  and sparse ones (105, 107, 109-110 all near-zero). Possibly spell
  ids, per-category multipliers, or breath-weapon data.
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
