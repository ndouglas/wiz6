# OPEN-a-door: FORCE / PICK flow — design

**Date:** 2026-06-11
**TODO:** #089 (OPTIONS OPEN command — door Force/Pick/Key)
**Status:** design approved; pending spec review → implementation plan
**RE basis:** `docs/re/findings/maze-open-door-menu.json` (incl. `static-asm-correction-roll-and-outcome`)

## 1. Summary

Wire the in-dungeon **OPTIONS → OPEN** command (when the party faces a closed,
forceable door) to the engine-faithful **`FORCE` / `PICK` / `EXIT`** menu:

```
OPEN (facing a type-7 door)
  └─ PARTY OPTIONS strip: [FORCE] [PICK] [EXIT]
       FORCE / PICK → "WHO WILL TRY?" (alive-gated member picker)
         FORCE → strain-bar, STR + Spirit-Points vs lock
         PICK  → tumblers, (level + Skulduggery) vs lock
           outcome: success → door opens (passable; party does NOT auto-step)
                    failure → 1/3 chance the door advances toward welded/jammed
                    jammed  → (welded door) neither action opens it
       EXIT → close.   OPEN always consumes one turn-tick.
```

This layers on the already-shipped OPTIONS-menu dispatch seam (#088), exactly as
REVIEW did. **KEY** is intentionally *not* in this menu (the engine only offers
FORCE/PICK/EXIT); keys route through OPTIONS → USE ITEM and are out of scope here.

## 2. Reverse-engineering basis (confirmed)

All offsets in `wmaze.ovr`; char-struct offsets cross-checked against our 432-byte
`character_record` (party array BSS `0x43e8`, stride `0x1b0`).

- **Dispatch:** OPEN = PARTY OPTIONS grid index 4 → `dungeon_in_camp_menu` (`0x2794`)
  case `0x294b` → `FUN_0000_95ba` → (type-7 record at party cell, `+0x240` forward
  edge code ∈ {1,2}) → `FUN_0000_9345` = the FORCE/PICK/EXIT menu.
- **Menu (`0x9345`):** window + header msg `0x7d2`; labels = indexedMessages
  **534 FORCE / 535 PICK / 536 EXIT**; `menu_grid_select` (`0x1574`). 0→FORCE
  (`0x8974`), 1→PICK (`0x8e4f`), else EXIT.
- **WHO WILL TRY?** (indexedMsg **537**): both FORCE/PICK call the picker (`0x9c8`),
  alive-gated (`party_check_member_alive` `0x2086`).
- **FORCE (`0x8974`)** — confirmed by raw asm read (`static-asm-correction`):
  - `lock` = 5-bit field at door record `+0x630`.
  - `strain_len = clamp(0x12 − STR + 2·lock, 1, 0x12)`; forced `0x12` if welded.
    STR = `attributes[0]` (char `+0x4514`).
  - `effSTR = floor(STR · SP_cur / SP_max)` — **Spirit Points** (`+0x4404`/`+0x4406`),
    not HP.
  - `progress = clamp(avg(4× rng_next(effSTR)), 1, 0x12)`.
  - **SUCCESS ⟺ progress ≥ strain_len** (outcome 0). progress < len → failure (1).
  - ~1/50 (`rng_next(50)==0`) or `effSTR ≤ 0`: fatigue side-branch (drains SP,
    possible collapse via `rng_next(6)+6`).
- **PICK (`0x8e4f`)** — raw asm:
  - `skill = clamp(LEVEL + Skulduggery, 0, 0x5f)`. LEVEL = char `+0x440c`;
    Skulduggery = `skills[15]` (char `+0x452b`).
  - `tumblers = clamp(⌊lock/3⌋ + 1, 1, 6)`.
  - per-tumbler difficulty at BSS `0x5234[i]` (normal = 0; welded door forces one
    tumbler to `0x64` = impossible). Tumbler passes iff `rng_next(skill) > difficulty[i]`.
  - **SUCCESS ⟺ every tumbler passes** (outcome 0).
  - Failed pick (outcome 1) by a thief-class member (class `+0x4587` ∈ {3,6,0xd})
    → Skulduggery skill XP (`FUN_0000_54c0(0xf, member)`).
- **Outcome dispatch (both):** outcome+`0x841` → msg (540 success / 541 failure /
  542 jammed).
  - **success (0)** → `FUN_0000_891d` (clear `[0x4ee0+facing]`, record-update
    `0x84ce`, sound `0xc546(4)`) → door becomes passable.
  - **failure/jammed (1/2)** → 1/3 (`rng_next(3)==0`) → `FUN_0000_88af` (flip the
    `+0x240` edge bits → advances the door toward welded).
  - OPEN always consumes one `status_effects_decay_timers(1)` tick (`0x294e`).
  - Animation = real interactive bar (FORCE: strain glyphs filling to `progress`;
    PICK: per-tumbler pins); ENTER aborts. Wall-clock timing tuned by feel, not
    matched to DOSBox (per CLAUDE.md).

**MEDIUM residuals to pin in Stage 1** (do not block the design): per-tumbler
difficulty default (`0x5234` init via `0xc66d` — expected 0), exact `+0x240` bit
layout in `0x88af`/`0x891d`, and the `+0x630` lock decode. Confirm via the door-record
decoder + a behavioral read of save slot 1 (already parked at the menu).

> The static finding (`force-roll-formula`, `pick-roll-formula`,
> `outcomes-success-fail-jammed`, `door-open-on-success-88af`) had the outcome
> polarity, the success comparator, and the open-vs-fail routine roles **backwards**;
> they are superseded by `static-asm-correction-roll-and-outcome`. The live
> execution-breakpoint pass was blocked (MCP `dosbox_step`/breakpoints are `[STUB]`,
> TODO #Q-G); the raw `ndisasm` read is authoritative for control flow.

## 3. Architecture & components

Three-layer pattern (data → parser → viewer), following OPTIONS/REVIEW.

### `@wiz6/data`
- **`door-record.ts`** — schema for the type-7 door special-record: `lockStrength`
  (5-bit), `welded` (forward edge == 2), `edge`/facing.
- **`door-menu.ts`** — FORCE/PICK/EXIT strip layout (positions, header msg `0x7d2`,
  labels 534/535/536), WHO-WILL-TRY prompt (537), animation strings (538/539),
  outcome strings (540/541/542). Mirrors `options-menu.ts`.
- **`door-roll.ts`** — the confirmed roll constants + char-struct offsets
  (STR `+0x4514`, SP `+0x4404`/`+0x4406`, LEVEL `+0x440c`, Skulduggery `+0x452b`,
  class `+0x4587`).

### `@wiz6/parser` (pure, no I/O)
- **`door-record.ts`** — decoder: maze data → type-7 records per cell.
- **`door-open.ts`** — pure logic + nav state machine:
  - `detectDoorAtParty(block, party)` → door record or null.
  - `strainBarLength(str, lock, welded)`.
  - `forceAttempt(member, lock, welded, rng)` / `pickAttempt(member, lock, welded, rng)`
    → `'success' | 'failure' | 'jammed'`, consuming RNG in exact engine order.
  - menu/picker nav state machine.

### `@wiz6/viewer`
- **`compose-door-menu.ts`** (FORCE/PICK/EXIT, byte-exact) + the **WHO WILL TRY**
  picker (reuses the `compose-review-picker.ts` member-picker pattern).
- Strain/tumble **bar animation** component + result-text render.
- `MazeView` wiring: `dispatchOptionsCommand('open')` → door-open flow; a **session
  door-state overlay** (`Map<cellKey, openEdges/welded>`) layered over the read-only
  passability data so a successful roll makes the forward edge passable; party does
  not auto-step.

## 4. Data flow & side effects

The pure roll functions are deterministic given inputs + an injected RNG (unit-testable
without the emulator). `rng(n)` = `rng_next(n)` (0…n−1), consumed in the exact engine
order so a fixed RNG state reproduces the engine outcome bit-for-bit.

Side effects of an attempt:
- **success** → door forward edge cleared → recorded in the session door-state overlay
  → `MazeView` lets a subsequent ArrowUp walk through. No auto-step.
- **failed FORCE/PICK** → 1/3 chance the door advances toward **welded** (recorded in
  the overlay) — repeated botched attempts can permanently jam a door.
- **failed PICK** by a thief-class member → increment Skulduggery skill XP.
- every OPEN attempt consumes one turn-tick.

**Persistence:** session-scoped (resets on reload), matching that saves aren't yet
persisted (DISK stubbed). When save/load lands, the door overlay serializes with it.

## 5. Parity, fixtures & testing

Capture source: the reachable level-0 door at a blocked view (e.g. `128,131` facing
it). `build-state.ts` drives **dosbox-pure** (CLI harness — unaffected by the stubbed
MCP) via `state-catalog.ts` recipes. Fixtures use the **`maze-door-*`** prefix (check
collisions, per the #088 REVIEW lesson).

1. **Pure logic units (parser):** `forceAttempt`/`pickAttempt`/`strainBarLength` with
   injected deterministic RNG — thresholds, clamps, jammed, 1/50 fatigue, 1/3 damage.
   **Plus** a door-record *derivation* gate (decode `lock`/`welded` from real maze
   bytes, not hardcoded inputs).
2. **Pixel parity (gate), deterministic screens:** FORCE/PICK/EXIT strip (cursor on
   each), WHO WILL TRY picker, strain bar at a fixed length, tumbler frame, result text
   (success/failure/jammed). RNG-dependent frames captured via **`--mint`** (+ sidecar).
   Watch the blink-phase trap on the cursor (verify settle-invariance like OPTIONS).
3. **Roll-outcome parity (the byte-exact-roll gate):** a committed door-roll
   serialize-state records `(member stats, lock, welded, engine RNG state, engine
   outcome)`; the test feeds those into our pure roll fn (RNG seeded to the same state)
   and asserts the **outcome + RNG-draw count** match the engine.
4. **e2e walking gate (Playwright):** walk to the door → OPEN → FORCE → pick member →
   outcome → (on success) walk through. Pixel-assert the viewport at each step.
5. **Manual smoke:** `pnpm dev:viewer`, force/pick a door in the browser.

## 6. Staging plan

1. **Door-record decoder + roll logic** (data + parser, pure). Confirm MEDIUM residuals
   via save slot 1 + the decoder. Gate: tier-1 units + derivation gate + tier-3 roll
   parity.
2. **Shared glyph-core refactor** (tech-debt trigger — door-menu is the 4th glyph→index
   composer). Factor the shared core out of `compose-options-strip` /
   `compose-review-picker` / `wfont-render`. Gate: existing pixel-parity suites stay
   green (behavior-preserving).
3. **Menu + picker composers** (viewer). `compose-door-menu` + WHO WILL TRY picker;
   capture `maze-door-*` fixtures. Gate: tier-2 pixel parity.
4. **Animation + outcomes + door-state overlay.** Strain/tumble bar, result text,
   session door-state overlay (open/welded), turn cost, Skulduggery XP on failed pick;
   wire `dispatchOptionsCommand('open')`. Gate: tier-2 pixel parity + overlay units.
5. **Integration e2e + smoke.** Full walking gate + manual smoke. Gate: tier-4 e2e +
   manual.

## 7. Engineering-Notes / House-Rules proposals (Stage 5 — propose, don't build)

Per CLAUDE.md conventions, raise to Nate before writing:
- **EN: "Force a door and you may jam it forever"** — the 1/3 fail→weld mechanic.
- **EN: "You learn lockpicking only by failing"** — Skulduggery XP awarded on a failed
  pick, not a successful one.
- **EN:** the ~1/50 fatigue-collapse side-branch on FORCE.
- **HR: "No door-jam on failed force"** — QoL toggle (default = engine behavior).

## 8. Risks / open items

- The byte-exact-roll gate (tier 3) depends on reproducing the engine RNG stream from a
  committed serialize-state; if RNG-state capture proves fiddly, fall back to asserting
  formula inputs→threshold (deterministic) while documenting the gap.
- MEDIUM residuals (§2) must be pinned in Stage 1 before the roll logic is gated.
- Reaching the door for capture is confirmed feasible (level-0 reachable blocked view),
  but the exact recipe key-macro path is built in Stage 3.

---

## UPDATE 2026-06-11 (Stage-1 corrections, post-implementation)

**Door data corrected (RE bug found + fixed during Stage 1):**
- Forceable doors ARE type-7 special records (detection `0x95ba` → `0x9345`), confirmed
  by a call-site scan (`0x9345` has exactly one caller). The earlier "only 1 door on
  level 0" was a decoder bug: it read **bank-3 record 12** (one lock-0 entry door)
  instead of **record 0** (the entrance level — identity mapping level-id→bank3-rec).
- The entrance level (bank-3 rec 0) has **12 forceable doors**, locks 3–7. The door the
  user reaches via *turn-left, forward×3, turn-left* from the start gate is
  **global (124,121), lock 3, closed facing 2** (`recidx 24`); symmetric pair (130,121).
- **Reachability is fine** — ~10 reachable lock-3 doors in the starting cluster. The
  earlier "no reachable forceable door / defer e2e" concern was an artifact of the
  decoder bug and is **withdrawn**: the e2e walking gate (§5 tier 4) and meaningful
  (lock-3) fixtures are all feasible from the walkable entrance.
- Canonical fixture/demo door for Stages 3–5: **(124,121) lock 3** (reachable path
  above). RE: `docs/re/findings/maze-open-door-menu.json` `live-entrance-doors-bank3-rec0-CORRECTION`.

**Task 1.9 (RNG-replay roll parity) deferred:** capturing the engine RNG stream at a
roll requires driving the live engine to the door, which hit persistent harness
friction this session (boot-to-maze + committed-state `unserialize` both failed —
likely a patched-core mismatch). The roll logic is gated by **unit tests against the
asm-confirmed formulas** (FORCE/PICK in `door-open.test.ts`, 13 tests). The RNG-replay
gate is a *strengthening* to add when the live-drive tooling is reliable (cross-ref the
stubbed-debugger blocker, TODO #Q-G). Tracked as a Stage-1 follow-up, not a blocker.
