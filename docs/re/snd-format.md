# `.snd` files and the Wiz6 audio engine

**Status:** Decoder is byte-correct and reproduces audible audio. Earlier
revisions of this doc had the on-disk header wrong by 2 bytes and missed the
decoded-length prefix; both errors made the Huffman walk start mid-stream and
produced byte streams that statistically looked like PCM but sounded like
noise. The fixed format below is verified against the engine's bit decoder
(`huffman_decode_bitstream` at image 0x134D5) and its caller loop at 0x134BC.

This doc covers:

1. **The `.SND` file format** — how 35 sound files (`sound00.snd` ..
   `sound38.snd`) are encoded on disk.
2. **The audio playback engine** — where those bytes go to make noise, and on
   what hardware (PC speaker, AdLib OPL2, or Tandy / variable PSG).

The audio code lives **entirely inside `wroot.exe`**. There is no dedicated
audio driver file — only the video drivers (`ega.drv`, `cga.drv`, `herc.drv`,
`tandy.drv`) ship as separate files. Wiz6 hand-rolled its own audio engine
rather than using Miles AIL / HMI / etc.

## Renames applied to the Ghidra project

The first wroot.exe naming pass mis-identified the audio engine entry at
`0x11462` as `disk_int13_reset`. It does contain a single `INT 13h` instruction
— but only in an early-out fatal branch reached when an unusual flag is set; the
rest of the function is the entire audio engine (PIT programming, IRQ0 ISR
install, speaker gate, AdLib init). The 2026-05-22 audio-RE pass renamed it
and 16 related functions / ISRs:

| Address   | Was                            | Now                           |
| --------- | ------------------------------ | ----------------------------- |
| `0x10AAA` | `FUN_1000_0aaa`                | `audio_play_sound`            |
| `0x10A8F` | `FUN_1000_0a8f`                | `audio_volume_range_check`    |
| `0x11462` | `disk_int13_reset` (incorrect) | `audio_engine_play`           |
| `0x118C3` | (no function — IVT-only)       | `audio_isr_adlib_slow`        |
| `0x11901` | (no function — IVT-only)       | `audio_isr_adlib_fast`        |
| `0x11919` | (no function — IVT-only)       | `audio_isr_var_slow`          |
| `0x11947` | (no function — IVT-only)       | `audio_isr_var_fast`          |
| `0x1196A` | (no function — IVT-only)       | `audio_isr_pc_speaker_fast`   |
| `0x11962` | (no function — internal)       | `audio_adlib_init_voice`      |
| `0x119D4` | (no function — IVT-only)       | `audio_isr_pc_speaker_slow`   |
| `0x11A08` | (no function — IVT-only)       | `audio_isr_pc_speaker_alt`    |
| `0x11A88` | (no function — IVT-only)       | `audio_isr_tick_no_sound`     |
| `0x11A92` | (no function — internal)       | `audio_opl_write`             |
| `0x11AA3` | (no function — internal)       | `audio_opl_status_wait_long`  |
| `0x11AB3` | (no function — internal)       | `audio_opl_status_wait_short` |
| `0x135FD` | `FUN_1000_35fd`                | `audio_play_by_id`            |
| `0x13640` | `kbd_pre_input_disk_check`     | `audio_wait_for_idle`         |

Replay script: `tools/ghidra/scripts/apply_audio_names.py` (idempotent).

## File format

There is **no rate field on disk**. Earlier revisions of this doc claimed
bytes 2..3 were a `rate_word` (with `0xFFFF` meaning default); they're
actually the first word of the Huffman tree, which happens to look
rate-like for some files because the tree's first leaf is often near the
signal's DC level. The per-sound rate (if any) is carried in the runtime
sound table at DGROUP 0x3344, populated outside the file-load path. For all
sounds the engine plays at ~10 kHz (see "playback rate" below).

### Header (2 bytes)

| Offset | Size  | Field                                                                                                                           |
| -----: | :---: | ------------------------------------------------------------------------------------------------------------------------------- |
| `0x00` | u16le | **tree_size_bytes** — size of the Huffman tree in bytes (multiple of 4). Value `0` = no Huffman; raw 8-bit PCM follows directly. |

### Huffman tree (variable, when tree_size_bytes > 0)

Starts at file offset **0x02**. Each node is 4 bytes = two 16-bit signed
words = (left, right). Child interpretation:

- **Top bit clear** (`child & 0x8000 == 0`, equivalently `child >= 0` signed):
  **leaf**. Sample value = `child & 0xFF` (low byte).
- **Top bit set** (`child & 0x8000 != 0`, equivalently `child < 0` signed):
  **internal link**. Next node index = `-child` (i.e. `0x10000 - child` in
  unsigned 16-bit arithmetic). The engine asm computes `neg bx; shl bx, 1;
  shl bx, 1` → BX = (-child) × 4 = byte offset to the next node.

### Decoded-length prefix (2 bytes, Huffman files only)

Immediately after the tree, at file offset `2 + tree_size_bytes`, there is
a u16 LE giving the **number of 8-bit samples that the bitstream decodes
to**. The engine uses this to size the output buffer (passed to
INT 21h/48h) and as the loop counter for the decode wrapper at 0x134BC.

Missing this prefix was the main bug in earlier revisions: when treated as
16 bits of compressed data, the misaligned tree walk corrupted every
subsequent sample.

### Bitstream

Starts at file offset `2 + tree_size_bytes + 2 = 4 + tree_size_bytes`. Read
bits **MSB-first** (high bit of each byte first). For each bit:

- `bit == 0`: take left child of current node (first word of the 4-byte pair)
- `bit == 1`: take right child (second word)

On a leaf: emit `child & 0xFF` as one sample, reset to root (node 0). The
decode wrapper exits after exactly `decoded_length` samples have been
emitted; remaining bytes in the bitstream are discarded.

### Decoded output

The decoded bytes are **8-bit unsigned PCM** at a fixed engine rate.
Sample center is 128 (silence); deviations toward 0 and 255 represent the
audio waveform. They are direct PCM and play correctly through Web Audio
as `(byte - 128) / 128`. No further LUT or transformation is needed for
playback (the engine's `xlatb` LUT step at `cs:0x1A4B` is hardware-specific —
see "audio engine" below — and is not part of the on-disk format).

### Playback rate

The engine sets PIT counter 0 to `0x48` (72), giving an IRQ0 rate of
`1.193182 MHz / 72 ≈ 16572 Hz`. The ISR advances the sample pointer
fractionally: `add ah, FRAC; adc di, 0`, where `FRAC` is patched at
runtime from `(-param_5 - 1) & 0xFF`. For the engine's typical
`param_5 = 100`, `FRAC = 0x9B = 155`, giving an effective sample rate of
`16572 × 155 / 256 ≈ 10026 Hz`. The TypeScript decoder uses this rate as
the constant `SND_SAMPLE_RATE_HZ` (verified by listening).

A "fast" mode also exists (PIT counter 0 = `0x24` = 36, double rate); the
selector is the flag `*0x1760 & 2`. Not used at all in the title-screen
playback path; whether any in-game sound triggers it is currently unknown.

### Decode pseudocode

```python
def decode_snd(file_bytes: bytes) -> list[int]:
    tree_size = int.from_bytes(file_bytes[0:2], 'little')

    if tree_size == 0:
        # Raw 8-bit PCM
        return list(file_bytes[2:])

    n_nodes = tree_size // 4
    import struct
    tree = struct.unpack(f'<{n_nodes * 2}H', file_bytes[2:2 + tree_size])

    length_off = 2 + tree_size
    decoded_length = file_bytes[length_off] | (file_bytes[length_off + 1] << 8)

    bitstream = file_bytes[length_off + 2:]
    samples = []
    node = 0
    for byte in bitstream:
        if len(samples) >= decoded_length:
            break
        for shift in range(7, -1, -1):
            if len(samples) >= decoded_length:
                break
            bit = (byte >> shift) & 1
            child = tree[node * 2 + bit]
            if (child & 0x8000) == 0:
                samples.append(child & 0xFF)
                node = 0
            else:
                node = 0x10000 - child
                if node >= n_nodes:
                    return samples
    return samples
```

### Inventory across all 35 files

| Variant                          | Files                                       |
| -------------------------------- | ------------------------------------------- |
| Huffman-compressed 8-bit PCM     | 31 (sound00..38 except the four below)      |
| Raw uncompressed PCM (tree_size=0) | 4 (sound28, sound30, sound32, sound35)    |

There are no "large-leaf" anomalies in the corrected decode. Previous
observations of leaves > 255 (e.g. `sound00` node 31 right = 1769) were an
artefact of starting the tree 2 bytes too late — when re-aligned, the
"oversized leaf" lands on different tree nodes that are well-behaved.

## The audio engine

```
                       ┌──────────────────────────────────────┐
                       │ caller in overlay (e.g. winit_state1) │
                       │   call thunk 0xC546 with sound_id      │
                       └────────────────┬─────────────────────┘
                                        │
                                        ▼
       wroot 0x10AAA ──── audio_play_sound(sound_id) ──────────────────────
                                        │
                  reads byte at DGROUP[0x334E + sound_id*0xC]    ← timer/volume
                  reads byte at DGROUP[0x3590]                   ← music-mode
                  scales by device                                ← cases 1..5
                                        │
                                        ▼
       wroot 0x135FD ──── audio_play_by_id(slot, dur, vol, flg) ─────────
                                        │
                  looks up far-pointer at DGROUP[0x3579+slot*4]   ← sample buf
                                        │
                                        ▼
       wroot 0x11462 ──── audio_engine_play(seg,off,len,div,...) ────────
                                        │
                  installs IRQ0 ISR (one of 7 variants) at IVT[8]
                  programs PIT counter 0 (sample-rate timer)
                  gates PC speaker on (out 0x61, gate|3)
                  unmasks IRQ0 (out 0x21, 0xFE)
                                        │
                                        ▼
       IRQ0 fires at sample rate ── audio_isr_<device>_<speed> ──────────
                                        │
                  reads next sample byte from buffer (DI / patched-imm)
                  translates via 256-byte log-attenuation LUT at cs:0x1A4B
                    (all 7 ISR variants do this — earlier docs said only "slow")
                  writes translated byte to device port:
                      PC speaker:  out 0x42, sample (PIT counter 2 mode 0)
                      AdLib:        out 0x389, sample  (OPL2 data register)
                      variable PSG: out [cs:0x175B], sample
                  advances pointer fractionally
                    (add ah,FRAC; adc di,0 — FRAC patched from -param_5-1)
                  acks 8259 PIC (out 0x20, 0x20) and IRETs
                                        │
                  on buffer exhaustion (CF set by adc) → fallback ISR sets
                  busy-flag *0x1764 = 0xFF, audio_wait_for_idle wakes up,
                  audio engine stops timer + speaker + masks IRQ0
```

### The IRQ0 ISR family

Seven IRQ0 timer handlers, one per (device × fast/slow) combination, plus one
"no sound playing" tick handler:

| Address   | Device       | Variant   | Output port               |
| --------- | ------------ | --------- | ------------------------- |
| `0x118C3` | AdLib (OPL2) | slow      | `0x389`                   |
| `0x11901` | AdLib (OPL2) | fast      | `0x389`                   |
| `0x11919` | variable PSG | slow      | `[cs:0x175B]` (runtime)   |
| `0x11947` | variable PSG | fast      | `[cs:0x175B]` (runtime)   |
| `0x1196A` | PC speaker   | fast      | `0x42` (PIT, mode 0)      |
| `0x119D4` | PC speaker   | slow      | `0x42` (PIT, mode 0)      |
| `0x11A08` | PC speaker   | alt       | `0x42` (PIT, mode 0)      |
| `0x11A88` | (none)       | tick only | — increments tick counter |

Selection rule (from `audio_engine_play` decompile):

```
       device := *0x1756            (set by audio config in wbase.ovr)
       slow   := (*0x1760 & 2) == 0 (set per-sound or per-mode)

       fast variant:                 slow variant:
       device 0 → 0x1196A            device 0 → 0x119D4 (or 0x11A08 if *0x19D2)
       device 1 → 0x11901            device 1 → 0x118C3
       device ≥ 2 → 0x11947          device ≥ 2 → 0x11919
```

So `*0x1756` is the **audio output device byte**:
- `0` = PC speaker (PIT timer mode 0 driving counter 2)
- `1` = AdLib OPL2 (port `0x388`/`0x389`)
- `≥ 2` = variable PSG (port number read at runtime from `cs:[0x175B]`,
  most likely Tandy 1000 PSG at `0xC0` or Sound Blaster DSP at `0x22Y`)

### The sample-translation LUT

**Every** ISR (both "fast" and "slow" variants, all three devices) passes
each sample byte through an `xlatb` table-translate before writing to
hardware. Earlier revisions of this doc claimed only the slow variants
used xlatb; reading the actual asm shows all seven do. Example:

```asm
    mov al, [<sample-source>]
    mov bx, 0x1a4b              ; CS-relative offset
    cs xlatb                    ; al ← cs:[bx + al]
    out <device-port>, al
```

The 256-byte table at `cs:0x1A4B` is a **logarithmic-attenuation lookup**:

| Input byte | Output byte (attenuation)       |
| ---------: | ------------------------------- |
|          0 | 0x3F (silent / max attenuation) |
|         32 | 0x16                            |
|         64 | 0x0E                            |
|         96 | 0x0A                            |
|        128 | 0x06                            |
|        160 | 0x04                            |
|        192 | 0x02                            |
|        224 | 0x00                            |
|        255 | 0x00 (max output)               |

The output range `0x00..0x3F` matches:
- **AdLib operator total-level register** (0x40/0x43; 0 = full output, 0x3F = silent)
- **PC speaker PIT counter reload** (smaller value = faster speaker toggle = perceived louder)

The Web Audio port does **not** need to apply this LUT — the on-disk bytes
are already a usable 8-bit unsigned PCM signal centered at 128. The LUT is
how the engine compresses that PCM into a 6-bit hardware register value
for the specific output device. For Web Audio (linear 16-bit float), play
the bytes directly.

### The sound table at DGROUP `0x3344`

Per-sound state, 12 bytes per entry, indexed by the sound trigger ID. Layout
(inferred from `audio_play_sound` decompile):

| Offset | Type | Field                                                                                                                                 |
| -----: | :--- | ------------------------------------------------------------------------------------------------------------------------------------- |
|   `+0` | word | **alias_id** — index into sample-buffer table at `0x3579` (4 bytes per slot: offset+segment). Allows N sound-IDs to share one buffer. |
|   `+2` | word | (reserved or status)                                                                                                                  |
|   `+4` | word | **buf_lo** — 'is loaded' check (paired with +6)                                                                                       |
|   `+6` | word | **buf_hi** — both zero ⇒ not loaded, use alias_id                                                                                     |
|   `+8` | word | **duration** — passed as length/period to audio_engine_play                                                                           |
|   `+A` | byte | **rate_or_vol** — passed as uVar1, sometimes halved per device                                                                        |
|   `+B` | byte | **flags** — passed as flags arg to audio_engine_play                                                                                  |

### The sample-buffer table at DGROUP `0x3579`

A flat array of far-pointers (4 bytes: offset+segment per entry). Index 0..N
maps to the loaded sample buffer for that slot. Populated by
`huffman_load_and_decompress` (wroot `0x133E9`) — the same function that loads
.pic files writes to this table too. wroot.exe contains exactly **3 references
to `0x3579`**: in `audio_engine_play`, in `huffman_load_and_decompress`, and
in `audio_play_by_id` — confirming this is the canonical sample-pointer table.

### The music-mode byte at DGROUP `0x3590`

Read by `audio_play_sound` to scale the per-sound volume/timer. Cases 1-5:

| Case | Behavior                                                              |
| ---: | --------------------------------------------------------------------- |
|  `1` | If `rate_or_vol` in range [10, 12]: halve. Else: pass through.        |
|  `2` | Range-check (early-out on out-of-range).                              |
|  `3` | Always halve.                                                         |
|  `4` | Halve + range-check.                                                  |
|  `5` | Return `sound_id * 0xC` immediately (probe-only? gets buffer offset?) |

`*0x3590` is written only by `wbase.ovr` (the main-menu overlay), at file
`0x1488` where 5 consecutive bytes are copied to `(0x3590..0x3594)` from a
per-configuration struct. This is the **"select audio device" UI**'s commit
site. The other 4 bytes (`0x3591..0x3594`) likely store rate/volume/port for
the chosen device.

## Sound ID → filename mapping

**Partially solved.** The only literal sound filename in any binary is
`SOUND00.SND`. Loaded explicitly by `winit_state1_title_and_credits` (the
title screen) for the title clang. Other sounds are presumably loaded via
inline filename byte-substitution — the same `MON00.PIC` template trick used
for monster sprites:

```c
char fname[] = "SOUND00.SND";
fname[5] = '0' + (sound_id / 10);
fname[6] = '0' + (sound_id % 10);
int handle = crt_open(fname);
huffman_load_and_decompress(handle, ..., kind, slot);
crt_dos_close(handle);
```

The specific substitution call sites for SOUND files were not identified in
this pass. The pattern is well-attested for .pic files (`docs/re/pic-loader.md`)
and is presumably the same for .snd. DOSBox-X `int21 = debug` trace would
confirm: during boot, the engine should open `SOUND00.SND`, `SOUND02.SND`,
`SOUND03.SND`, etc. — one OPEN per loaded sound file.

The five `audio_play_sound(N)` calls from `winit_state1_title_and_credits`
pass N = `4, 0xD, 0xE, 6, 7` — but **these are indices into the runtime sound
table at `0x3344`**, not directly into the filesystem. Multiple table slots
likely alias to the same `SOUND00.SND` buffer (via the +0 alias_id field), so
all five calls play the title clang at different stages. DOSBox-X file-open
trace confirms / refutes by counting unique SOUND opens during title boot
(hypothesis: exactly 1 → SOUND00.SND).

## Port to Web Audio

The canonical implementation lives at `packages/parser/src/formats/snd.ts`
and is exported as `decodeSnd` + `SND_SAMPLE_RATE_HZ`. The viewer's
`packages/viewer/src/lib/audio.ts` wraps it for Web Audio playback.
Decoded bytes go directly into an 8-bit-unsigned-PCM WAV at
`SND_SAMPLE_RATE_HZ` (10026 Hz); no further transformation is needed.

## Open questions

1. **The variable-port hardware**: `*0x1756 ≥ 2` selects the ISR variant that
   writes to `[cs:0x175B]`. Tandy PSG (port 0xC0), Sound Blaster DSP write
   (0x22C), and other 1990-era options all live in different port ranges. The
   engine has `tandy.drv` in the file list — but no `tandy.snd`-style driver
   file. The port is selected by wbase's audio-config UI at boot.

2. **wbase.ovr audio config**: 5 bytes copied to `0x3590..0x3594` from a
   per-mode struct. Naming pass on wbase would identify the option labels
   ("PC Speaker / AdLib / Tandy / Silent") and confirm device-selection
   contract.

3. **Per-sound rate / volume / flags**: the runtime sound table at DGROUP
   0x3344 holds 12-byte entries with `duration` / `rate_or_vol` / `flags`
   fields that get passed to `audio_engine_play`. The boot-time population
   site for this table hasn't been identified; for now we play every
   `.snd` at the same default rate (`SND_SAMPLE_RATE_HZ`) and that sounds
   correct. If different sounds want different rates, finding the
   populator will let us pull the right `param_5` per sound.

4. **Fast-mode trigger**: `audio_engine_play` selects fast (PIT 36, ~16572
   Hz sample rate) vs slow (PIT 72, ~8286 Hz × frac advance) ISRs based on
   `*0x1760 & 2`. We don't know which gameplay states/sounds set the fast
   bit. The title-clang path uses slow.

5. **The `audio_adlib_init_voice` rename was wrong.** The findings file
   listed image 0x11962 as an AdLib OPL-register init routine; reading the
   bytes there shows just an EOI/IRET stub. The actual AdLib init (if any)
   must be elsewhere — possibly in `FUN_1000_17fe`, referenced from
   `audio_engine_play`'s setup. Not yet traced.

## See also

- [`pic.md`](pic.md) — sister format: same Huffman algorithm, but the decoded
  bytes are RLE drawing opcodes instead of audio samples.
- [`pic-loader.md`](pic-loader.md) — caller-side reference for .pic loads;
  the .snd load path uses the same thunk-and-driver-table dispatch mechanism.
- [`startup-sequence.md`](startup-sequence.md) — winit_state1_title_and_credits
  is the canonical caller for the title clang.
- [`findings/snd-format.json`](findings/snd-format.json) — structured findings
  with per-claim evidence.
