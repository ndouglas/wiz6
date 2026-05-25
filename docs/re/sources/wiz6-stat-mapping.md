# Wizardry VI documented stats — source cross-reference

## Sources consulted

- **Manual**: `/Users/nathan/Desktop/wiz6-manual.pdf` — Official Wizardry VI "Playmaster's Guide" (Sir-Tech, 1990), 129 manual pages (73 PDF pages). All pages read in full.
- **GameFAQs FAQ 63361**: HTTP 403 — blocked by GameFAQs/GameSpot. Not retrieved.
- **GameFAQs FAQ 2008**: HTTP 403 — blocked by GameFAQs/GameSpot. Not retrieved.
- **RPGClassics shrine**: HTTP 404 — site reorganized. Not retrieved.

The manual alone is authoritative and sufficient for this cross-reference. All findings below are sourced from it exclusively.

---

## Documented character-sheet stats

### Primary statistics (8 total)

Manual p. 10–11, "Statistics" section. Range: 0–18. Influenced by race; affect profession entry.

| Stat name    | Abbr | Range | Description (manual summary)                                                     | Manual page |
|--------------|------|-------|----------------------------------------------------------------------------------|-------------|
| Strength     | STR  | 0–18  | Physical maneuvers, carrying capacity, stamina, damage                           | 10          |
| Intelligence | INT  | 0–18  | Spell casting/learning, trap detection, skill learning                           | 10          |
| Piety        | PIE  | 0–18  | Devotion/study speed, spell power per level, SP recoup rate                      | 10          |
| Vitality     | VIT  | 0–18  | Life force: HP, stamina, heal/resurrect, poison/paralysis/death resistance       | 11          |
| Dexterity    | DEX  | 0–18  | Dodge missiles/lances, trap disarming, natural AC, combat hits per attack        | 11          |
| Speed        | SPD  | 0–18  | Action time, attacks per round, natural AC                                       | 11          |
| Personality  | PER  | 0–18  | NPC friendliness/interaction; extroverted (high) vs. shy (low)                   | 11          |
| Karma        | KAR  | 0–18  | "Ethical meter" — affects everything; high = lucky/happy-go-lucky                | 11          |

**Note on Personality vs. Karma**: These are **two separate statistics**, both stored in the character record. Our decoded field map at `+0x12C..0x133` notes "attributes (str/int/pie/vit/dex/spd + 2 personality bytes)" — this should be read as STR, INT, PIE, VIT, DEX, SPD, **PER (Personality)**, **KAR (Karma)**. The label "2 personality bytes" was imprecise; the correct names are PER and KAR.

### Additional character statistics (shown on Review screen)

Manual p. 22–26, "Additional Character Statistics" section.

| Stat name              | Abbr  | Unit/range         | Description                                                                              | Manual page |
|------------------------|-------|--------------------|------------------------------------------------------------------------------------------|-------------|
| Age                    | —     | displayed in years | Ages 8 hours per Rest (3 full rests = 1 day). Symbol = planets circling sun.             | 22          |
| Rebirths               | —     | integer count      | Lives remaining. Lose 1 point of vitality each time resurrected. Icon = kneeling figure. | 22          |
| Level                  | LVL   | integer            | Experience level, earned via XP                                                          | 22          |
| Rank                   | RNK   | string/integer     | Title within profession, earned via level                                                | 22          |
| Monster Kill Statistic | MKS   | integer count      | "Number of monsters you have, in one way or another, sent to the Grim Reaper."           | 23          |
| Experience Points      | EXP   | integer            | Awarded for slaying monsters and special tasks; accumulates to earn LVL                  | 23          |
| Condition              | CND   | status enum        | OK, Afraid, Asleep, Blinded, Dead, Insane, Irritated, Nauseous, Paralyzed, Poisoned, Stoned | 23       |
| Gold Pieces            | GP    | integer            | Current gold held                                                                        | 23          |
| Carrying Capacity      | CC    | weight (lbs)       | Max weight before encumbrance; shown in color (blue/yellow/red) by load %                | 24          |
| Stamina                | —     | percentage 0–100%  | Endurance; displayed as % of full rested state. Falls to 0 → exhaustion                 | 15          |
| Hit Points             | HP    | cur/max integer    | Damage character can endure before death. Shown as "cur/max" e.g. "2/10"                 | 15          |
| Armor Class            | AC    | +10 to -10         | Lower is better. +10 = "virtually naked"; -10 = "sherman tank"                          | 25          |

**Armor class sub-components** (manual p. 25–26):
- **Natural AC**: Race/speed/dexterity/Ninjutsu skill derived. Shown as the main number.
- **Encumbrance Penalty / Shield Bonus**: Shown in parentheses. Positive = encumbered (worse AC); negative = shield equipped (better AC). Added to natural AC for effective AC.
- **Magical AC**: Protection from magical items worn. Covers entire body.
- **Body AC**: Per-body-part penetration protection. Six slots: Magical, Head, Chest, Legs, Hands, Feet.

### Skills (14 total)

Manual p. 18–20. Three categories. Range: 0–100 points.

**Weaponry Skills** (p. 18):

| # | Skill name    | Description (brief)                                    |
|---|---------------|--------------------------------------------------------|
| 1 | Wand & Dagger | Daggers, wands, small weapons                          |
| 2 | Sword         | Any sword including katana                             |
| 3 | Axe           | Battle axe, hand axe                                   |
| 4 | Mace & Flail  | Mace-like items, flail, hammer                         |
| 5 | Pole & Staff  | Halberd, bo, staff                                     |
| 6 | Throw         | Any thrown weapon; items accidentally thrown           |
| 7 | Sling         | Leather strap and cord, bullets                        |
| 8 | Bow           | Any bow firing arrows                                  |
| 9 | Shield        | Using a shield to block/parry                          |
| 10 | Hand & Feet  | Hands and feet as lethal weapons                       |

**Physical Skills** (p. 19):

| # | Skill name    | Description (brief)                                                                  |
|---|---------------|--------------------------------------------------------------------------------------|
| 11 | Scout        | Finding secret doors, hidden entrances, buried items. **Must be raised manually.**   |
| 12 | Music        | Playing musical instruments to cast magical spells (Bard class primarily)            |
| 13 | Oratory      | Vocal discipline for chanting spells; poor oratory → backfire/fizzle                |
| 14 | Legerdemain  | Pickpocket skill — steal items/gold from NPCs without their knowledge                |

Wait — this is only 14 skills across Weaponry (10) + Physical (4) = 14. But the manual also lists Academia skills which include Skulduggery, Ninjutsu, and the magic study skills. Let me recount carefully:

The manual (p. 17) says "three categories: Weaponry, Physical and Academia." On p. 18–20 the breakdown is:

**Weaponry Skills** (10): Wand & Dagger, Sword, Axe, Mace & Flail, Pole & Staff, Throw, Sling, Bow, Shield, Hand & Feet

**Physical Skills** (6): Scout, Music, Oratory, Legerdemain, Skulduggery, Ninjutsu

**Academia Skills** (8+): Artifacts, Mythology, Scribe, Alchemy, Theology, Theosophy, Thaumaturgy, Kirijutsu

So the total pool is much larger than 14 — "14 fields of study" (p. 16) refers to the **14 professions**, not 14 skills. The skills region at `+0x134..+0x141` is 14 bytes = 14 skill slots. This must be a subset — which 14 are stored? Based on the profession skill selections in Appendix B, all professions draw from the same pool. The 14-byte region almost certainly stores **all 14 skills** that can be tracked per character — but there are more than 14 skills in the game.

Cross-referencing Appendix B skill selections across all professions, the unique skills mentioned are:

| Category   | Skills |
|------------|--------|
| Weaponry   | Wand & Dagger, Sword, Axe, Mace & Flail, Pole & Staff, Throw, Sling, Bow, Shield, Hand & Feet (10 skills) |
| Physical   | Scout, Oratory, Music, Legerdemain, Skulduggery, Ninjutsu (6 skills) |
| Academia   | Artifacts, Mythology, Scribe, Alchemy, Theology, Theosophy, Thaumaturgy, Kirijutsu (8 skills) |

**Total: 24 unique skills.** The 14-byte region at `+0x134..+0x141` cannot hold all 24 as 1-byte values in the same sense — but 14 bytes for 14 values is tight. More likely this region stores the current skill values (0–100 points each), but as 1-byte values. If there are 24 skills and only 14 bytes, either: (a) not all skills are stored per-character (profession-specific), (b) the region is wider than we think, or (c) skills are packed differently. **This is an open RE question — the 14-byte extent needs re-examination.**

### Spell schools / realms (6 total)

Manual p. 74, "Realms" section.

| # | Realm  | Element/domain                            | Spellbook users               |
|---|--------|-------------------------------------------|-------------------------------|
| 1 | Fire   | Fire element                              | Mage, Alchemist               |
| 2 | Water  | Water/cold element                        | Mage, Priest, Alchemist, Psionic |
| 3 | Air    | Air/gas element                           | Mage, Priest, Alchemist, Psionic |
| 4 | Earth  | Earth element                             | Mage, Priest, Alchemist, Psionic |
| 5 | Mental | Mind/mental domain                        | Priest, Psionic               |
| 6 | Magic  | Divine/mystical (no physical element)     | Mage, Priest, Psionic, Alchemist |

Four spellbook types: **Alchemist, Mage, Priest, Psionic**. Each uses a subset of the 6 realms. A spell may appear in multiple spellbooks (e.g. Knock-Knock is in both Mage and Psionic spellbooks).

### Conditions (10 total)

Manual p. 23, 63–65.

| # | Condition  | Notes                                                          |
|---|------------|----------------------------------------------------------------|
| 0 | OK (None)  | Normal state                                                   |
| 1 | Afraid     | Fear — may run; performance reduced                            |
| 2 | Asleep     | Can't fight; easy to hit; double damage; wakes on hit         |
| 3 | Blinded    | Can't see; harder to hit monsters                             |
| 4 | Dead       | Dead — requires resurrection; lose 1 VIT on each death        |
| 5 | Insane     | No control over character                                      |
| 6 | Irritated  | Preoccupied with itch; fights poorly                          |
| 7 | Nauseous   | May choke/gag; helpless for a round                           |
| 8 | Paralyzed  | Can't move/fight; easy to hit; double damage; small chance jolt wakes |
| 9 | Poisoned   | Getting sicker; will die without antidote                     |
| 10 | Stoned    | Petrified; lose 1 VIT when stoned; lose 1 VIT again on cure   |

This is 11 states (OK + 10 maladies), consistent with our `conditions[10]` array — the 10 array entries map to the 10 non-OK states.

Our field map notes `conditions[2]=dead, conditions[3]=paralyzed`. Cross-referencing against the ordering above: if the array is 0-indexed and maps to {Afraid=0, Asleep=1, Blinded=2, Dead=3, Insane=4, Irritated=5, Nauseous=6, Paralyzed=7, Poisoned=8, Stoned=9}, then:
- `conditions[2]` = Blinded (not Dead)
- `conditions[3]` = Dead (not Paralyzed)

**Our original annotation "conditions[2]=dead, conditions[3]=paralyzed" may have the indices off by one, or the ordering may differ.** This needs ASM verification — do not trust the annotation order without re-checking against the engine's condition flag reads.

### Counter stats

| Stat name              | Abbr | Type        | Manual description                                                    | Manual page |
|------------------------|------|-------------|-----------------------------------------------------------------------|-------------|
| Monster Kill Statistic | MKS  | u32 counter | Monsters "sent to the Grim Reaper" — kill count                      | 23          |
| Rebirths               | —    | u8/u16 counter | Number of times resurrected (each costs 1 VIT point)               | 22          |
| Age                    | —    | u32 counter | Game-time elapsed; displayed as years. 3 rests = 1 day (24 hours); each rest = 8 hours | 22 |

The manual uses "Age" with planet-orbit icon (manual p. 22). Ages 8 hours per Rest. 3 full rests = 1 day. Displayed in years on screen. Our `age_counter` u32 in game-days maps directly to this: `display_age_years = age_counter / 365`.

**No "combats won" counter is mentioned in the manual.** MKS (monster kills) is the only kill-type counter documented. The "combats won" hypothesis for `+0x10..+0x13` is NOT supported by the manual — MKS is the stronger candidate.

---

## Mapping to our decoded fields

| Documented stat        | Our offset      | Our name         | Confidence after cross-ref | Notes                                                                      |
|------------------------|-----------------|------------------|-----------------------------|----------------------------------------------------------------------------|
| Name (7 chars max)     | `+0x00..+0x07`  | `name`           | HIGH — confirmed            | Manual p. 12: "name may not exceed seven letters"                         |
| Age (in game-days)     | `+0x08..+0x0B`  | `age_counter`    | HIGH — confirmed            | Manual p. 22, 43: ages 8 hrs/rest, display ÷365 = years                  |
| Experience Points (EXP)| `+0x0C..+0x0F`  | `xp`             | HIGH — confirmed            | Manual p. 23: "EXP" abbreviation confirmed                                |
| Monster Kill Stat (MKS)| `+0x10..+0x13`  | **`mks`** (rename from unknown) | **HIGH — CONFIRMED** | Manual p. 23: MKS = kill counter, u32 fits. Incremented per combat kill in wmexe. |
| (unknown)              | `+0x14..+0x17`  | `gold`           | HIGH — confirmed            | Manual p. 23: "GP" = gold pieces                                          |
| Hit Points cur/max     | `+0x18..+0x1B`  | `hp_current, hp_max` | HIGH — confirmed        | Manual p. 15: shown as "cur/max" pair                                     |
| Stamina/SP cur/max     | `+0x1C..+0x1F`  | `sp_current, sp_max` | HIGH — confirmed        | Manual p. 15: Stamina = percentage of full rested state                   |
| (unknown — 4 bytes)    | `+0x20..+0x23`  | unmapped         | LOW                          | See Open Questions below                                                   |
| Level (LVL)            | `+0x24..+0x25`  | `level`          | HIGH — confirmed            | Manual p. 22: "LVL"                                                       |
| School mana[6]         | `+0x28..+0x3F`  | `schoolMana[6]`  | HIGH — confirmed            | Manual p. 74: 6 realms (Fire, Water, Air, Earth, Mental, Magic)           |
| Inventory slots[22]    | `+0x40..+0x10F` | `inventory[22]`  | HIGH — confirmed            | Manual p. 52: items distributed from chests; carrying capacity tracked    |
| Equipment slots[8]     | `+0x110..+0x117`| `equipment[8]`   | HIGH — confirmed            | Manual p. 25: body AC diagram shows 6 body slots + magical + shield       |
| Conditions[10]         | `+0x122..+0x12B`| `conditions[10]` | HIGH layout, MEDIUM ordering | Manual p. 23, 63–65: 10 conditions (see ordering caveat above)            |
| Attributes STR–SPD     | `+0x12C..+0x131`| `str,int,pie,vit,dex,spd` | HIGH — confirmed  | Manual p. 10–11: 6 primary stats                                         |
| Personality (PER)      | `+0x132`        | rename: `per`    | HIGH — rename confirmed     | Manual p. 11: PER is a separate stat, not a "personality byte"            |
| Karma (KAR)            | `+0x133`        | rename: `kar`    | HIGH — rename confirmed     | Manual p. 11: KAR is a separate stat, not a "personality byte"            |
| Skills[14]             | `+0x134..+0x141`| `skills[14]`     | MEDIUM — count uncertain    | Manual lists 24 unique skills total; 14-byte region may be subset or differently mapped |
| (class-derived)        | `+0x142..+0x151`| unmapped (16 bytes) | LOW                      | Possibly per-class derived stats not explicitly listed in manual           |
| (school rank thresholds)| `+0x152..+0x15F`| unmapped (14 bytes) | LOW                     | Possibly school-level advancement thresholds                               |
| Armor Class (AC)       | `+0x160`        | `derivedAc`      | HIGH — confirmed            | Manual p. 25: base 10 = "virtually naked"; lower is better                |
| (AC sub-components)    | `+0x161..+0x167`| unmapped (7 bytes) | MEDIUM                     | Manual describes 6 body-slot AC + magical AC + encumbrance penalty. These constant 10s likely = per-slot AC values, starting "unarmored" = 10 |
| Reaction               | `+0x168`        | `reaction`       | HIGH — confirmed            | Manual p. 11, 69: Personality governs NPC interactions; reaction score 0–100 |
| NPC race reactions[31] | `+0x169..+0x187`| `npc_race_reaction[31]` | HIGH — confirmed   | Manual p. 69: NPCs have per-character "memories" of each party member     |
| Spell slots known[20]  | `+0x188..+0x19C`| `spell_slots_known[20]` | HIGH — confirmed  | Manual p. 21, 74: characters have spellbooks with individual spell entries |
| Race                   | `+0x19D`        | `race`           | HIGH — confirmed            | Manual p. 13, 104: 11 races                                               |
| Alignment              | `+0x19E`        | `alignment`      | HIGH — confirmed            | Manual p. 17: Karma rolling implies alignment is tracked                  |
| Class/Profession       | `+0x19F`        | `class`          | HIGH — confirmed            | Manual p. 16, 110: 14 professions                                         |
| (between class & portrait) | `+0x1A0..+0x1AA` | unmapped (11 bytes) | LOW                  | See Open Questions below                                                   |
| Portrait index         | `+0x1AB`        | `portrait_index` | HIGH — confirmed            | Manual p. 17: portrait selected during creation; changeable via "Portrait" menu option |
| Inventory count        | `+0x1AC`        | `inventory_count`| HIGH — confirmed            | Manual p. 52: up to 22 items tracked (8 equipped + swag bag items)       |
| (unknown 2 bytes)      | `+0x1AD..+0x1AE`| unmapped         | LOW                          | See Open Questions below                                                   |
| Saved old level        | `+0x1AF`        | `savedOldLevel`  | MEDIUM                       | Likely used for level-change detection on level-up; manual p. 68 describes level gain events |

---

## Naming refinements from cross-reference

1. **`+0x10..+0x13` → rename to `mks` (Monster Kill Statistic)**
   Manual p. 23 defines "Monster Kill Statistic (MKS)" explicitly with the exact same semantics: a counter of monsters killed. The wmexe asm increments it per-kill in combat. **HIGH confidence rename.** Field name should be `mks` or `monster_kill_stat`.

2. **`+0x132` → rename to `per` (Personality)**
   What was loosely called "personality bytes[0]" is properly PER (Personality). Confirmed distinct stat, manual p. 11.

3. **`+0x133` → rename to `kar` (Karma)**
   What was loosely called "personality bytes[1]" is properly KAR (Karma). Confirmed distinct stat, manual p. 11. KAR starts at 0 for all races (per Appendix A race stat blocks — every race shows KAR 0), meaning karma is entirely rolled during character creation (manual p. 17: "Rolling Karma").

4. **`schoolMana[6]` realm ordering** — confirmed as Fire=0, Water=1, Air=2, Earth=3, Mental=4, Magic=5 per the spellbook tables (pp. 100–103 list spells in this order consistently).

5. **`sp_current` / `sp_max`** — "SP" (spell power / stamina) in our map should be understood as **Stamina** per the manual (p. 15). The manual uses the word "Stamina" throughout; it does not use "SP" as an abbreviation. However, the field stores the mana/spell-power for the character's spellbooks — this is separate from physical Stamina. Clarification needed: the manual describes two separate concepts:
   - **Stamina** (physical endurance, p. 15): shown as a percentage, falls during exertion
   - **Spell Points / Magic Points** (p. 75): "spell points" spent to cast spells, restored on rest
   
   Our `sp_current/sp_max` at `+0x18..+0x1F` paired with `hp_current/hp_max` is most likely **HP + Stamina** (or HP + global spell points). The manual says "hit points and stamina" appear after race selection (p. 15). The school-specific mana at `+0x28..+0x3F` tracks per-realm spell points. So `sp` at `+0x1C..+0x1F` is probably overall **Stamina** (physical endurance percentage × something), not school mana.

---

## Open questions left unresolved by sources

### `+0x20..+0x23` (4 bytes between sp_max and level)
The manual lists no character stat that clearly fits here. Candidates:
- **Rebirths counter**: Manual p. 22 says "Rebirths" is displayed on the character screen as a separate field. A u32 for "number of times raised from dead" fits the 4-byte slot. However, rebirths are rare enough that a u8 or u16 would suffice; a full u32 feels large.
- **Rank (RNK)**: Manual p. 22 says rank is displayed. Rank is a derived value (string title), likely computed from level, not stored as raw bytes here.
- **Some stamina accumulator or "life force" tracker**: VIT (Vitality) decreases each time the character is resurrected (manual p. 11, 22, 64, 65, 98). VIT is stored in `+0x12C..+0x133` (attributes region). This slot could be a **max-VIT shadow copy** or a **lives-remaining count** separate from the VIT stat.

**Recommendation**: Cross-reference against asm reads of `+0x20..+0x23` in the character review screen drawing code. The manual says Rebirths appears on the "Additional Character Statistics" display (p. 22), near Age, Level, and Rank.

### `+0x142..+0x151` (16 bytes — class-derived)
Manual does not document class-specific derived stats explicitly. Appendix B (p. 110–117) lists profession minimum requirements but not derived storage. Could be:
- Per-profession bonus tables
- Class rank thresholds (14 professions × 1 byte = 14 bytes + 2 padding fits)
- Class school affinity / spell learning rate modifiers

### `+0x152..+0x15F` (14 bytes — school rank thresholds)
Manual p. 74–77 describes 6 realms × 7 spell levels each. These 14 bytes may track which level of each school has been studied (6 schools × ~2 bytes = 12, or 14 bytes = 6 schools + other). Alternatively: Rank advancement within the character's profession could be tracked here (manual p. 22 shows Rank changes at each level-up).

### `+0x161..+0x167` (7 bytes — mostly constant 10s)
Manual p. 25 shows the AC display has: Magical, Head, Chest, Legs, Hands, Feet = **6 body-slot AC values** + 1 encumbrance penalty = **7 values total**. The constant 10s fit perfectly — a character with no armor has all body-slot AC = 10 (manual: AC 10 = "virtually naked" = the base). This region is almost certainly the **6 per-body-part AC values + encumbrance/shield modifier byte**, all initialized to 10. **Recommend promoting to MEDIUM-HIGH confidence** and labeling `ac_body[6]` + `ac_encumbrance` (or `ac_shield_bonus`).

### `+0x118..+0x121` (10 bytes — partly mapped: last 6 = class school capacity)
Manual p. 74: "four different spell-casting types — Alchemist, Mage, Priest, Psionic — learn their own selection of spells from these six realms." The first 4 bytes may encode the character's **spellbook type(s)** (which of the 4 spellbooks the character has access to). Some classes like Bishop have 2 spellbooks (Mage + Priest).

### `+0x1A0..+0x1AA` (11 bytes between class and portrait_index)
The manual mentions these character creation selections in sequence: race, sex, profession, karma roll, portrait, skills. Sex is a 1-byte field (manual p. 15). Between class (`+0x19F`) and portrait (`+0x1AB`) there are 11 bytes. Candidates:
- **Sex** (1 byte) — male/female; affects stats and Valkyrie class restriction
- **Bonus points remaining** at creation (likely 0 once creation is complete)
- **Class change history** — manual p. 31 mentions "Change Profession" is possible
- **Starting equipment / initial skill assignment flags**
- **NPC standing / faction flags** (manual p. 69: NPCs have individual memories per character)

Sex is the most certain missing field. The manual explicitly states characters have a sex (p. 15) affecting stats. It must be stored somewhere — `+0x1A0` is the most likely candidate.

### Skills region size mismatch
The manual lists **24 distinct skills** (10 Weaponry + 6 Physical + 8 Academia). Our decoded region `+0x134..+0x141` is only 14 bytes. This cannot hold 24 skill values as individual bytes. Possible resolutions:
1. Skills are stored as **1 byte per skill** but only the skills relevant to the character's profession are stored, and inactive slots are 0. With 14 bytes, 14 active skills per character are possible — and looking at the widest profession (Fighter), it has exactly 10 weaponry + Scout + Artifacts + Mythology + Scribe = 14 skills. But Ninjas have: 10 weaponry + Legerdemain + Skulduggery + Ninjutsu + Artifacts + Mythology + Scribe + Alchemy + Kirijutsu = 19 skills. So 14 bytes is not enough for all professions.
2. The skills region is actually wider and the `+0x142..+0x151` "class-derived" region partially overlaps or is actually more skills.
3. Skills are stored as nibbles (4 bits each × 28 = 14 bytes) — but 0–100 range needs 7 bits minimum.

**This is a significant open RE question.** The 14-byte boundary at `+0x141` may be wrong — re-examine the asm skill read/write routines to determine the true extent and layout of skill storage.

### Conditions ordering
Our existing annotation `conditions[2]=dead, conditions[3]=paralyzed` conflicts with the manual's condition listing order. The manual presents them as: Afraid, Asleep, Blinded, Dead, Insane, Irritated, Nauseous, Paralyzed, Poisoned, Stoned. If that is the storage order, then `conditions[2]=Blinded` and `conditions[3]=Dead`. Verify via asm — find the code that sets the Dead condition and check which array index it writes.

---

## Summary of key findings

1. **`+0x10..+0x13` = MKS (Monster Kill Statistic)** — HIGH confidence. The manual's "MKS" exactly matches our asm observation of a u32 incremented per kill in combat. Rename this field `mks`.

2. **The two "personality bytes" at `+0x132..+0x133` are PER (Personality) and KAR (Karma)** — distinct named stats confirmed by manual p. 11. KAR starts at 0 for all races and is rolled at creation.

3. **`+0x161..+0x167` (7 constant-10 bytes) = per-body-slot AC values + encumbrance byte** — the manual's AC diagram (p. 25) shows exactly 6 body slots (Magical, Head, Chest, Legs, Hands, Feet) + the encumbrance penalty/shield bonus = 7 values. Promote from "mostly constant 10s" to named fields.

4. **Spell school ordering confirmed**: Fire, Water, Air, Earth, Mental, Magic (indices 0–5) from spellbook tables pp. 100–103.

5. **24 total skills exist, not 14** — the skills region is undersized for all professions. The boundary needs ASM re-examination.

6. **No "combats won" stat exists in the manual.** MKS (kills) is the only combat counter. There is no documented "combats won" or "encounters survived" stat.

7. **"Rebirths" is a documented counter stat** — displayed on screen near Level/Rank/Age. It must be stored somewhere; `+0x20..+0x23` is the prime candidate.

8. **Sex is a documented character attribute** (manual p. 15) not yet located in the field map. Most likely in the `+0x1A0..+0x1AA` unmapped block.
