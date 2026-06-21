# Maze Per-Turn Status Tick — Design (#089)

**Date:** 2026-06-20
**Status:** Design approved; spec under review.
**Origin:** The deferred #089 follow-up "per-turn status tick on OPEN." Three RE passes (committed: `maze-status-effects.json`, `maze-per-turn-poison.json`) corrected the premise twice before pinning the real mechanic.

---

## Background: what the tick actually is (RE-corrected)

The "status tick" is **not** a 6-slot party-buff timer array (that DGROUP region, `0x4ec8`, is the 3D renderer's per-depth accumulator bank aliased by one loop — a phantom; see `maze-status-effects.json`). The real per-turn maze status mechanic, in `dungeon_main_loop` (wmaze 0x2abc), is:

- A 32-bit **turn counter** (`0x4f80`) increments once per maze-loop iteration (per action).
- **Staggered stamina drain** (deterministic, NOT an RNG roll): when `turn % 10 == 5`, member `(turn % 60) / 10` (slots 0–5) loses `(poison_amount + 1)` **stamina** (`0x4404`, clamped to ≥0), gated on that member's `status_level (0x4589) < 3`. Net: each member is drained once per 60 turns, staggered by 10.
- **All-dead → graveyard**: each iteration counts members with `status_level == 0` (alive); if 0 alive, sets game-state `8` (graveyard, winit 0xdf6).

Field facts (high confidence, `maze-per-turn-poison.json`):
- `0x4400` = **current HP**; `0x4404` = **current SP/stamina**. The tick drains **SP, not HP**, and does **not** kill.
- `poison_amount` = char byte `+0x458d` (on-disk pcfile **+0x1A5**); `status_level` = `+0x4589` (on-disk **+0x1A1**), 0=well, 1–2=afflicted, ≥3=dead/incapacitated.
- Death (status_level→≥3) is a **separate** path (`party_apply_status_effect` 0x6608), driven by combat/traps — **deferred** (no producer ported).

**Honest scope note:** with producers deferred (nothing poisons the party — combat/traps unported), this tick is **mostly dormant** in normal play. It is observable for an **imported/dev-set pre-afflicted character** (slow stamina drain as you act). This is a faithfulness/completeness piece + the shared "a turn passed" seam that future producers and other turn-consumers plug into.

---

## Scope

**In:** the turn counter, the staggered stamina-drain processor, the per-character affliction model (mapped from the pcfile), wiring into maze actions (step/rotate/OPEN), a minimal all-dead "party-wiped" stub, a dev/test hook, and gates.

**Out (deferred):** poison/affliction PRODUCERS (combat, traps, spell backfire); the real graveyard screen (winit 0xdf6); HP-damage/death paths; cast/use turn-consumers (they reuse the seam later).

---

## Components

### 1. Per-character affliction model (`@wiz6/data` + `@wiz6/parser`)

Add two fields to the character model:
- `statusLevel: number` — 0 = well, 1–2 = afflicted, ≥3 = dead/incapacitated. (pcfile on-disk **+0x1A1**.)
- `poisonAmount: number` — per-tick stamina-drain severity. (pcfile on-disk **+0x1A5**.)

Both are currently **unmodeled** in `packages/data/src/schemas/pcfile.ts` (which covers up to `conditions` @ +0x122 and a `status[16]` block, but not +0x1A1/+0x1A5). Decode them in the pcfile parser:
- For **imported** characters: read the two bytes from the on-disk record (`pcfileRaw` / the decode path that already retains the raw record per #082).
- For **created** characters: default both to 0 (well, no affliction).
- Add to the zod schema + the `Character`/`ActivePartyMember` types (optional, default 0) so the runtime party carries them.

Verify the on-disk offsets against `save_write_party_and_state` (0x20eb) field map + a real `pcfile.dbs` roster (cross-check `status_level`/`poison_amount` bytes for a known character).

### 2. Turn counter (game session)

Add `turnCounter: number` (u32) to `GameSessionSchema` (persisted in localStorage), default 0 on new game. Incremented once per maze **action**: a forward step, a rotate (left/right), and an OPEN attempt. (Future: cast/use increment it too.)

*Granularity decision:* "turn" = a discrete party action. Wizardry is turn-based; this is the faithful, testable model. The engine's exact increment cadence (per-loop-iteration incl. idle frames vs per-action) is RE-flagged uncertain — the per-action model is chosen deliberately; a live spot-check (drive the engine, read `0x4f80` across actions) confirms the cadence and is noted as an implementation step (non-blocking — per-action is correct for turn-based play regardless).

### 3. Status-tick pure function (`@wiz6/parser`, e.g. `maze/status-tick.ts`)

```
applyMazeTurnStatus(party, turnCounter) -> { party, allDead }
```
- If `turnCounter % 10 === 5`: `slot = Math.floor((turnCounter % 60) / 10)` (0–5); if `party[slot]` exists and is afflicted, drain `staminaCurrent = max(0, staminaCurrent - (poisonAmount + 1))`.
- **Affliction gate — pin at implementation:** the engine gates the drain on `status_level < 3`. Confirm from the disasm whether the drain ALSO requires `poisonAmount > 0` (so a *well* member with poisonAmount 0 doesn't lose 1 SP every 60 turns). The pure fn must match the engine exactly; the unit test encodes whichever the disasm shows. (Default assumption pending confirmation: drain only when `poisonAmount > 0 && statusLevel < 3`.)
- `allDead` = no party member has `statusLevel === 0`.
- Pure + total: returns a new party array; never mutates; safe on empty/short party.

### 4. Wiring (`MazeView`)

A single `advanceMazeTurn()` seam called after each maze action (step, rotate, OPEN):
1. Increment `session.turnCounter` (persist via the session store).
2. Run `applyMazeTurnStatus(party, turnCounter)`; apply the updated party (stamina) + persist; redraw the party panel (stamina bars).
3. If `allDead`: transition to a minimal **party-wiped stub** — set a game state / route that indicates the party is wiped (e.g. return to castle or a placeholder), with an inline `// TODO(#089)` for the real graveyard screen (winit 0xdf6, unported). Do NOT build the graveyard screen.

The OPEN path (the original ask) calls `advanceMazeTurn()` after the door attempt resolves — replacing the existing `// TODO: turn-tick` comment there.

### 5. Observability / dev hook

Extend the DEV maze-injection hook (`window.__WIZ6_E2E_MAZE__`, MazeView, DEV-only) to optionally set per-member `statusLevel`/`poisonAmount`, so an e2e/dev session can place a pre-afflicted member and watch the staggered drain. Pre-afflicted **imported** characters are the real (non-dev) observable path.

---

## Data flow

```
maze action (step / rotate / OPEN)
  → advanceMazeTurn(): turnCounter += 1  (persist)
  → applyMazeTurnStatus(party, turnCounter) → { party (stamina drained), allDead }
  → persist party + redraw party panel
  → if allDead → party-wiped stub (graveyard deferred)
```

---

## Testing

- **Pure-fn unit tests** (`status-tick.test.ts`): the staggered schedule (turn 5→slot0, 15→slot1, …, 55→slot5; no drain when `turn%10 !== 5`); the drain formula `(poisonAmount+1)` + clamp at 0; the `statusLevel < 3` gate (an incapacitated member at ≥3 isn't drained); the `poisonAmount > 0` gate (once pinned); `allDead` detection (all `statusLevel != 0`). One assertion per behavior.
- **pcfile decode test**: a roster with a known affliction byte decodes `statusLevel`/`poisonAmount` correctly (and created chars default to 0).
- **Component/e2e**: DEV-inject a pre-afflicted member, drive N maze actions, assert `staminaCurrent` drops on exactly the expected turns and the party panel updates; assert created/un-afflicted members never drain.
- **No regression**: existing maze movement/door/options suites stay green (the turn counter + tick are additive).

---

## Error handling / edge cases

- Empty or short party: the slot index may exceed the party size → no-op (guard).
- Stamina already 0: clamp keeps it 0 (no negative).
- `turnCounter` overflow: u32 wrap is harmless (the mod arithmetic is periodic); no special handling.
- Missing `staminaCurrent`/affliction fields on legacy sessions: default to 0 / treat as well (schema defaults).

---

## What this explicitly does NOT do

- No poison/affliction **producers** (combat, traps, spell backfire) — deferred; the tick is dormant until they land (observable only via imports/dev hook).
- No **HP** damage or death-from-poison — the tick drains SP only; death (status_level→≥3) is a separate deferred path.
- No real **graveyard screen** — all-dead is a minimal stub.
- No cast/use turn-consumers — they reuse the `advanceMazeTurn` seam when ported.
