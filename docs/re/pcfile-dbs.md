# pcfile.dbs — On-Disk Character Record Format

Source: `docs/re/findings/pcfile-dbs.json` (2026-05-25 RE pass).

## File layout

```
offset      content
0x0000      24-byte file header
0x0018      record[0]  (432 bytes = 0x1b0)
0x01c8      record[1]
...
0x0018 + N*0x1b0  record[N]
```

Total size for 16 slots: 24 + 16 × 432 = **6936 bytes**.

### File header (24 bytes)

| Offset | Field          | Type    | Value (stock file) | Notes                                                                 |
| ------ | -------------- | ------- | ------------------ | --------------------------------------------------------------------- |
| +0x00  | record_size    | u16 LE  | 0x01B0 (432)       | Per-character record size; matches BSS slot stride                    |
| +0x02  | slot_count     | u16 LE  | 0x0010 (16)        | Total slots in file                                                   |
| +0x04  | header_size    | u32 LE  | 0x00000018 (24)    | Byte offset to first record                                           |
| +0x08  | slot_status[16]| u8[16]  | 01 01 01 01 01 01 00×10 | 0=empty, 1=available, 2=in-party. Stock: first 6 populated. |

### Load path (how records reach memory)

On startup, `wbase.ovr`'s `add_party_member` handler (file 0x253a) calls `read_char_from_pcfile` (file 0x0036) which does:

1. Opens PCFILE.DBS
2. Seeks to `header_size + char_index × record_size`
3. Reads exactly `record_size` (432) bytes into a stack buffer
4. Returns

Then `add_party_member` does:

```asm
25b5: mov cx, 0xd8          ; 216 words = 432 bytes
25b8: rep movsw             ; memcpy stack-buf → BSS[slot]
```

**Conclusion: The on-disk record IS the in-memory record.** There is no field-by-field translation on load. The BSS character slot at `0x43e8 + N × 0x1b0` holds an exact copy of the on-disk record.

---

## Record layout (432 bytes)

### Discrepancy with wpcvw-naming-pass.json

**Important:** The `wpcvw-naming-pass.json` `bss_layout` section has several **wrong offsets** for early fields, caused by its claim that `name = char[12]` (actual: `char[8]`). The bss_layout's attributes (+0x12c), skills (+0x134), conditions (+0x122), inventory (+0x40), and inventory_count (+0x1ac) are correct. Only the early fields (name, xp, level, HP) are wrong in that document.

### Field map

| Offset    | Field             | Type       | Confidence | Notes                                                                                                                                         |
| --------- | ----------------- | ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| +0x00     | name              | char[8]    | HIGH       | ASCIIZ, 7 chars max + null. **NOT** 12 bytes.                                                                                                 |
| +0x08     | xp                | u32 LE     | HIGH       | Experience points. **NOT** at +0x0c as bss_layout claimed.                                                                                    |
| +0x0c     | *unknown*         | u8[12]     | LOW        | All 0 in stock data. Possibly gold u32 + padding, or reserved.                                                                                |
| +0x18     | level             | u16 LE     | HIGH       | Current level (1-based). **NOT** at +0x24 as bss_layout claimed.                                                                              |
| +0x1a     | level_secondary   | u16 LE     | MEDIUM     | Equals `level` in stock data. Possibly `max_level` or `saved_class_change_level`.                                                             |
| +0x1c     | hp_cur            | u16 LE     | HIGH       | Current HP. **NOT** at +0x18 as bss_layout claimed.                                                                                           |
| +0x1e     | hp_max            | u16 LE     | HIGH       | Maximum HP. Equals `hp_cur` in stock (fully healed).                                                                                          |
| +0x20     | sp_cur            | u16 LE     | MEDIUM     | Spirit points (mana), combined pool. Values 128–295.                                                                                          |
| +0x22     | gold              | u16 LE     | MEDIUM     | Gold pieces. Values 1035–2700 in stock data. May be low word of u32.                                                                          |
| +0x24     | *unknown*         | u8[4]      | LOW        | Constant `01 00 01 00` for all stock chars.                                                                                                    |
| +0x28     | per_school_sp[6]  | {u16,u16}[6]| LOW       | Per-school SP (cur, max) pairs? Mostly 0 for fighters. NOBAL: school[4]=(5,5), school[5]=(4,4). Ninjas: two schools with 3.                   |
| +0x40     | inventory[22]     | item_record[22] | MEDIUM | 8 bytes/item: {item_id u16, u16, u8, u8, u8, u8}. 5 items each for stock chars.                                                              |
| +0x110    | equip_slots[8]    | u8[8]      | MEDIUM     | Inventory-index of equipped item in each slot. 0xFF=empty. All 0xFF in stock.                                                                 |
| +0x118    | *unknown*         | u8[10]     | LOW        | Near the conditions region. Contains small values.                                                                                             |
| +0x122    | conditions[10]    | u8[10]     | MEDIUM     | Active status conditions per wpcvw bss_layout.                                                                                                 |
| +0x12c    | STR               | u8         | HIGH       | Strength (0–18).                                                                                                                               |
| +0x12d    | INT               | u8         | HIGH       | Intelligence.                                                                                                                                  |
| +0x12e    | PIE               | u8         | HIGH       | Piety.                                                                                                                                         |
| +0x12f    | VIT               | u8         | HIGH       | Vitality.                                                                                                                                      |
| +0x130    | DEX               | u8         | HIGH       | Dexterity/Luck (used in AC formula).                                                                                                           |
| +0x131    | SPD               | u8         | HIGH       | Speed (also used in AC formula).                                                                                                               |
| +0x134    | skills[14]        | u8[14]     | MEDIUM     | Per-skill levels (0..100). From wpcvw bss_layout.                                                                                              |
| +0x142    | *TBD*             | u8[90]     | LOW        | Spell bitmaps, school data, and other per-character flags. Not decoded in this pass.                                                           |
| +0x19c    | *unknown*         | u8[8]      | LOW        | Race/class/sex region. wpcvw bss_layout may be off by 1–3 bytes here. Best guess: race at +0x19f (values 0,0,3,2,1,1 = plausible race indices). |
| +0x1a0    | sex(?)            | u8         | LOW        | wpcvw bss_layout claims sex at abs 0x4589 = +0x1a0. All 0 in stock data; may be 0=male or wrong offset.                                       |
| +0x1ab    | magic_power_hi    | u8         | LOW        | From wpcvw bss_layout. Values [10,8,13,10,9,7] in stock.                                                                                      |
| +0x1ac    | inventory_count   | u8         | HIGH       | Number of items in inventory (0..22). Value 5 matches actual non-zero item count.                                                              |
| +0x1ad    | equip_count(?)    | u8         | LOW        | From wpcvw bss_layout.                                                                                                                         |
| +0x1ae    | ac_extra(?)       | u8         | LOW        | From wpcvw bss_layout.                                                                                                                         |
| +0x1af    | saved_old_level   | u8         | LOW        | From wpcvw bss_layout (the class-change throttle value).                                                                                       |

---

## Stock character data (6 populated slots)

Names, XP, level, HP for the pre-built characters in the stock file:

| Slot | Name    | XP   | Level | HP  | STR | INT | PIE | VIT | DEX | SPD | Gold (est.) |
| ---- | ------- | ---- | ----- | --- | --- | --- | --- | --- | --- | --- | ----------- |
| 0    | THESUS  | 6590 | 8     | 126 | 18  | 8   | 8   | 12  | 10  | 9   | 2700        |
| 1    | TEMPEST | 7405 | 9     | 123 | 13  | 10  | 6   | 14  | 7   | 7   | 1800        |
| 2    | LYSANDR | 7265 | 5     | 87  | 7   | 10  | 7   | 11  | 14  | 12  | 1125        |
| 3    | NOBAL   | 7057 | 4     | 75  | 7   | 10  | 13  | 9   | 9   | 9   | 1035        |
| 4    | TREON   | 6603 | 4     | 102 | 10  | 12  | 6   | 12  | 10  | 8   | 1440        |
| 5    | PENTAG  | 6698 | 2     | 90  | 10  | 12  | 13  | 10  | 8   | 6   | 1350        |

THESUS hex dump (first 0x40 bytes of record):

```
offset  00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f
+0x00:  54 48 45 53 55 53 00 00 be 19 00 00 00 00 00 00  THESUS..........
+0x10:  00 00 00 00 00 00 00 00 08 00 08 00 7e 00 7e 00  ............~.~.
+0x20:  27 01 8c 0a 01 00 01 00 00 00 00 00 00 00 00 00  '...............
+0x30:  00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00  ................
```

- `+0x00..+0x07`: `THESUS\0\0` (name, 8 bytes)
- `+0x08..+0x0b`: `0x000019be` = 6590 (XP)
- `+0x0c..+0x17`: all zero (unknown / reserved)
- `+0x18..+0x19`: `0x0008` = 8 (level)
- `+0x1a..+0x1b`: `0x0008` = 8 (level_secondary = level)
- `+0x1c..+0x1d`: `0x007e` = 126 (hp_cur)
- `+0x1e..+0x1f`: `0x007e` = 126 (hp_max)
- `+0x20..+0x21`: `0x0127` = 295 (sp_cur?)
- `+0x22..+0x23`: `0x0a8c` = 2700 (gold?)
- `+0x24..+0x27`: `01 00 01 00` (constant, unknown)

---

## Decoder guidance

For the purposes of a working decoder, the following fields have sufficient confidence to decode immediately:

| Field         | Offset  | Type   | Confidence |
| ------------- | ------- | ------ | ---------- |
| `name`        | +0x00   | char[8]| HIGH       |
| `xp`          | +0x08   | u32 LE | HIGH       |
| `level`       | +0x18   | u16 LE | HIGH       |
| `hpCurrent`   | +0x1c   | u16 LE | HIGH       |
| `hpMax`       | +0x1e   | u16 LE | HIGH       |
| `str/int/pie/vit/dex/spd` | +0x12c | u8[6] | HIGH |
| `inventoryCount` | +0x1ac | u8  | HIGH       |

Fields for a richer decode (decoder can expose these but call them "tentative"):

| Field   | Offset  | Type   | Confidence |
| ------- | ------- | ------ | ---------- |
| `spCurrent` | +0x20 | u16 LE | MEDIUM |
| `gold`  | +0x22   | u16 LE | MEDIUM     |
| `skills[14]` | +0x134 | u8[14] | MEDIUM |

The remaining ~320 bytes (`raw[]`) should be preserved verbatim in the decoder output for later refinement.

---

## Open questions for follow-up

1. **Race / class bytes**: exact offsets in the +0x19c..+0x1a3 region unconfirmed. DOSBox live-read with a known character (e.g., load THESUS who is known class=Lord) would nail this.
2. **gold field width**: +0x22 as u16 is medium confidence. Need to verify whether gold > 65535 is possible (requires u32) or whether stock chars fit in u16 and that's definitive.
3. **+0x0c..+0x17 zero region**: could these be per-level counters, turn counters, or just padding? Only visible with a character that has those fields set.
4. **+0x1a = level_secondary**: does this diverge from `level` after a class change? Needs a save-file with a multi-classed character.
5. **sex field**: all stock chars have 0 at the wpcvw-claimed sex location (+0x1a0). Either 0=male in Wiz6 or the offset is wrong.

## See also

- `docs/re/findings/pcfile-dbs.json` — structured evidence with per-finding confidence
- `docs/re/wpcvw-character-view.md` — in-memory layout (partially correct; offsets for name/xp/level/HP are wrong)
- `docs/re/findings/wpcvw-naming-pass.json` → `bss_layout` — source of the wrong offsets; attributes/skills/conditions entries are valid
- `packages/data/src/structs/character-record.ts` — needs update per these findings (see separate fix commit)
