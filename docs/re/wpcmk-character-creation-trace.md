# wpcmk.ovr — Character Creation ASM Trace

Full state-by-state walk of the character creation flow in `wpcmk.ovr`. Every claim includes a file offset and actual byte pattern. Evidence is in `docs/re/findings/wpcmk-state-machine-trace.json`.

**Binary stats:** 24793 bytes (0x60d9), 16-byte overlay header, entry point at file 0x10.

---

## Overlay structure

**Entry point (file 0x10):**
```
59              pop cx           ; discard return address
c7 06 3a 36 04 00  mov word [0x363a], 4  ; set game state = 4 (wbase main menu)
b8 00 00        mov ax, 0
c3              ret
```

wpcmk is a **library overlay**. Its dispatch is a no-op stub that immediately returns to wbase state 4. The creation UI is invoked as cross-overlay subroutine calls from wbase slot 5 ("Make a character"). There is no state machine inside wpcmk.

**No file I/O in wpcmk:** Zero `CD 21` (INT 21h) opcodes in the entire 24793-byte file. All I/O goes through wroot thunks. The only filenames in the binary are:
- `PCFILE.DBS` at 0x5ca9 and 0x60b9 (roster file)
- `WPORT1.EGA` at 0x608d, `WPORT1.CGA` at 0x6098, `WPORT1.T16` at 0x60ae (portrait templates)

**No newgame.dbs reads:** The strings "newgame", "scenario", "MASTER", "DISK" do not appear anywhere in wpcmk.ovr. Race base stat data comes from wroot DGROUP BSS (populated by winit state-0 at startup), not from any file accessed by wpcmk.

---

## Creation master flow (`wpcmk_create_character_master` at file 0x4e47)

This is the top-level orchestrator called from wbase. It runs the complete creation flow synchronously, then returns.

### Step 1 — Clear character record buffer (0x4e4c)

```
b8 00 00 50     push 0 (value)
b8 b0 01 50     push 0x1b0 (size = 432 bytes)
b8 70 54 50     push 0x5470 (buffer address)
call 0xf34c     ; memset thunk
```

Clears DGROUP `0x5470..0x561f` (the 432-byte new-character record buffer) to zero.

### Step 2 — Load existing slot data (0x4e5f)

```
ff 76 04        push [bp+4]  ; slot number from caller
b8 70 54 50     push 0x5470
call 0xf3aa     ; roster_read_slot thunk
```

Copies any existing slot data into the buffer. For an empty slot this is a no-op (data is already zero).

### Step 3 — Init creation UI windows (0x4e6c → 0x0d13)

```
e8 a4 be        call 0x0d13  ; creation_ui_init
```

Function 0x0d13 loops 3 times calling `ui_window_create` thunk (via `[0x546e]` window handle) to set up the character creation display panels.

### Step 4 — Initial char sheet redraw (0x4e6f → 0x0df7)

```
e8 85 bf        call 0x0df7  ; char_sheet_redraw
```

First full-screen redraw of the (empty) character sheet.

### Step 5 — Initialize bonus points sentinel (0x4e72)

```
c7 06 ac 56 ff ff   mov word [0x56ac], 0xffff
```

Sets `*0x56ac` (bonus_points_remaining) to -1 as an "unrolled" sentinel.

### Step 6 — Render stat panel (0x4e78 → 0x2b04)

```
e8 89 dc        call 0x2b04  ; stat_panel_render
```

Renders the attribute panel. At this point all stats are zero/default.

### Step 7 — Race picker (0x4e7b → 0x308d)

```
e8 0f e2        call 0x308d  ; race_picker_menu
```

Interactive race selection. After selection:
- `*0x560d` = chosen race index (0=Human..10=Mook)
- `*0x559c..0x55a3` (base_stats[8]) are bumped to racial minimums via `stats_bump_to_racial_minimums` at 0x2c7b

**Race index → name** (confirmed from pcfile.dbs stock characters):

| Index | Race      | DGROUP BSS | Confirmed by                    |
| ----- | --------- | ---------- | ------------------------------- |
| 0     | Human     | 0x52d9     | THESUS (slot 0)                 |
| 1     | Elf       | 0x52e2     | NOBAL (slot 3)                  |
| 2     | Dwarf     | 0x52eb     | (inferred by position)          |
| 3     | Gnome     | 0x52f4     | PENTAG (slot 5)                 |
| 4     | Hobbit    | 0x52fd     | (inferred)                      |
| 5     | Faerie    | 0x5306     | (wpcvw: "Race=5(Faerie): AC-2") |
| 6     | Lizardman | 0x530f     | (inferred)                      |
| 7     | Dracon    | 0x5318     | TREON (slot 4)                  |
| 8     | Felpurr   | 0x5321     | LYSANDR (slot 2)                |
| 9     | Rawulf    | 0x532a     | (inferred)                      |
| 10    | Mook      | 0x5333     | TEMPEST (slot 1)                |

Race stat floor tables are in wroot DGROUP BSS (not in wpcmk.ovr). They are zero-filled at file load and populated by winit state-0. File offset 0x52d9 in DGROUP = file position 0x15259, which is past wroot.exe end (0x1063e) — confirmed BSS.

**`stats_bump_to_racial_minimums` at file 0x2c7b:**
```
; si = 0..7 (8 attributes)
mov al, [si+0x559c]    ; current stat
push ax
mov bx, [bp+4]         ; race table DGROUP ptr
mov al, [bx+si]        ; raw race minimum byte (A-encoded)
cbw
add ax, 0xffbf         ; subtract 65 — decoded threshold
                       ; bytes: 05 bf ff
mov cx, ax             ; cx = threshold
pop ax                 ; ax = current stat
cmp ax, cx
jnl skip               ; if current >= threshold, no bump
mov al, [bx+si]
add al, 0xbf           ; subtract 65 again (byte version)
mov [si+0x559c], al    ; write bumped stat
inc si
cmp si, 8
jl loop
```

This is a floor operation: stats below the racial minimum are raised to it; they are never lowered.

### Step 8 — Class picker (0x4e7e → 0x31a6)

```
e8 25 e3        call 0x31a6  ; class_picker_menu
```

Interactive class selection. Qualification is checked against `*0x56ae` (class qualification flags set by `class_check_qualification_and_bump` at 0x2cae). The class check uses the same subtract-65 formula.

### Step 9 — Bonus point roller (0x4e81)

The famous re-roll loop. Full byte sequence:

```
b8 06 00 50     ; push 6
e8 f6 75        ; call rng_thunk  (rng(6) -> ax in 0..5)
59              ; pop cx
05 05 00        ; add ax, 5       (ax = 5..10)
a3 ac 56        ; mov [0x56ac], ax

b8 14 00 50     ; push 20
e8 e8 75        ; call rng_thunk  (rng(20) -> ax in 0..19)
59              ; pop cx
85 c0           ; test ax, ax
75 05           ; jnz skip1
83 06 ac 56 08  ; add word [0x56ac], 8

b8 14 00 50     ; push 20
e8 d7 75        ; call rng_thunk  (second independent 1/20 check)
59              ; pop cx
85 c0           ; test ax, ax
75 05           ; jnz skip2
83 06 ac 56 08  ; add word [0x56ac], 8

83 3e ce 56 01  ; cmp word [0x56ce], 1  ; debug cheat check
75 06           ; jnz no_cheat
c7 06 ac 56 15 00  ; mov word [0x56ac], 21  ; force bonus = 21
```

**Formula:** `bonus = 5 + rng(6)` (uniform 5..10), plus two independent `1/20` chances for +8 each.

**Distribution:**

| Outcome          | Range  | Probability              |
| ---------------- | ------ | ------------------------ |
| No bonus         | 5..10  | (19/20)² = 90.25%        |
| One +8           | 13..18 | 2·(1/20)·(19/20) = 9.50% |
| Two +8 (jackpot) | 21..26 | (1/20)² = 0.25%          |

Values **11, 12, 19, 20 are unreachable** due to +8 quantization.

**P(bonus ≥ 19) = 0.25%** → ~400 re-rolls expected to qualify for elite classes (Samurai/Lord/Ninja/Bishop which need 19+ to meet their high stat prerequisites).

**Debug override:** `*0x56ce == 1` → bonus forced to 21. The write site for `*0x56ce` is not in wpcmk.

### Step 10 — Re-render stat panel (0x4ebe)

```
e8 43 dc        call 0x2b04  ; stat_panel_render (second call)
```

Now shows racial minimums + current bonus total.

### Step 11 — Attribute roll animation (0x4ec1 → 0x32e1)

```
e8 1d e4        call 0x32e1  ; attribute_roll_display
```

Animated dice-roll display for initial attributes.

### Step 12 — Bonus allocator UI (0x4ec4 → 0x3405)

```
e8 3e e5        call 0x3405  ; bonus_allocator_ui
```

Player distributes bonus points across attributes. Controls: LEFT/RIGHT = +/- 1 point on selected attribute, UP/DOWN = change selected attribute, key 5 = confirm. Each attribute caps at 18. Confirm is gated on `*0x56ac == 0` (pool exhausted).

Writes into `*0x559c..0x55a3` (base_stats) and decrements `*0x56ac`.

### Step 13 — Personality reroll loop (0x4eca → 0x3837)

```
e8 6a e9        call 0x3837  ; personality_reroll_loop
```

Dice-animation idle loop that keeps rolling into `*0x55a3` (the last attribute, personality/karma). Player clicks or presses RETURN to accept.

### Step 14 — Alignment picker (0x4ecd → 0x392e)

```
e8 5e ea        call 0x392e  ; alignment_picker
```

Alignment selection menu. Alignment byte location in the character record not confirmed in this trace (expected near race/class at record +0x19d area).

### Step 15 — Reset name-entry flag (0x4ed0)

```
c6 06 0c 56 00  mov byte [0x560c], 0
```

### Step 16 — Name entry (0x4ed5 → 0x4bad)

```
e8 d5 fc        call 0x4bad  ; name_entry
```

Text editor for character name.

### Step 17 — Portrait picker (0x4ed8 → 0x3c49)

```
e8 6e ed        call 0x3c49  ; portrait_picker
```

Portrait selection loop. Templates: `WPORT1.EGA` (0x608d), `WPORT1.CGA` (0x6098), `WPORT1.T16` (0x60ae).

### Step 18 — Final char sheet redraw (0x4edb)

```
e8 19 bf        call 0x0df7  ; char_sheet_redraw
```

### Step 19 — Spell school init (0x4ede, conditional)

```
80 3e 18 56 00  cmp byte [0x5618], 0
76 08           jna skip
ff 36 ca 56     push [0x56ca]
e8 fd cb        call 0x1ae9  ; spell_school_init (14 schools)
```

Only runs if `*0x5618` != 0 (character has spell-casting ability). Inits 14 spell schools per-class allocation at file 0x3e51.

### Step 20 — Skill training loop (0x4eef)

```
; loop [bp-2] = 0..3 (4 pillars: MAGIC/FAITH/PHYSICAL/MENTAL)
cmp byte [si+0x5588], 0   ; pillar has trainable skills?
jbe next_pillar
push si                   ; pillar index
push word [0x56ca]        ; char record ptr
push word [0x546e]        ; window handle
call 0x28d4               ; skill_train (4-pillar → 82-entry skill table mapper)
```

Maps the 4 training pillars to the 82-entry shared wroot DGROUP skill table at runtime `0x00de`.

### Steps 21–23 — Save to roster

```
; Step 21: write char record to PCFILE.DBS
b8 01 00 50     push 1
ff 76 06        push [bp+6]    ; slot number
b8 70 54 50     push 0x5470   ; char record buffer
call 0x001b                   ; roster_write_slot

; Step 22: mark slot occupied
mov bx, [bp+6]               ; slot index
c6 87 d8 4f 01  mov byte [bx+0x4fd8], 1

; Step 23: flush roster
call 0xf0dc                   ; roster_save_all
```

---

## Class requirement table (file 0x5e98)

14 entries × 9 bytes. Null-terminated 8-char ASCII. Encoding: `byte - 65` = minimum attribute value. Verified by `stats_bump_to_racial_minimums` at 0x2c7b (same `add ax, 0xffbf` = subtract 65).

| Class          | Raw hex              | STR | INT | PIE | VIT | DEX | SPD | PER | KAR |
| -------------- | -------------------- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fighter (0)    | `4d4141414141414100` | 12  | —   | —   | —   | —   | —   | —   | —   |
| Mage (1)       | `414d41414141414100` | —   | 12  | —   | —   | —   | —   | —   | —   |
| Priest (2)     | `41414d414141494100` | —   | —   | 12  | —   | —   | —   | 8   | —   |
| Thief (3)      | `414141414d49414100` | —   | —   | —   | —   | 12  | 8   | —   | —   |
| Bishop (4)     | `4b49494c4b49494100` | 10  | 8   | 8   | 11  | 10  | 8   | 8   | —   |
| Samurai (5)    | `414e41414e41414100` | —   | 13  | —   | —   | 13  | —   | —   | —   |
| Lord (6)       | `414b41414d494d4100` | —   | 10  | —   | —   | 12  | 8   | 12  | —   |
| Ninja (7)      | `4b4f414f41414b4100` | 10  | 14  | —   | 14  | —   | —   | 10  | —   |
| Valkyrie (8)   | `4b414c4c4b4c494100` | 10  | —   | 11  | 11  | 10  | 11  | 8   | —   |
| Ranger (9)     | `415050414141494100` | —   | 15  | 15  | —   | —   | —   | 8   | —   |
| Bard (10)      | `4d4a4d4d4a4a4f4100` | 12  | 9   | 12  | 12  | 9   | 9   | 14  | —   |
| Psionic (11)   | `4d4c414a4d4f494100` | 12  | 11  | —   | 9   | 12  | 14  | 8   | —   |
| Monk (12)      | `4e494e414b4e494100` | 13  | 8   | 13  | —   | 10  | 13  | 8   | —   |
| Alchemist (13) | `4d4b4b4d4d4d414100` | 12  | 10  | 10  | 12  | 12  | 12  | —   | —   |

(`—` = requirement is 0, trivially met)

**Cross-validated against stock characters:**
- NOBAL (Priest, class 2): attrs [7,10,13,9,9,9,8,4] → PIE=13≥12 ✓, PER=8≥8 ✓
- PENTAG (Mage, class 1): attrs [10,12,13,10,8,6,6,9] → INT=12≥12 ✓

---

## Skill availability bitmaps (file 0x5cb8)

14 class groups at 0x5cb8–0x5e93. Each class has 4 null-terminated ASCII digit strings encoding 30 trainable-skill bits (bit[i]='1' means class can train skill i). End offset confirmed 0x5e94 by parsing.

**Cross-validated:** NOBAL (Priest class 2) has bitmap[2][4]=1 and bitmap[2][8]=1; stock skills=[0,0,0,0,**2**,0,0,0,**2**,0,...] — match. PENTAG (Mage class 1) has bitmap[1][0]=1; stock skills=[**5**,0,...] — match.

Skill index names (0..29) not yet decoded. Requires 4-pillar skill_train table decode at wpcmk 0x28d4.

---

## Key DGROUP variables

| Address          | Name                      | Description                                                   |
| ---------------- | ------------------------- | ------------------------------------------------------------- |
| `0x546e`         | `ui_window_handle`        | Main creation window; first arg to all render calls           |
| `0x5470`         | `new_char_record_buf`     | 432-byte (0x1b0) char record being built                      |
| `0x5488`         | `secondary_window_handle` | Used in stat display context                                  |
| `0x5588`         | `pillar_has_skills_flags` | 4 bytes; checked in skill training loop                       |
| `0x559c..0x55a3` | `base_stats[8]`           | STR/INT/PIE/VIT/DEX/SPD/PER/KAR during creation               |
| `0x560c`         | `name_entry_flag`         | Cleared before name entry                                     |
| `0x560d`         | `chosen_race`             | Race index 0..10                                              |
| `0x5618`         | `has_spells_flag`         | Non-zero → run spell school init                              |
| `0x56ac`         | `bonus_points_remaining`  | 0xffff=unset; 5..26 after roller; decremented by allocator    |
| `0x56ae`         | `class_qual_flags`        | Per-class qualification word; `[class_idx*2 + 0x56ae]`        |
| `0x56ca`         | `char_record_ptr`         | Pointer to char record in creation                            |
| `0x56ce`         | `debug_cheat_flag`        | If==1, bonus forced to 21                                     |
| `0x4fd2`         | `max_roster_slots`        | Read by find_empty_slot                                       |
| `0x4fd8`         | `roster_occupancy[]`      | One byte per slot; set to 1 on save                           |
| `0x4fee`         | `roster_filename_ptr`     | Points to 'PCFILE.DBS' at 0x5ca9                              |
| `0x52d9..0x5333` | `race_stat_floors[11][9]` | wroot BSS; populated by winit; NOT accessible from wpcmk file |

---

## What wpcmk does NOT do

- Does NOT read `newgame.dbs`, `scenario.dbs`, `MASTER.HDR`, or any other scenario database
- Does NOT contain any INT 21h file I/O (zero `CD 21` bytes in the entire file)
- Does NOT own a game state — its dispatch is a no-op returning to state 4
- Does NOT contain race or class names as strings (they come from message/string resources loaded by wroot)

---

## See also

- `docs/re/findings/wpcmk-state-machine-trace.json` — structured source with per-finding evidence
- `docs/re/findings/newgame-dbs-record-fields.json` — null result + recommended dynamic approach
- `docs/re/wpcmk-character-creation.md` — prior overview (corrected encoding formula)
- `docs/re/wpcvw-character-view.md` — character record layout used after creation
