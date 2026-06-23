# Maze Per-Turn Status Tick — Design (#089)

**Date:** 2026-06-20 (rev. 2026-06-22 after live verification)
**Status:** Design approved; spec under review (rev 2).
**Origin:** The deferred #089 follow-up "per-turn status tick on OPEN." Four RE passes + a **live verification** pass (committed: `maze-status-effects.json`, `maze-per-turn-poison.json`, `maze-regen-tick.json`, `maze-status-tick-live-verify.json`) corrected the premise repeatedly and then nailed every field/magnitude in the running engine.

---

## What the tick actually is (LIVE-VERIFIED)

The "status tick" is **not** a party-buff timer array (that DGROUP `0x4ec8` region is renderer scratch + a zone-8 quest latch — a phantom). The real mechanic, in `dungeon_main_loop` (wmaze 0x2abc), is a **per-character regen + drain tick on a staggered schedule**, every verified field confirmed by poke→walk→observe:

- A **turn counter** (`0x4f80`, u32). **Engine cadence:** increments once per `dungeon_main_loop` PASS — idle advances it 0; a single held move advances it 4–9 (NOT once per discrete action). Exact frame-loop cadence is unreproducible in an event-driven port (see "Turn model" below).
- When `turn % 10 == 5`, let `selected = (turn % 60) / 10` (0–5). For **each party member with `status_level < 3`**:
  1. **(selected member only) poison drain** — `stamina -= (poison_amount + 1)`, clamped ≥0. Runs FIRST.
  2. **regen tick (`FUN_0000_1c94`)**:
     - **conditions[10] decay** — each of the 10 condition bytes `-1` (floor 0; sentinels `0` and `0xFF` skipped). Reaching 0 clears that affliction.
     - **HP regen** — `hp += (vitRegenA − vitRegenB − vitRegenC)`, capped at `hpMax`; if `hp < 1`, the member dies (status_level→3, HP/SP zeroed). **Stock chars have `vitRegen = [0,0,0]` → HP regen is a no-op for them** (HP only moves for an imported/afflicted char whose VIT-triple is set).
     - **stamina-empty side-effect** — if `stamina < 1`: `stamina = 0` and set `conditions[2] = 6 + rng(6)` (exhaustion). Always runs (not gated on regen).
     - **mana regen (selected member only)** — for each of 6 schools: `mana[s] += rng(schoolSkill[s] + 1)`, capped at `manaMax[s]`.
     - **stamina regen is DISABLED in the maze tick** (it only runs on a separate rest/camp path — deferred). The maze tick only *drains* stamina.
- After the per-member work, **all-dead check**: count members with `status_level == 0`; if 0, the engine sets game-state `8` (graveyard, winit 0xdf6).

**Verified field map** (abs → on-disk pcfile offset = abs − 0x43e8; char-record stride 0x1b0, slot base `0x4400 + i*0x1b0`):
- `status_level` = `0x4589` → pcfile **+0x1A1** (0=well, 1–2=afflicted, ≥3=dead/incapacitated)
- `poison_amount` = `0x458d` → **+0x1A5** (per-tick drain severity)
- `vitRegenA/B/C` = `0x458a/0x458b/0x458c` → **+0x1A2/+0x1A3/+0x1A4** (HP regen triple)
- `conditions[10]` = `0x450a..0x4513` → **+0x122..+0x12B** (already modeled; `conditions[2]`=dead/exhaustion, `[3]`=paralyzed)
- HP `0x4400`/+0x18, HPmax `0x4402`/+0x1A, stamina `0x4404`/+0x1C, staminaMax `0x4406`/+0x1E (already modeled)
- schoolMana `0x4410`, schoolManaMax `0x4412` (already modeled as `schoolMana`/`schoolManaMax`); schoolSkill bytes `0x4504..0x4509`

---

## Scope

**In:** the turn counter (per-action model), the full per-turn tick pure function (staggered drain + conditions decay + HP regen + mana regen + stamina-empty side-effect + death), the per-character affliction model (`status_level`, `poison_amount`, `vitRegen[3]`, schoolSkill — decoded from the pcfile), wiring into maze actions (step/rotate/OPEN), a minimal all-dead "party-wiped" stub, and gates.

**Out (deferred):** affliction PRODUCERS (combat/traps/spell-backfire that SET poison/conditions/status); the rest/camp **stamina-regen** path; the real graveyard screen (winit 0xdf6); cast/use turn-consumers (reuse the seam later). Observable now via **imported/dev-set afflicted characters** (conditions decay, poison drain, exhaustion) — the un-afflicted baseline is a slow 1-stamina staggered drain.

---

## Components

### 1. Per-character affliction model (`@wiz6/data` + `@wiz6/parser`)

Add to the character model (optional, default 0):
- `statusLevel: number` (pcfile +0x1A1)
- `poisonAmount: number` (pcfile +0x1A5)
- `vitRegen: [number, number, number]` (pcfile +0x1A2/+0x1A3/+0x1A4)
- `schoolSkill: number[6]` (pcfile decode of `0x4504..0x4509` → on-disk +0x11C..+0x121) — *for mana regen; if a verified schoolSkill decode already exists in the schema, reuse it; else decode from `slot.raw`.*

Decode in `pcfileSlotToCharacter` (bridge) by reading `slot.raw[0x1A1/0x1A2/0x1A3/0x1A4/0x1A5]` (the established raw-read pattern, like `portraitIndex`); created chars default to 0. `conditions[10]`, HP/stamina/maxes, `schoolMana`/`schoolManaMax` are already modeled. Flow the new fields into `ActivePartyMember`.

### 2. Turn counter (game session)

Add `turnCounter: number` (u32) to `GameSessionSchema` (persisted), default 0.

**Turn model (decision):** increment **once per discrete maze action** (forward step, rotate left/right, OPEN; cast/use later). The engine's true cadence is per-loop-pass (4–9 per held move, 0 when idle) and is unreproducible in an event-driven port — so the port models a clean per-action turn and accepts a different *rate* than the engine. The staggered *math* (which slot drains on which `turn%10==5`) is preserved exactly; per CLAUDE.md ("don't aim for wall-clock parity; match the math, tune the rate to feel right"). If the per-action rate feels too slow in the manual smoke (afflictions barely move), a small fixed multiplier (e.g. +4 per action, approximating a held-move's loop passes) is an acceptable documented tuning knob.

### 3. Status-tick pure function (`@wiz6/parser`, `maze/status-tick.ts`)

```
applyMazeTurnStatus(roster, turnCounter, rng) -> { roster, allDead }
```
- If `turnCounter % 10 !== 5`: return `{ roster, allDead: <no member statusLevel===0> }` unchanged (still report allDead).
- Else `selected = Math.floor((turnCounter % 60) / 10)`; for each member `m` (index `i`) with `statusLevel < 3` (skip ≥3):
  1. If `i === selected`: `staminaCurrent = max(0, staminaCurrent - (poisonAmount + 1))`.
  2. conditions: each of the 10 bytes → `b===0 || b===0xFF ? b : max(0, b-1)`.
  3. HP: `hpCurrent = min(hpMax, hpCurrent + (vitRegen[0] - vitRegen[1] - vitRegen[2]))`; if `hpCurrent < 1` → `statusLevel = 3`, `hpCurrent = 0`, `staminaCurrent = 0` (death).
  4. stamina-empty: if `staminaCurrent < 1` → `staminaCurrent = 0`, `conditions[2] = 6 + rng.uniform(6)`.
  5. If `i === selected` (and not dead): for `s` in 0..5: `schoolMana[s] = min(schoolManaMax[s], schoolMana[s] + rng.uniform((schoolSkill[s] || 1) + 1 ... ))` — *match the engine's `rng(skill+1)` exactly, with the skill-0→1 bump; pin the inclusive/exclusive bound to the WichmannHill `uniform` convention used elsewhere.*
- `allDead` = no member has `statusLevel === 0`.
- Pure + total: returns a NEW roster (no mutation); safe on empty/short roster; injected `rng` for determinism in tests.

### 4. Wiring (`MazeView`)

An `advanceMazeTurn()` seam called after each maze action (step, rotate, OPEN):
1. `turnCounter += 1` (persist via `updateSession`).
2. `{ roster, allDead } = applyMazeTurnStatus(activePartyRef.current, turnCounter, rngRef.current)`; write back (`writeActiveParty` + update `activePartyRef`); redraw the party panel (`present()`).
3. If `allDead`: minimal **party-wiped stub** — set game state / navigate (e.g. to the castle) with an inline `// TODO(#089)` for the real graveyard screen. Do NOT build the graveyard screen.

The OPEN path (the original ask) calls `advanceMazeTurn()` after the door attempt resolves (replacing the existing `// TODO: turn-tick` at the resolution site). The free-roam movement handlers (step + rotate) call it after applying the move.

### 5. Observability / dev hook

Extend the e2e roster seed (`seedMember`) + (optionally) the DEV maze-injection hook to set `statusLevel`/`poisonAmount`/`vitRegen`/`conditions`, so an e2e/dev session can place an afflicted member and watch conditions decay / stamina drain / exhaustion. Imported afflicted characters are the real (non-dev) path.

---

## Data flow

```
maze action (step / rotate / OPEN)
  → advanceMazeTurn(): turnCounter += 1 (persist)
  → applyMazeTurnStatus(roster, turnCounter, rng) → { roster (stamina/hp/conditions/mana updated), allDead }
  → writeActiveParty + redraw party panel
  → if allDead → party-wiped stub (graveyard deferred)
```

---

## Testing

- **Pure-fn unit tests** (`status-tick.test.ts`, scripted rng): no-op when `turn%10 !== 5`; the staggered slot mapping (turn 5→slot0 … 55→slot5, 65→slot0); drain `(poisonAmount+1)` clamp at 0; `statusLevel ≥ 3` excluded from ALL per-member work; conditions decay −1 / floor 0 / `0xFF` & `0` sentinels skipped; HP regen `vitA−vitB−vitC` cap at hpMax and the `hp<1`→death path; stamina-empty→`conditions[2]=6+rng(6)`; mana regen only for the selected member + skill-0 bump + cap; `allDead` = all `statusLevel != 0`. One assertion per behavior.
- **pcfile decode test**: a crafted/real slot decodes `statusLevel`/`poisonAmount`/`vitRegen` from +0x1A1..+0x1A5 correctly; created chars default to 0.
- **Component/e2e**: seed an afflicted member (e.g. `conditions[1]=5`, `poisonAmount=3`), drive maze actions across a `turn%10==5` boundary, assert conditions decay + the selected member's stamina drops by `poison+1` + the panel updates; assert an un-afflicted member only sees the staggered −1 stamina.
- **No regression**: existing maze movement/door/options suites stay green (additive).

---

## Edge cases / error handling

- Empty/short roster or `selected ≥ roster.length` → no-op for the missing slot (guard).
- Stamina/HP already 0 → clamp keeps ≥0; HP<1 triggers death once.
- `turnCounter` u32 wrap → harmless (mod arithmetic is periodic).
- Legacy sessions missing `turnCounter`/affliction fields → schema defaults (0 / well).
- `rng` must be the session rng for live + a scripted rng for tests (determinism).

---

## What this explicitly does NOT do

- No affliction **producers** (combat/traps/spell-backfire) — deferred; observable via imports/dev hook.
- No **stamina regen** — disabled in the maze tick (rest/camp path deferred); the tick only drains stamina.
- No real **graveyard screen** — all-dead is a minimal stub.
- No exact engine **cadence** (per-loop-pass) — the port uses a per-action turn model; the staggered math is faithful, the rate is tuned.
- No cast/use turn-consumers — they reuse the `advanceMazeTurn` seam when ported.
