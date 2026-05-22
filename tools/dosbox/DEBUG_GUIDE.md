# Multi-segment `.pic` debug session guide

**Goal:** capture the destination segment register (`ES`) that the engine passes to the EGA driver's RLE decoder when loading a multi-segment `.pic` file. Specifically, observe whether the decoder is called 1 time (and somehow decodes all segments in one call) or N times (with a different ES each time).

## Setup phase — save state at a known mon11 / mon32 / mon45 encounter

This part needs no debugger. Just play normally.

1. Launch the game with `tools/dosbox/run-with-logging.sh`. The dynamic-tracing config is already set up (CPU at 386/6000 cycles for slower walking).
2. Create a party, walk into the dungeon.
3. Find a multi-segment monster encounter. The known multi-segment files: `mon11.pic` (cyclops swordsman / Cap'n Matey), `mon20`, `mon27`, `mon32`, `mon36`, `mon37`, `mon44`, `mon45` (Rebecca), `mon50`, `mon54`, `mon56`, `mon58`, `mon08`, `mon09`, `mon28`. **The easiest sanity check is mon11 since you already have an in-game screenshot of it.**
4. **Right BEFORE triggering the encounter** (e.g., on the dungeon tile just before the fight), open the DOSBox-X menu bar → **Capture → Save State** (or whatever DOSBox-X calls it). Pick a slot, give it a name like "pre-mon11".
5. Step into the fight to confirm it's actually mon11. Then close DOSBox-X (or load the save state to reset).

You can now reload to that exact pre-fight state any time.

## Capture phase — read ES at each decoder call

This is the part that needs the debugger.

1. Launch with `tools/dosbox/run-debug.sh` — this enables `-debug` (CPU debugger).
2. The debugger may appear as either a console window or inline as text. On macOS SDL2 builds, it's usually launched via **Debug → Start Debugger** in the menu bar — try that if the `-debug` flag alone doesn't open a separate window.
3. **Load the save state from step 4 above** (Capture → Load State).
4. Pause execution: in the debugger window, hit `<F5>` or type `pause`. (Or just hit Alt-F12 — keymapper bindings vary.)
5. In the debugger, scan memory for the EGA driver's decoder prologue byte pattern:

   ```
   55 8B EC 83 EC 08 1E 06 56 57
   ```

   The command is something like `findmem 0 ffff 55 8b ec 83 ec 08 1e 06`. Expected: one hit. Note the segment and offset reported (e.g., `1234:5678`).

6. Set an instruction breakpoint at that exact address:

   ```
   BPX <seg>:<off>
   ```

   (Replace `<seg>` and `<off>` with the address from step 5.)

7. Continue execution (`C` or `<F5>`).
8. Step into the multi-segment encounter (move on screen / press attack).
9. **The breakpoint will hit when the engine calls the decoder.** At each hit:

   * Type `R` to show registers.
   * Note the value of `ES` (this is the destination segment for the decode).
   * Also note `[BP+0E]` and `[BP+10]` (the file offset args) — type `D SS:BP` to dump stack values.
   * Continue (`C`).

10. If the breakpoint hits MORE THAN ONCE for the same `.pic` file, you've found multi-segment iteration in the wrapper. If only ONCE, the decoder itself iterates internally past the first 0x00.

## What to send back

For each .pic load you observe, paste the **ES** and **file offset arguments** at each decoder breakpoint hit. Format like:

```
mon11.pic load:
  hit 1: ES=2A80, file_offset=0  (= seg 0 read into 2A80:0)
  hit 2: ES=????, file_offset=????  (= seg 1 read into ????:0)
  ...
```

If only ONE hit per file, paste that and also paste the bytes at `ES:0` to `ES:30` (dumped via `D <es>:0`) so I can check if the buffer there has CONCATENATED bytes from all segments, or just segment 0.

## If the interactive debugger is awkward

Fall back: use `Capture → Save State` after the encounter, send me the resulting save state file (in `~/Library/Preferences/DOSBox-X 2026.05.02 Preferences/save/`). I can analyze the saved memory dump statically.

Save state files contain the full 16 MB of emulated memory, so I can:

* find the loaded ega.drv (`55 8B EC 83 EC 08 1E 06` search)
* derive the destination segment(s) used for the .pic load
* dump the actual buffer at that segment and compare to our naive concatenation

That's slower than live debugging but doesn't require fighting with the debugger UI.
