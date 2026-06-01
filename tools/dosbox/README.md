# DOSBox save-state library

Reproducible drive-recipes for parking the engine at a known state, so RE and
fixture capture don't re-drive from scratch. **Recipes are the committed
library** (`state-catalog.ts`); `tools/dosbox/save/*.sav` are gitignored,
disposable, built on demand.

> Canonical convergence guide (both surfaces, when to promote a drive to a gate):
> [`docs/driving-based-testing.md`](../../docs/driving-based-testing.md).

## Build a state

```bash
pnpm tsx tools/dosbox/build-saves.ts <name> [--slot N=1] [--force]
pnpm tsx tools/dosbox/build-saves.ts --all     # build the whole catalog
pnpm tsx tools/dosbox/build-saves.ts --list     # list recipes (no DOSBox)
```
Then `gen-fixture.ts --save N` reads it, or MCP `dosbox_load_state N` loads it.
`--force` rebuilds even if `save/<slot>.sav` already exists (the idempotency
check is file-existence only — it does NOT verify the save is the right state).

## ⚠ Must run from an Accessibility-granted terminal

The builder drives DOSBox with synthetic keystrokes, which macOS only delivers
if the **running process has Accessibility permission** (System Settings →
Privacy & Security → Accessibility). Run it from your normal terminal (grant it
once). A process WITHOUT permission still "completes" but the keys never reach
DOSBox — you get a save of the **title screen**. See packages/mcp/PERMISSIONS.md.

## List the catalog / add a recipe

States live in `state-catalog.ts` (`STATE_CATALOG`). Add one by appending
`{ name, description, steps }` — `steps` are MCP key macros sent AFTER the title
is dismissed; the builder settles the frame (best-effort, `waitForStableFrame`)
between steps. Verify a new recipe by building it and loading the slot in the MCP
(screenshot to confirm the state), tuning the macros if a step under/over-shoots.

## Configs

`wiz6-fast.conf` (un-throttled, `cycles=max`) is used by the builder + automated
MCP launches; `wiz6.conf` stays throttled (`cycles=fixed 6000`) for human-paced
inspection.

## Determinism (verified 2026-05-31 via the MCP)

- **Castle recipes (`castle-1..6`) are byte-deterministic** — they add fixed
  PCFILE characters, so the result is identical every build.
- **Creation recipes (`mage-spellpick`, …) are NOT byte-deterministic** — the
  engine rolls stats fresh each boot. The recipe reliably reaches the right
  *screen*: for `mage-spellpick` the spell **panel** region is byte-identical to
  the `creation-spell-pick` fixture (100%), and the full frame matches 99.8%
  (the only differences are the rolled stat digits in the char sheet). So use a
  creation recipe to reach a screen state, not to reproduce a specific roll. To
  pin an exact character, vendor its `.sav`/draft rather than re-rolling.

## Requires

macOS Accessibility permission for the driving process (above).

## MCP-driven capture gotchas (learned 2026-06-01, capturing EQUIP/ASSAY fixtures)

Capturing fixtures by driving DOSBox-X **via the MCP from a Claude session** (rather than
`build-saves`) hit several quirks worth knowing before the next capture:

- **Save-state slots are 0–9.** `dosbox_save_state` / `dosbox_load_state` accept a "slot" 1–10,
  but DOSBox-X's underlying slots are **0–9 — slot 10 silently fails** (the slot-cycle lands on
  an empty/invalid slot and the save chord finds nothing to write; you get a "did not save /
  mtime didn't advance" error, and a "slot empty" message in the DOSBox window). **Use slots ≤ 9.**
- **`send_input` and `save_state` (≤9) are reliable; the F12-modified chords are flaky.** In a
  long session, `dosbox_screenshot` (drives F12+p + sets the window frontmost) started failing
  with `AX set frontmost failed (-25204)`, and `dosbox_load_state` (F12+l) silently didn't take
  (the engine stayed on the prior screen). Plain `dosbox_send_input` (unmodified keys) and
  `dosbox_save_state` kept working throughout. The failures are focus/environment-related
  (something else holding frontmost), not deterministic — relaunching gives a fresh window that
  screenshots once before the problem recurs.
- **`load_state` breaks subsequent screenshots.** A fresh-window screenshot (before any
  `load_state`) works; after loading a slot, the next `dosbox_screenshot` tends to fail to
  refocus. So **prefer driving from a fresh boot over `load_state`.**
- **The robust capture path = FRESH BOOT, `send_input` only, no `load_state`:** `dosbox_launch`
  → `send_input "enter"` (dismiss title) → drive the whole target state with `send_input` only
  (rebuild the party, navigate the menus) → `save_state` to a slot ≤9 → `gen-fixture --save N`.
  This is how the castle/EQUIP/ASSAY fixtures were captured this session.
- **You don't need screenshots to capture a fixture.** `gen-fixture.ts` decodes the `.sav`
  (not the live frame) into a `.png` you can read directly — so you can drive *blind*
  (`send_input` + `save_state`) and verify by reading the generated PNG. Driving blind into a
  multi-step picker is error-prone, though: when screenshots work, verify each step; otherwise
  re-drive on a wrong result.
- **Fresh-boot drive sequences are deterministic.** The character-view fixtures came from:
  `enter` (title) → `enter enter` ×N (add N PCFILE party members) → `down enter` (REVIEW MEMBER
  → picker) → `down enter` (pick member → character view, cursor on EXIT) → action-menu nav
  (the menu is column-major 2-row, so `left` = previous column, same row). The `state-catalog.ts`
  recipes encode these; the picker/character-view captures are reproducible.
