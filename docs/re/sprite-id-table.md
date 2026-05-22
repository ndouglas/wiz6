# `combatSpriteId` → `monNN.pic` Indirection (Stage B Phase 1C)

**Status:** PARTIALLY INVESTIGATED — research notes. The mapping has **not** been
fully extracted by static analysis. The `MON00.PIC` filename is a runtime-patched
template, but the patching code (and any lookup table) could not be located via
black-box byte-pattern search of `wroot.exe` and the eleven overlay files. A
DOSBox-X debugger trace, or a deeper disassembly pass that resolves overlay
calling conventions, is required to finish this task.

## Quick summary

- The string `MON00.PIC` exists exactly once in each of **5 overlays**:
  `wbase.ovr`, `wdopt.ovr`, `winit.ovr`, `wmele.ovr`, `wmnpc.ovr`.
- It is a **template**, not 59 hardcoded filenames. Each overlay also has
  `SOUND00.SND` adjacent to it with the same role.
- The runtime patches the two digit bytes at offsets `+3` and `+4` of the
  template before calling DOS file-open. *We did not find the patching code.*
- There is **no `sprintf("MON%02d.PIC", id)` format string** in any binary, and
  no `AAM` (D4 0A) instructions for ASCII conversion — so the digit derivation
  must use plain division or pre-computed tables.
- The simplest "id → file index" model is **wrong**: `combatSpriteId` values
  reach **152**, while only **59** `.pic` files exist (`mon00..mon58`).
- The actual indirection table was **not located** in `wroot.exe`, any overlay,
  `scenario.dbs`, or any other data file. Brute-force scans for byte tables
  whose entries at indices `{0, 28, 32, 33, 35, 36, 37, 51, 60, 63, 67-69, …, 152}`
  are all ≤ 58 produced only coincidental matches in unrelated dense regions
  (`mazedata.*`, `newgame.dbs`, `disk.hdr`).

## What's in `scenario.dbs` about sprite IDs

Three byte fields per monster (current `scenario-db.ts` parser names):

| Field               | Byte offset (in stat block) | Range observed | Distinct |
| ------------------- | --------------------------- | -------------- | -------- |
| `combatSpriteId`    | 98                          | 0..152         | 62       |
| `combatSpriteAlt`   | 99                          | 0..152         | 62       |
| `secondarySpriteId` | 100                         | 0..180         | 80       |

Across 186 non-empty monsters:

- **150 monsters** share `combatSpriteId == 0`. They're distinguished only by
  `secondarySpriteId` (which varies 0..180).
- The 62 distinct `combatSpriteId` values are:
  `0, 28, 32, 33, 35, 36, 37, 51, 60, 63, 67, 68, 69, 73, 75, 76, 77, 78, 90,
  91, 93, 98, 112, 113, 115-152`.
- `combatSpriteAlt` has the **same distinct value set** as `combatSpriteId`
  (they share a namespace; for 97 of 100 non-zero monsters, `alt == combat`).
- For monsters where `combat ≠ alt`: ROGUE/BUSHWACKER/BRIGAND/PIRATE have
  `combat=35, alt={35,36,36,36}` — looks like `alt` is a colour/variant tag.

## Where `MON00.PIC` lives in each overlay

Computed DS-relative offset (= file offset − code_size − 8-byte header):

| Overlay      | File offset | Strings region start | DS-relative offset |
| ------------ | ----------- | -------------------- | ------------------ |
| `winit.ovr`  | `0x1237`    | `0x1231`             | `0x0006`           |
| `wbase.ovr`  | `0x39EB`    | `0x39DA`             | `0x0011`           |
| `wmele.ovr`  | `0x4DF3`    | `0x4DE1`             | `0x0012`           |
| `wdopt.ovr`  | `0x5975`    | `0x5963`             | `0x0012`           |
| `wmnpc.ovr`  | `0xB2D0`    | `0xB2BE`             | `0x0012`           |

Overlay header layout (uniform across all 11 overlays):

```
+00  F2 00 72 45        magic  ("ò\0rE")
+04  XX XX              code_size (LE)   ← end of code = start of data/strings
+06  EE 4F              "ï O" magic tail
+08  ...                code follows
```

After `code_size` bytes of code, the file holds **null-terminated filename
strings**: `MON00.PIC` is in five of them, alongside the overlay's other I/O
filenames (`PCFILE.DBS`, `WPORT1.EGA`, …).

## Why static analysis didn't find the patching code

Direct searches all came up empty:

1. **Absolute byte writes** to the digit positions (`C6 06 <off> <val>`,
   `A2 <off>`, `88 06 <off>`, etc.) — none in any overlay. *Eliminates: writing
   digits via fixed address.*
2. **Immediate loads** of the DS-relative offset (`B8/BB/BE/BF/BA <off> 00`) —
   `mov ax, 0x12` does appear 26 times in `wmnpc.ovr`, but `0x12` is a common
   small constant and the matches don't cluster near file-open sites.
3. **LEA loads** (`8D NN <off> 00`) of the template's DS offset — none.
4. **ASCII conversion patterns** — no `D4 0A` (AAM) anywhere; no `05 30 30`
   (`add ax, 0x3030`). One false-positive `04 30` was a call relative dispmnt.
5. **Indirect byte writes at `+3`/`+4` of any register** (`88 47 03`,
   `88 47 04`, …) — only one match in `wroot.exe` at `0x0171`, which on
   disassembly turns out to be an 8-byte struct constructor (writes to fields
   `[0]..[5]` of a freshly `malloc`'d object), unrelated to filename patching.
6. **DOS `int 21h` file-open** (`B4 3D`) — exactly **one** site in the entire
   game, at `wroot.exe` code-address `0x1F41` (file offset `0x2143`), called
   exactly once during `main()` (from `0x1C2D`). It opens **one** specific
   file via `mov ds, cs; mov dx, [bp-4]; int 21h`. The overlays themselves
   contain no `int 21h` instructions, so all overlay I/O must thunk through
   `wroot.exe` via near-calls to addresses outside the overlay file
   (e.g. `wbase.ovr` calls `0xF140`, which is beyond its own 14KB code), into
   a fixed wroot-thunk table at a load-time-resolved location.

The implication is that the digit-patching either happens **inside `wroot.exe`
itself** (in code we couldn't disassemble because it lives in the
high-address thunk region that wroot maps overlays into) or via an
indirect-addressing pattern (e.g. `mov [si+3], dl` where `SI` is loaded from
a struct pointer) that doesn't match a single-pass byte regex.

## What we *did* find inside `wroot.exe`

- File-open routine at code-addr `0x1F41` (file offset `0x2143`):

  ```
  1F41  push ds; push es
  1F43  mov ah, 0x3D     ; DOS open
  1F45  mov al, 0        ; read-only
  1F47  mov bx, cs; mov ds, bx
  1F4B  mov dx, [bp-4]   ; filename pointer at [bp-4]
  1F4E  int 21h
  1F50  jc  error
  1F52  mov [cs:0x1F3F], ax   ; save handle
  1F56  mov bx, ax
  1F58  mov ah, 0x3F     ; DOS read
  ...
  ```

  This function takes the filename pointer in a local variable and DS must
  equal CS. Called from `0x1C2D` during init — almost certainly opens
  `MASTER.HDR` (the only filename in `wroot.exe`'s own data that fits).

- Strings present in `wroot.exe`: `ega.drv`, `cga.drv`, `herc.drv`,
  `tandy.drv`, `CREDITS.PIC`, `WMAZE.OVR`, `DISK.HDR`, `MSG.DBS`,
  `SCENARIO.DBS`, plus error messages and the overlay name list `WINIT,
  WBASE, WMAZE, WMELE, WPOPS, WMEXE, WTREA, WPCMK, WPCVW, WMNPC, WDOPT`.
  Notably **no `MON*.PIC` template**, no `MON%02d.PIC` format string.

- `winstall.exe` (the installer) DOES contain all 59 filenames spelled out
  (`MON00.PIC` through `MON58.PIC`, in a slightly scrambled order with
  per-file installation-disk codes intermixed). This is **the installer's
  file inventory**, not a runtime lookup. It confirms the file set on disk
  (`mon00.pic..mon58.pic`, with `mon51/54/57/58` placed after `mon50` for
  diskette layout reasons).

## Hypotheses that look plausible but were **not** verified

### Hypothesis A — `secondarySpriteId` IS the file index when in range

For each monster, `file = secondarySpriteId` if `0 ≤ secondarySpriteId ≤ 58`,
else `combatSpriteId` if `0 ≤ combatSpriteId ≤ 58`, else fall back to
`mon00.pic` (the tiny placeholder).

Applied to all 186 non-empty monsters this maps **126** to a file (using **32**
distinct `monNN.pic` files: `0, 1, 2, 3, 4, 5, 8, 10, 14, 15, 16, 18, 19, 20,
23, 25, 26, 28, 36, 37, 41, 42, 44, 46, 47, 49, 50, 51, 54, 55, 56, 58`) and
leaves **60** monsters with no sprite. Only 32 of 59 files would be used.

This is the simplest model that matches the doc's observation that "when
`combatSpriteId == 0`, the actual lookup probably consults `secondarySpriteId`".
It's **the recommended starting point for Phase 2 if Phase 1C cannot be
completed by deeper RE.** It will produce visually-correct results for the
~70 % of monsters whose sprite ID is in `[0..58]`, and broken/blank sprites
for the rest. (Better than nothing for Stage B.)

### Hypothesis B — full indirection table somewhere we missed

The strongest evidence FOR a table:

- 60 monsters have **both** `combatSpriteId > 58` and `secondarySpriteId > 58`.
  In-game they presumably display something. (Counter-example: maybe these are
  late-game monsters all on the same "?? BANE KING ??" boss screen using a
  single hardcoded asset; would need DOSBox to check.)
- The `combatSpriteId` value space and `secondarySpriteId` value space
  **overlap** (both contain 68, 73, 77, 90 etc.) — suggesting a shared ID
  namespace, hence a unified ID → file mapping.

The strongest evidence AGAINST:

- No 153-byte or 181-byte byte/word array with entries ≤ 58 was found in any
  binary or data file. Search included all 12 binaries (`wroot.exe` plus 11
  overlays), all 4 drivers, the scenario data files, and the static screens.
- A unified namespace doesn't require a single contiguous table — it could be
  a switch statement compiled into the overlay code.

### Hypothesis C — combatSpriteId > 58 means "boss/scene sprite"

The four largest `.pic` files (`mon13`, `mon32`, `mon50`, `mon54` at 22-26 KB
each, vs. ~10 KB median) decode into full-screen images per Stage A. If
`combatSpriteId > 58` indicates "use a boss scene file" instead of a normal
sprite, the engine might apply a different `(id − offset)` formula. Untested.

## Recommendations for Phase 2

1. **Ship Hypothesis A** as a temporary mapping in `@wiz6/data`. Expose it as a
   pure function `combatSpriteIdToFile(combat: number, sec: number): number | null`.
   Document that "monsters with both IDs out of range render the
   `mon00.pic` placeholder" and visibly mark those monsters in the viewer
   (e.g. "sprite source: secondarySpriteId / combatSpriteId / placeholder").
2. **File a follow-up task**: run AMAZULU (combat=118, sec=36) and YUAN-TI
   (combat=118, sec=0) in DOSBox-X with the debugger, breakpoint on `int 21h
   ah=0x3D`, and read which filename the engine actually opens. Two data
   points should be enough to disambiguate Hypotheses A vs. B vs. C.
3. Re-investigate the wroot-thunk region (overlay calls to addresses outside
   their own code segment). The overlay loader almost certainly maps `wroot.exe`
   code at a fixed offset above each overlay's code segment, and the
   filename-construction routine lives there.

## Quirks observed

- **Placeholder file `mon00.pic`**: only 1166 bytes, decodes (per Stage A) to
  almost no real bitmap content. Consistent with a "no sprite" placeholder
  used when an ID can't resolve.
- **150 of 186 monsters share `combatSpriteId == 0`** — a major hint that 0
  means "look elsewhere" rather than "use sprite 0".
- **`combatSpriteAlt`** is almost always equal to `combatSpriteId`. The 3
  exceptions (BUSHWACKER, BRIGAND, PIRATE: `combat=35, alt=36`) look like
  palette/colour variants of the same base monster sprite.
- **`combatTraitId`** (byte 112) has only 8 distinct values, in steps of 5
  (`0, 5, 10, 15, 20, 25, 30, 35`) — clearly NOT a sprite identifier.
- **Filename file layout on disk**: the installer (`winstall.exe`) places
  `mon51.pic, mon54.pic, mon57.pic, mon58.pic` AFTER `mon50.pic` (instead of
  in numerical order) in its install-disk codes. This is install-time only
  and has no bearing on the runtime ID mapping.

## Probe scripts (not committed — re-create as needed)

All in `/tmp/`:

- Byte-pattern searches across all binaries for `MON00.PIC` references
- 153/181-byte table scans by file across all `original/` files
- Disassembly with `ndisasm -b 16 -e 0x200 -o 0 original/wroot.exe`
- Disassembly with `ndisasm -b 16 -e 8 -o 0 original/<name>.ovr`
- Filename-template patching pattern searches:
  `\x88[\x40-\x7F]\x03.{0,8}\x88[\x40-\x7F]\x04` (consecutive byte writes
  to offsets +3/+4 of any register-pointed buffer)
