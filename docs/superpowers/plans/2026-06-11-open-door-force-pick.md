# OPEN-a-door: FORCE / PICK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the in-dungeon OPTIONS → OPEN command to the engine-faithful FORCE/PICK/EXIT door menu (member picker → STR/Skulduggery roll → success opens the door, failure can jam it).

**Architecture:** Three layers, mirroring the shipped OPTIONS-menu / REVIEW-picker work. `@wiz6/data` holds layout + roll constants; `@wiz6/parser` holds the pure door-record decoder, roll functions, and nav state machines (RNG injected for determinism); `@wiz6/viewer` holds byte-exact composers + a session door-state overlay wired into `MazeView`. Roll outcomes are gated against the engine via RNG-state replay using the existing `WichmannHill` (the engine's `rng_next_bounded`).

**Tech Stack:** TypeScript ESM (pnpm monorepo), zod schemas, Vitest (unit + pixel-parity), Playwright (e2e), `tools/libretro/build-state.ts` + `tools/dosbox/state-catalog.ts` (dosbox-pure fixtures).

**RE basis:** `docs/re/findings/maze-open-door-menu.json` (esp. `static-asm-correction-roll-and-outcome`). Spec: `docs/superpowers/specs/2026-06-11-open-door-force-pick-design.md`.

**Confirmed mechanic (reference for all tasks):**
- FORCE: `strain_len = clamp(18 − STR + 2·lock, 1, 18)` (=18 if welded); `effSTR = floor(STR · SP_cur / SP_max)`; `progress = clamp(⌊(Σ 4× rng(effSTR))/4⌋, 1, 18)`. **Success ⟺ progress ≥ strain_len.** A ~1/50 (`rng(50)==0`) or `effSTR≤0` fatigue branch drains SP — modeled as a side-effect, not gating the open.
- PICK: `skill = clamp(level + skills[15], 0, 95)`; `tumblers = clamp(⌊lock/3⌋+1, 1, 6)`; each tumbler passes iff `rng(skill) > 0` (welded forces one tumbler impossible). **Success ⟺ all tumblers pass.**
- Outcome 0 = success → door opens (passable; no auto-step). Outcome 1/2 (fail/jammed) → 1/3 (`rng(3)==0`) chance the door advances toward welded. Failed PICK by class ∈ {3,6,13} grants Skulduggery XP. OPEN always costs one turn-tick.

---

## File structure

**Create:**
- `packages/data/src/maze/door-menu.ts` — FORCE/PICK/EXIT strip layout + msg ids.
- `packages/data/src/maze/door-roll.ts` — roll constants (clamps, fatigue/jam odds, skill cap, Skulduggery skill index, thief class set).
- `packages/parser/src/maze/door-record.ts` — decode type-7 door records from a `MazeBlock`/work buffer.
- `packages/parser/src/maze/door-open.ts` — `detectDoorAtParty`, `strainBarLength`, `forceAttempt`, `pickAttempt`, FORCE/PICK menu nav.
- `packages/viewer/src/pages/game/compose-door-menu.ts` — byte-exact FORCE/PICK/EXIT strip.
- `packages/viewer/src/pages/game/glyph-core.ts` — shared index-emitting glyph core (Stage 2 refactor).
- Tests alongside each (see tasks).

**Modify:**
- `packages/data/src/index.ts`, `packages/parser/src/maze/index.ts`, `packages/parser/src/index.ts` — re-exports.
- `packages/viewer/src/pages/game/compose-options-strip.ts`, `compose-review-picker.ts`, `packages/parser/src/formats/wfont-render.ts` — adopt `glyph-core` (Stage 2).
- `packages/viewer/src/pages/game/MazeView.tsx` — `dispatchOptionsCommand('open')` flow + door-state overlay + keydown wiring.
- `tools/dosbox/state-catalog.ts` — `maze-door-*` recipes.

---

## Stage 1: Door-record decoder + pure roll logic

**Goal:** Decode type-7 door records from maze data and implement the FORCE/PICK roll as pure, RNG-injected functions. **Gate:** unit tests (incl. a derivation gate) + roll-outcome parity vs a committed engine state.

### Task 1.1: Confirm the MEDIUM residuals against save slot 1

DOSBox save slot 1 is parked at the FORCE/PICK/EXIT menu in front of a real door. Use the working MCP read tools (no breakpoints needed) to pin the door-record layout before coding the decoder.

- [ ] **Step 1: Locate the special-record table + read the test door's fields**

Use `mcp__wiz6__dosbox_map_segments` then `mcp__wiz6__dosbox_read_memory` on save slot 1:
- Read the maze-table base pointer at DGROUP `0x4fa8` (the `[0x4fa8]` used by `0x88af`/`0x90df`).
- Read party cell: z=`0x4f9c`, y=`0x4f9e`, x=`0x4fa0`, facing=`0x4f9a`.
- From the record base, read the per-record `+0x360` type byte (expect 7), the `+0x240` wall-plane word (decode the 2-bit field at `facing` → expect 1, i.e. closed-not-welded), and the `+0x630` byte (the 5-bit lock).

Record the observed `(lock, type, edge)` in `docs/re/findings/maze-open-door-menu.json` as a `live-` finding (confidence high; it's a static memory read, allowed). This confirms: (a) `+0x630` is lock-strength 0..31, (b) edge-code semantics (1=closed, 2=welded), (c) the record indexing.

- [ ] **Step 2: Commit the finding**

```bash
git add docs/re/findings/maze-open-door-menu.json
git commit -m "re(#089): live-confirm door record layout (lock/type/edge) from save slot 1"
```

### Task 1.2: Door-record schema (`@wiz6/data`)

**Files:**
- Create: `packages/data/src/schemas/door-record.ts`
- Modify: `packages/data/src/index.ts`
- Test: `packages/data/tests/schemas/door-record.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { DoorRecordSchema } from '../../src/schemas/door-record.js';

describe('DoorRecordSchema', () => {
  it('accepts a closed door record', () => {
    const r = { gx: 128, gy: 131, facing: 1, lockStrength: 12, welded: false };
    expect(DoorRecordSchema.parse(r)).toEqual(r);
  });
  it('rejects lockStrength out of 0..31', () => {
    expect(() => DoorRecordSchema.parse({ gx: 0, gy: 0, facing: 0, lockStrength: 32, welded: false })).toThrow();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @wiz6/data test door-record`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the schema**

```typescript
import { z } from 'zod';

/** A type-7 forceable/pickable door, decoded from the maze special-record table.
 *  `facing` 0..3 is the edge the door sits on (N/E/S/W). `welded` = engine edge
 *  code 2 (the "jammed" state neither FORCE nor PICK can open). lockStrength is
 *  the 5-bit field at record +0x630 (0..31). */
export const DoorRecordSchema = z.object({
  gx: z.number().int(),
  gy: z.number().int(),
  facing: z.number().int().min(0).max(3),
  lockStrength: z.number().int().min(0).max(31),
  welded: z.boolean(),
});
export type DoorRecord = z.infer<typeof DoorRecordSchema>;
```

- [ ] **Step 4: Re-export from `packages/data/src/index.ts`**

Add: `export { DoorRecordSchema, type DoorRecord } from './schemas/door-record.js';`

- [ ] **Step 5: Run test, verify it passes**

Run: `pnpm --filter @wiz6/data test door-record`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/schemas/door-record.ts packages/data/src/index.ts packages/data/tests/schemas/door-record.test.ts
git commit -m "feat(#089): DoorRecord schema"
```

### Task 1.3: Roll constants (`@wiz6/data`)

**Files:**
- Create: `packages/data/src/maze/door-roll.ts`
- Modify: `packages/data/src/index.ts`
- Test: `packages/data/tests/maze/door-roll.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { DOOR_ROLL } from '../../src/maze/door-roll.js';

describe('DOOR_ROLL constants', () => {
  it('matches the asm-confirmed values', () => {
    expect(DOOR_ROLL.strainMax).toBe(18);       // 0x12
    expect(DOOR_ROLL.skillCap).toBe(95);         // 0x5f
    expect(DOOR_ROLL.maxTumblers).toBe(6);
    expect(DOOR_ROLL.skulduggerySkillIndex).toBe(15);
    expect(DOOR_ROLL.fatigueOdds).toBe(50);      // rng(50)==0
    expect(DOOR_ROLL.jamOdds).toBe(3);           // rng(3)==0
    expect(DOOR_ROLL.thiefClasses).toEqual([3, 6, 13]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @wiz6/data test door-roll`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```typescript
/** Roll constants for the OPEN-door FORCE/PICK mechanic, all confirmed by raw
 *  disassembly of wmaze.ovr (docs/re/findings/maze-open-door-menu.json,
 *  static-asm-correction-roll-and-outcome). */
export const DOOR_ROLL = {
  /** strain_len / progress clamp ceiling (0x12). */
  strainMax: 18,
  /** PICK skill clamp ceiling (0x5f) on level + Skulduggery. */
  skillCap: 95,
  /** tumbler-count clamp ceiling. */
  maxTumblers: 6,
  /** Skulduggery skill index in character.skills[]. */
  skulduggerySkillIndex: 15,
  /** FORCE fatigue side-branch fires when rng(50) === 0. */
  fatigueOdds: 50,
  /** A failed FORCE/PICK advances the door toward welded when rng(3) === 0. */
  jamOdds: 3,
  /** Classes that gain Skulduggery XP from a failed pick (Thief/Rogue/Ninja). */
  thiefClasses: [3, 6, 13] as const,
} as const;
```

- [ ] **Step 4: Re-export from `packages/data/src/index.ts`**

Add: `export { DOOR_ROLL } from './maze/door-roll.js';`

- [ ] **Step 5: Run test, verify it passes / Step 6: Commit**

```bash
git add packages/data/src/maze/door-roll.ts packages/data/src/index.ts packages/data/tests/maze/door-roll.test.ts
git commit -m "feat(#089): door roll constants"
```

### Task 1.4: Door-record decoder (`@wiz6/parser`)

**Files:**
- Create: `packages/parser/src/maze/door-record.ts`
- Modify: `packages/parser/src/maze/index.ts`, `packages/parser/src/index.ts`
- Test: `packages/parser/tests/maze/door-record.test.ts`

The special records live in a table separate from the per-cell `special4`/`orient2`
planes the current `maze-block.ts` decodes. Per the finding, a per-cell special-index
(`+0x6c0`) selects a record; each record has type `+0x360`, wall-plane `+0x240`, lock
`+0x630`. Use the exact layout pinned in Task 1.1.

- [ ] **Step 1: Write the failing test (with a fixture-derived door)**

```typescript
import { describe, it, expect } from 'vitest';
import { decodeDoorRecords } from '../../src/maze/door-record.js';
import { expandMazeData } from '../../src/maze/maze-data.js';
import { readFileSync } from 'node:fs';

describe('decodeDoorRecords', () => {
  it('finds the level-0 test door at the cell pinned in Task 1.1', () => {
    const file = new Uint8Array(readFileSync('test-fixtures/original/mazedata.ega'));
    const wb = expandMazeData(file); // existing decoder
    const doors = decodeDoorRecords(wb, /* level */ 0);
    // Coordinates + lock from Task 1.1's live read (FILL with the confirmed values).
    const d = doors.find((x) => x.gx === 128 && x.gy === 131);
    expect(d).toBeDefined();
    expect(d!.welded).toBe(false);
    expect(d!.lockStrength).toBeGreaterThan(0);
  });
});
```

> NOTE to implementer: replace the coordinates/expected lock with the exact values
> recorded in Task 1.1 before running. The point of this test is the *derivation*
> (real bytes → DoorRecord), per the "hardcoded fixtures hide derivation bugs" rule.

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @wiz6/parser test door-record`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the decoder**

Implement `decodeDoorRecords(wb, level): DoorRecord[]` by walking the special-record
table at the layout pinned in Task 1.1: for each record whose `+0x360` type byte === 7,
read its cell coords, the 2-bit `+0x240` edge code at the door facing (1=closed,
2=welded), and the 5-bit `+0x630` lock. Reuse the `getBits(buf, base, cell, nbits)`
helper from `maze-block.ts` for the bitfield reads. Return `DoorRecord[]`.

```typescript
import type { DoorRecord } from '@wiz6/data';
import type { MazeWorkBuffer } from './maze-data.js';
import { getBits } from './maze-block.js';

const REC = { type: 0x360, wallPlane: 0x240, lock: 0x630 } as const;

export function decodeDoorRecords(wb: MazeWorkBuffer, level: number): DoorRecord[] {
  // Implementation per the Task 1.1-pinned table layout. Pseudocode:
  //   for each record idx with typeByte(idx) === 7:
  //     resolve (gx,gy,facing) for the record's cell
  //     edge = getBits(plane, REC.wallPlane, recCell, 2) at facing
  //     welded = edge === 2
  //     lock = getBits(plane, REC.lock, recIdx, 5)
  //     push { gx, gy, facing, lockStrength: lock, welded }
  const out: DoorRecord[] = [];
  // ... concrete walk filled in against the Task 1.1 layout ...
  return out;
}
```

> The exact table-walk is gated by Task 1.1; the implementer writes it concretely
> from the pinned offsets. Keep it pure (input = work buffer, output = records).

- [ ] **Step 4: Run test, verify it passes**

Run: `pnpm --filter @wiz6/parser test door-record`
Expected: PASS (the level-0 door decodes with the confirmed lock).

- [ ] **Step 5: Re-export + commit**

Add exports to `packages/parser/src/maze/index.ts` and `packages/parser/src/index.ts`.

```bash
git add packages/parser/src/maze/door-record.ts packages/parser/src/maze/index.ts packages/parser/src/index.ts packages/parser/tests/maze/door-record.test.ts
git commit -m "feat(#089): decode type-7 door records from maze data"
```

### Task 1.5: `strainBarLength` (pure)

**Files:**
- Create: `packages/parser/src/maze/door-open.ts`
- Test: `packages/parser/tests/maze/door-open.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { strainBarLength } from '../../src/maze/door-open.js';

describe('strainBarLength', () => {
  it('= clamp(18 - STR + 2*lock, 1, 18)', () => {
    expect(strainBarLength(18, 0, false)).toBe(1);   // 18-18+0=0 -> clamp 1
    expect(strainBarLength(10, 5, false)).toBe(18);  // 18-10+10=18
    expect(strainBarLength(15, 2, false)).toBe(7);   // 18-15+4=7
  });
  it('forces 18 when welded', () => {
    expect(strainBarLength(18, 0, true)).toBe(18);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `pnpm --filter @wiz6/parser test door-open`

- [ ] **Step 3: Implement**

```typescript
import { DOOR_ROLL } from '@wiz6/data';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Engine strain-bar length: clamp(18 - STR + 2*lock, 1, 18); 18 if welded.
 *  (wmaze 0x8b6c..0x8ba7.) */
export function strainBarLength(str: number, lock: number, welded: boolean): number {
  if (welded) return DOOR_ROLL.strainMax;
  return clamp(DOOR_ROLL.strainMax - str + 2 * lock, 1, DOOR_ROLL.strainMax);
}
```

- [ ] **Step 4: Run, verify PASS / Step 5: Commit**

```bash
git add packages/parser/src/maze/door-open.ts packages/parser/tests/maze/door-open.test.ts
git commit -m "feat(#089): strainBarLength"
```

### Task 1.6: `forceAttempt` (pure, RNG-injected)

**Files:**
- Modify: `packages/parser/src/maze/door-open.ts`
- Test: `packages/parser/tests/maze/door-open.test.ts`

Use a deterministic RNG stub (`{ uniform }`) implementing the `Rng` interface so the
4 progress draws + the fatigue draw are reproducible.

- [ ] **Step 1: Write the failing test**

```typescript
import { forceAttempt, type ForceMember } from '../../src/maze/door-open.js';

// Scripted RNG: returns queued values, asserting the requested bound.
function scriptRng(seq: Array<[number, number]>) {
  let i = 0;
  return { uniform(n: number) { const [bound, val] = seq[i++]!; if (bound !== n) throw new Error(`bound ${n}!=${bound}`); return val; } };
}

const strong: ForceMember = { str: 18, spCur: 100, spMax: 100, level: 1, skulduggery: 0, class: 0 };

describe('forceAttempt', () => {
  it('SUCCESS when progress >= strain_len', () => {
    // strong vs lock 0: strain_len=1, effSTR=18; first the fatigue rng(50) (nonzero
    // -> skip collapse), then 4x rng(18) averaged. Use rolls 17,17,17,17 -> progress 17 >= 1.
    const rng = scriptRng([[50, 7], [18, 17], [18, 17], [18, 17], [18, 17]]);
    expect(forceAttempt(strong, 0, false, rng)).toBe('success');
  });
  it('FAILURE when progress < strain_len', () => {
    // weak member vs high lock: strain_len high, low progress.
    const weak: ForceMember = { str: 3, spCur: 100, spMax: 100, level: 1, skulduggery: 0, class: 0 };
    const rng = scriptRng([[50, 7], [3, 0], [3, 0], [3, 0], [3, 0]]); // effSTR=3, progress clamp->1
    expect(forceAttempt(weak, 10, false, rng)).toBe('failure'); // strain_len=18-3+20->18
  });
  it('JAMMED when welded', () => {
    const rng = scriptRng([[50, 7], [18, 17], [18, 17], [18, 17], [18, 17]]);
    expect(forceAttempt(strong, 0, true, rng)).toBe('jammed');
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement** (RNG order exactly matches the asm: fatigue draw `rng(50)`, then 4× `rng(effSTR)`)

```typescript
import type { Rng } from '@wiz6/data';

export interface ForceMember {
  str: number; spCur: number; spMax: number;
  level: number; skulduggery: number; class: number;
}
export type DoorOutcome = 'success' | 'failure' | 'jammed';

/** FORCE roll (wmaze 0x8974). effSTR = STR*SP_cur/SP_max; progress =
 *  clamp(avg(4x rng(effSTR)),1,18); success iff progress >= strain_len.
 *  welded -> 'jammed'. The ~1/50 fatigue branch is a SP side-effect (handled by
 *  the caller via the returned outcome + a separate SP-drain step); here it only
 *  consumes the rng(50) draw to keep the stream aligned with the engine. */
export function forceAttempt(m: ForceMember, lock: number, welded: boolean, rng: Rng): DoorOutcome {
  const len = strainBarLength(m.str, lock, welded);
  const effSTR = m.spMax > 0 ? Math.floor((m.str * m.spCur) / m.spMax) : 0;
  rng.uniform(DOOR_ROLL.fatigueOdds); // fatigue draw (consumed; SP side-effect TODO Stage 4)
  let sum = 0;
  for (let i = 0; i < 4; i++) sum += rng.uniform(Math.max(1, effSTR));
  const progress = clamp(Math.floor(sum / 4), 1, DOOR_ROLL.strainMax);
  if (welded) return 'jammed';
  return progress >= len ? 'success' : 'failure';
}
```

> NOTE: the engine guards `rng(effSTR)` with `effSTR>0`; when `effSTR<=0` it takes the
> collapse branch. Model `Math.max(1, effSTR)` only to avoid `rng(0)`; the collapse
> path (SP=0) is rare and handled as a Stage-4 side-effect. Document this in the fn.

- [ ] **Step 4: Run, verify PASS / Step 5: Commit**

```bash
git add packages/parser/src/maze/door-open.ts packages/parser/tests/maze/door-open.test.ts
git commit -m "feat(#089): forceAttempt roll (RNG-injected)"
```

### Task 1.7: `pickAttempt` (pure, RNG-injected)

**Files:** Modify `door-open.ts`; test in `door-open.test.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
import { pickAttempt, type PickMember } from '../../src/maze/door-open.js';

const thief: PickMember = { level: 5, skulduggery: 20, class: 3 };

describe('pickAttempt', () => {
  it('SUCCESS iff every tumbler rolls rng(skill) > 0', () => {
    // lock 6 -> tumblers = 6/3+1 = 3; skill = 5+20 = 25. All rolls > 0 -> success.
    const rng = scriptRng([[25, 10], [25, 5], [25, 3]]);
    expect(pickAttempt(thief, 6, false, rng)).toBe('success');
  });
  it('FAILURE if any tumbler rolls 0', () => {
    const rng = scriptRng([[25, 10], [25, 0], [25, 3]]);
    expect(pickAttempt(thief, 6, false, rng)).toBe('failure');
  });
  it('JAMMED when welded', () => {
    const rng = scriptRng([[25, 10], [25, 5], [25, 3]]);
    expect(pickAttempt(thief, 6, true, rng)).toBe('jammed');
  });
  it('clamps skill to 95 and tumblers to 6', () => {
    const sup: PickMember = { level: 90, skulduggery: 90, class: 3 }; // skill -> 95
    const rng = scriptRng([[95,1],[95,1],[95,1],[95,1],[95,1],[95,1]]); // lock 30 -> tumblers clamp 6
    expect(pickAttempt(sup, 30, false, rng)).toBe('success');
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement**

```typescript
export interface PickMember { level: number; skulduggery: number; class: number; }

/** PICK roll (wmaze 0x8e4f). skill = clamp(level + skulduggery, 0, 95);
 *  tumblers = clamp(floor(lock/3)+1, 1, 6); each tumbler passes iff rng(skill) > 0
 *  (normal difficulty 0); success iff all pass. welded -> 'jammed'. */
export function pickAttempt(m: PickMember, lock: number, welded: boolean, rng: Rng): DoorOutcome {
  const skill = clamp(m.level + m.skulduggery, 0, DOOR_ROLL.skillCap);
  const tumblers = clamp(Math.floor(lock / 3) + 1, 1, DOOR_ROLL.maxTumblers);
  let allPass = true;
  for (let i = 0; i < tumblers; i++) {
    if (rng.uniform(skill) <= 0) allPass = false;
  }
  if (welded) return 'jammed';
  return allPass ? 'success' : 'failure';
}
```

> NOTE: keep the loop running all tumblers even after a failure — the engine draws
> one rng per tumbler regardless, so the RNG stream must consume all `tumblers` draws
> (matters for the Task 1.9 state-replay gate).

- [ ] **Step 4: Run, verify PASS / Step 5: Commit**

```bash
git add packages/parser/src/maze/door-open.ts packages/parser/tests/maze/door-open.test.ts
git commit -m "feat(#089): pickAttempt roll (RNG-injected)"
```

### Task 1.8: `detectDoorAtParty` (pure)

**Files:** Modify `door-open.ts`; test in `door-open.test.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
import { detectDoorAtParty } from '../../src/maze/door-open.js';

describe('detectDoorAtParty', () => {
  const doors = [{ gx: 128, gy: 131, facing: 1, lockStrength: 12, welded: false }];
  it('returns the door when the party faces it', () => {
    expect(detectDoorAtParty(doors, { gx: 128, gy: 131, facing: 1 })?.lockStrength).toBe(12);
  });
  it('returns null when facing elsewhere or no door', () => {
    expect(detectDoorAtParty(doors, { gx: 128, gy: 131, facing: 0 })).toBeNull();
    expect(detectDoorAtParty(doors, { gx: 0, gy: 0, facing: 1 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify FAIL / Step 3: Implement**

```typescript
import type { DoorRecord } from '@wiz6/data';

export interface PartyPos { gx: number; gy: number; facing: number; }

/** Find a forceable/pickable door at the party's cell + facing (wmaze 0x95ba
 *  type-7 branch). Returns null if there is none. */
export function detectDoorAtParty(doors: readonly DoorRecord[], party: PartyPos): DoorRecord | null {
  return doors.find((d) => d.gx === party.gx && d.gy === party.gy && d.facing === party.facing) ?? null;
}
```

- [ ] **Step 4: Run, verify PASS / Step 5: Commit**

```bash
git add packages/parser/src/maze/door-open.ts packages/parser/tests/maze/door-open.test.ts
git commit -m "feat(#089): detectDoorAtParty"
```

### Task 1.9: Roll-outcome parity vs engine (the byte-exact gate)

**Files:**
- Create: `tools/parity/fixtures/engine/maze-door-roll.json` (committed: member stats + lock + welded + engine RNG stream state + observed engine outcome).
- Test: `packages/parser/tests/maze/door-roll-parity.test.ts`

- [ ] **Step 1: Capture the engine roll state**

Drive dosbox-pure (via a temporary `build-state.ts` run or the live read tools) to perform a FORCE and a PICK on the level-0 door; capture, for each: the chosen member's `(str, spCur, spMax, level, skulduggery, class)`, the door `(lock, welded)`, the RNG stream `[s1,s2,s3]` immediately before the roll (DGROUP rng-state read), and the engine's resulting outcome (read the result msg / door state). Save to `maze-door-roll.json` (an array of cases).

- [ ] **Step 2: Write the parity test**

```typescript
import { describe, it, expect } from 'vitest';
import { WichmannHill } from '@wiz6/data';
import { forceAttempt, pickAttempt } from '../../src/maze/door-open.js';
import cases from '../../../../tools/parity/fixtures/engine/maze-door-roll.json';

describe('door-roll parity vs engine', () => {
  for (const c of cases as any[]) {
    it(`${c.action} matches engine outcome`, () => {
      const rng = new WichmannHill(c.rng[0], c.rng[1], c.rng[2]);
      const out = c.action === 'force'
        ? forceAttempt(c.member, c.lock, c.welded, rng)
        : pickAttempt(c.member, c.lock, c.welded, rng);
      expect(out).toBe(c.outcome);
    });
  }
});
```

- [ ] **Step 3: Run, verify PASS**

Run: `pnpm --filter @wiz6/parser test door-roll-parity`
Expected: PASS (our RNG-seeded roll reproduces the engine outcome).

> If a case mismatches, the RNG draw ORDER or count is off — re-check against the asm
> (fatigue draw first for FORCE; one draw per tumbler for PICK). Do NOT widen — fix the
> order. If RNG-state capture proves infeasible, fall back to asserting the
> deterministic `strainBarLength` + tumbler-count and document the gap in the test
> docstring (per the spec §8 risk).

- [ ] **Step 4: Commit**

```bash
git add tools/parity/fixtures/engine/maze-door-roll.json packages/parser/tests/maze/door-roll-parity.test.ts
git commit -m "test(#089): door-roll outcome parity vs engine (RNG-state replay)"
```

---

## Stage 2: Shared glyph-core refactor

**Goal:** Factor the duplicated glyph→palette-index math (in `compose-options-strip`, `compose-review-picker`, `wfont-render`) into one module so `compose-door-menu` is a 4th *consumer*, not a 4th *copy*. **Gate:** all existing pixel-parity suites stay green (proves behavior-preserving).

### Task 2.1: Extract `glyph-core.ts`

**Files:**
- Create: `packages/viewer/src/pages/game/glyph-core.ts`
- Test: `packages/viewer/tests/game/glyph-core.test.ts`

- [ ] **Step 1: Write the failing characterization test**

```typescript
import { describe, it, expect } from 'vitest';
import { drawGlyph4bpp, drawGlyph1bpp } from '../../src/pages/game/glyph-core.js';
import wfont0 from '../../src/data/wfont0.json';
import wfont3 from '../../src/data/wfont3.json';

describe('glyph-core', () => {
  it('drawGlyph4bpp writes the file pixel value as the palette index', () => {
    const W = 8, H = 8; const buf = new Uint8Array(W * H);
    drawGlyph4bpp(buf, W, H, 0, 0, 'A'.charCodeAt(0), wfont3.glyphs);
    // 'A' has at least one non-zero pixel
    expect(buf.some((v) => v !== 0)).toBe(true);
  });
  it('drawGlyph1bpp inverse fills bg then strokes', () => {
    const W = 8, H = 8; const buf = new Uint8Array(W * H);
    drawGlyph1bpp(buf, W, H, 0, 0, ' '.charCodeAt(0), 0, 5, true, wfont0.glyphs);
    expect(buf.every((v) => v === 5)).toBe(true); // blank glyph -> all bg
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement** — lift `drawGlyph4bpp` / `drawGlyph1bpp` verbatim from `compose-options-strip.ts`, generalizing the hard-coded `STRIP_W`/`STRIP_H` into `width`/`height` params and taking the glyph tables as args:

```typescript
const CELL = 8;
export function drawGlyph4bpp(buf: Uint8Array, width: number, height: number, px: number, py: number, code: number, glyphs: number[][]): void { /* options-strip body, width/height params */ }
export function drawGlyph1bpp(buf: Uint8Array, width: number, height: number, px: number, py: number, code: number, stroke: number, bg: number, inverse: boolean, glyphs: number[][]): void { /* options-strip body, width/height params */ }
```

- [ ] **Step 4: Run, verify PASS / Step 5: Commit**

```bash
git add packages/viewer/src/pages/game/glyph-core.ts packages/viewer/tests/game/glyph-core.test.ts
git commit -m "refactor(#089): extract shared glyph-core (index-emitting)"
```

### Task 2.2: Adopt `glyph-core` in the existing composers

**Files:** Modify `compose-options-strip.ts`, `compose-review-picker.ts` (and, if it shares the math, `packages/parser/src/formats/wfont-render.ts`).

- [ ] **Step 1: Replace the local `drawGlyph*` in `compose-options-strip.ts`** with imports from `glyph-core`, passing `STRIP_W, STRIP_H` and `WFONT0.glyphs`/`WFONT3.glyphs`.

- [ ] **Step 2: Run the OPTIONS parity suite, verify GREEN (behavior-preserving)**

Run: `pnpm --filter @wiz6/viewer test options-strip-parity`
Expected: PASS (byte-identical output).

- [ ] **Step 3: Repeat for `compose-review-picker.ts`; run its parity suite**

Run: `pnpm --filter @wiz6/viewer test review-picker`
Expected: PASS.

- [ ] **Step 4: Run the full viewer suite to confirm no regression**

Run: `pnpm --filter @wiz6/viewer test`
Expected: PASS (1033+).

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/game/compose-options-strip.ts packages/viewer/src/pages/game/compose-review-picker.ts
git commit -m "refactor(#089): options/review composers consume glyph-core"
```

---

## Stage 3: Menu + picker composers (byte-exact)

**Goal:** Render the FORCE/PICK/EXIT strip + the WHO WILL TRY picker byte-exact vs engine fixtures. **Gate:** pixel parity.

### Task 3.1: Door-menu layout constants (`@wiz6/data`)

**Files:**
- Create: `packages/data/src/maze/door-menu.ts`; Modify `index.ts`; Test `packages/data/tests/maze/door-menu.test.ts`.

- [ ] **Step 1: Write the failing test** — assert the 3 labels, header, strip rect, and per-cell origins (initial estimates; corrected against fixtures in 3.3).

```typescript
import { DOOR_MENU } from '../../src/maze/door-menu.js';
describe('DOOR_MENU', () => {
  it('has FORCE/PICK/EXIT labels and the PARTY OPTIONS header', () => {
    expect(DOOR_MENU.labels).toEqual(['FORCE', 'PICK', 'EXIT']);
    expect(DOOR_MENU.header).toBe('PARTY OPTIONS');
    expect(DOOR_MENU.strip).toEqual({ x: 0, y: 144, w: 160, h: 40 });
  });
});
```

- [ ] **Step 2: Run FAIL / Step 3: Implement** (mirror `options-menu.ts`; labels are a horizontal row — origins to be pinned in 3.3 from the fixture).

```typescript
/** FORCE/PICK/EXIT door menu — same bottom strip as PARTY OPTIONS, single row.
 *  Labels = indexedMessages 534/535/536; header msg 0x7d2. Cell origins are
 *  initial estimates corrected against maze-door-menu-*.idx.gz in Stage 3. */
export const DOOR_MENU = {
  labels: ['FORCE', 'PICK', 'EXIT'] as const,
  header: 'PARTY OPTIONS',
  strip: { x: 0, y: 144, w: 160, h: 40 },
  headerAt: { x: 24, y: 145 },
  cellAt: [ { x: 8, y: 168 }, { x: 64, y: 168 }, { x: 112, y: 168 } ],
  headerPalette: 9,
  hilite: { paletteIndex: 5, coloredText: false, blinks: false },
} as const;
```

- [ ] **Step 4: PASS / Step 5: Commit**

```bash
git add packages/data/src/maze/door-menu.ts packages/data/src/index.ts packages/data/tests/maze/door-menu.test.ts
git commit -m "feat(#089): door-menu layout constants"
```

### Task 3.2: Capture engine fixtures (`maze-door-*`)

**Files:** Modify `tools/dosbox/state-catalog.ts`; create fixtures under `tools/parity/fixtures/engine/`.

- [ ] **Step 1: Add recipes** driving dosbox-pure from boot to the level-0 door, then to each menu state. Check for fixture-name collisions first (`ls tools/parity/fixtures/engine/ | grep door`).

```typescript
{ name: 'maze-door-menu-force', description: 'OPEN facing the level-0 door; FORCE cursor.',
  steps: [ /* nav-to-door key macros (from the engine-reachable path) */, 'enter', /* OPEN=idx4 */ 'right down enter', /* now at FORCE/PICK/EXIT, cursor on FORCE */ ] },
{ name: 'maze-door-menu-pick', description: 'Door menu, PICK cursor.', steps: [ /* ... */, 'right' ] },
{ name: 'maze-door-menu-exit', description: 'Door menu, EXIT cursor.', steps: [ /* ... */, 'right right' ] },
{ name: 'maze-door-who', description: 'FORCE -> WHO WILL TRY picker.', steps: [ /* ... force, enter */ ] },
```

- [ ] **Step 2: Build the fixtures**

Run: `pnpm tsx tools/libretro/build-state.ts maze-door-menu-force` (and the others).
Expected: writes `.idx.gz` + `.png` per recipe. Eyeball the PNGs match the screenshot (FORCE/PICK/EXIT row, cursor on the right cell).

- [ ] **Step 3: Commit fixtures + recipes**

```bash
git add tools/dosbox/state-catalog.ts tools/parity/fixtures/engine/maze-door-*.idx.gz tools/parity/fixtures/engine/maze-door-*.png
git commit -m "test(#089): engine fixtures for door menu + WHO picker"
```

### Task 3.3: `composeDoorMenu` byte-exact

**Files:**
- Create: `packages/viewer/src/pages/game/compose-door-menu.ts`; Test `packages/viewer/tests/game/door-menu-parity.test.ts`.

- [ ] **Step 1: Write the failing parity test** (mirror `options-strip-parity.test.ts`: gunzip the fixture, compare to `composeDoorMenu(cursor)` byte-for-byte at tolerance 0).

```typescript
import { describe, it, expect } from 'vitest';
import { composeDoorMenu } from '../../src/pages/game/compose-door-menu.js';
import { loadIdxFixture } from './helpers.js'; // existing helper used by options-strip-parity

describe('door menu parity', () => {
  it.each([['force', 0], ['pick', 1], ['exit', 2]])('cursor %s byte-exact', (name, idx) => {
    const expected = loadIdxFixture(`maze-door-menu-${name}`);
    const got = composeDoorMenu(idx as number);
    expect(Array.from(got)).toEqual(Array.from(expected));
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement `composeDoorMenu`** — same skeleton as `composeOptionsStrip` but a single horizontal row of 3 labels from `DOOR_MENU`, using `glyph-core`. Adjust `DOOR_MENU.cellAt` origins until byte-exact.

- [ ] **Step 4: Run, iterate origins to PASS**

Run: `pnpm --filter @wiz6/viewer test door-menu-parity`
Expected: PASS at 100%. (Verify cursor blink-phase invariance like OPTIONS; if it blinks, add a `phase` param.)

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/game/compose-door-menu.ts packages/data/src/maze/door-menu.ts packages/viewer/tests/game/door-menu-parity.test.ts
git commit -m "feat(#089): byte-exact FORCE/PICK/EXIT door menu composer"
```

### Task 3.4: FORCE/PICK menu nav (pure)

**Files:** Modify `packages/parser/src/maze/door-open.ts`; test in `door-open.test.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
import { moveDoorMenuCursor } from '../../src/maze/door-open.js';
describe('moveDoorMenuCursor', () => {
  it('clamps a 3-entry horizontal row', () => {
    expect(moveDoorMenuCursor(0, 'right')).toBe(1);
    expect(moveDoorMenuCursor(2, 'right')).toBe(2);
    expect(moveDoorMenuCursor(0, 'left')).toBe(0);
    expect(moveDoorMenuCursor(1, 'up')).toBe(1); // single row, vertical no-op
  });
});
```

- [ ] **Step 2: FAIL / Step 3: Implement**

```typescript
/** 3-entry horizontal menu (FORCE=0/PICK=1/EXIT=2); clamp, no wrap. */
export function moveDoorMenuCursor(index: number, dir: 'up'|'down'|'left'|'right'): number {
  if (dir === 'left') return Math.max(0, index - 1);
  if (dir === 'right') return Math.min(2, index + 1);
  return index;
}
```

- [ ] **Step 4: PASS / Step 5: Commit**

```bash
git add packages/parser/src/maze/door-open.ts packages/parser/tests/maze/door-open.test.ts
git commit -m "feat(#089): door-menu cursor nav"
```

### Task 3.5: WHO WILL TRY picker

The picker reuses the REVIEW member-picker layout. Reuse `compose-review-picker.ts` (or
parameterize its header text "WHO WILL TRY?" via msg 537) and `moveReviewCursor` for nav.

- [ ] **Step 1: Write a parity test** for the WHO picker fixture (`maze-door-who`) vs the
  reused picker composer with the WHO header. Run, iterate to byte-exact, commit. (If the
  picker chrome is identical to REVIEW's apart from the header string, add a `header` param
  to `composeReviewPicker` rather than duplicating it — guard the existing REVIEW parity test.)

```bash
git commit -m "feat(#089): WHO WILL TRY door member-picker (byte-exact)"
```

---

## Stage 4: Animation, outcomes & door-state overlay

**Goal:** Strain/tumble bar + result text, the session door-state overlay (open/welded), turn cost, Skulduggery XP; wire `dispatchOptionsCommand('open')`. **Gate:** pixel parity for bar/result frames + overlay unit tests.

### Task 4.1: Session door-state overlay (pure store)

**Files:** Create `packages/parser/src/maze/door-state.ts`; test alongside.

- [ ] **Step 1: Write the failing test**

```typescript
import { DoorStateOverlay } from '../../src/maze/door-state.js';
describe('DoorStateOverlay', () => {
  it('records an opened edge -> passable', () => {
    const o = new DoorStateOverlay();
    o.open(128, 131, 1);
    expect(o.isOpen(128, 131, 1)).toBe(true);
    expect(o.isOpen(128, 131, 0)).toBe(false);
  });
  it('records welding', () => {
    const o = new DoorStateOverlay();
    o.weld(128, 131, 1);
    expect(o.isWelded(128, 131, 1)).toBe(true);
  });
});
```

- [ ] **Step 2: FAIL / Step 3: Implement** a `Map<string, {open?:boolean; welded?:boolean}>` keyed by `${gx},${gy},${facing}` with `open/weld/isOpen/isWelded`.

- [ ] **Step 4: PASS / Step 5: Commit**

```bash
git commit -m "feat(#089): session door-state overlay"
```

### Task 4.2: Outcome resolution + side-effects (pure)

**Files:** Modify `door-open.ts`; test alongside.

- [ ] **Step 1: Write the failing test** — `resolveDoorAttempt(outcome, door, member, rng)` returns the side-effect set: `{ opened: boolean; welded: boolean; skulduggeryXp: boolean }`. Success → opened; failure/jammed → `rng(3)===0` → welded; failed PICK by thief class → skulduggeryXp.

```typescript
import { resolveDoorAttempt } from '../../src/maze/door-open.js';
it('success opens', () => {
  expect(resolveDoorAttempt('success', door, thief, 'pick', scriptRng([])).opened).toBe(true);
});
it('failure welds when rng(3)==0', () => {
  expect(resolveDoorAttempt('failure', door, thief, 'pick', scriptRng([[3,0]])).welded).toBe(true);
});
it('failed pick by thief grants Skulduggery xp', () => {
  expect(resolveDoorAttempt('failure', door, thief, 'pick', scriptRng([[3,1]])).skulduggeryXp).toBe(true);
});
```

- [ ] **Step 2: FAIL / Step 3: Implement** per the asm dispatch (`0x8dbc`/`0x9258`): order = (success→open) else (PICK+thief→xp) then `rng(3)` jam roll. Keep RNG order exact.

- [ ] **Step 4: PASS / Step 5: Commit**

```bash
git commit -m "feat(#089): door attempt outcome + side-effects"
```

### Task 4.3: Strain/tumble bar + result composer (byte-exact)

**Files:** Create `packages/viewer/src/pages/game/compose-door-progress.ts`; parity test vs `--mint`-frozen fixtures (a strain bar at a known length, a tumbler frame, and the 3 result-text frames success/failure/jammed).

- [ ] **Step 1: Capture `--mint` fixtures** for the result frames (RNG-dependent) + a fixed-length strain bar. Add recipes; `build-state.ts <recipe> --mint`.
- [ ] **Step 2: Write parity tests**; implement the composer (bar = N glyph `0x61` cells filled to `progress`; result text via the msg strings 540/541/542). Iterate to byte-exact.
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(#089): strain/tumble bar + result text (byte-exact)"
```

### Task 4.4: Wire `dispatchOptionsCommand('open')` into MazeView

**Files:** Modify `packages/viewer/src/pages/game/MazeView.tsx`.

- [ ] **Step 1: Add the door-open state machine to MazeView** — on `cmd === 'open'`: `detectDoorAtParty(doors, party)`; if null, close (engine no-op); else open the FORCE/PICK/EXIT menu (a `doorMenuRef`). Wire keydown: nav via `moveDoorMenuCursor`; FORCE/PICK → WHO picker (reuse the REVIEW picker refs with the WHO header) → on member select, run `forceAttempt`/`pickAttempt` with the shared session `WichmannHill`, then `resolveDoorAttempt`; apply side-effects to the `DoorStateOverlay` (+ Skulduggery XP to the character), show the result, consume a turn-tick. EXIT/Escape closes.

- [ ] **Step 2: Consult the overlay in the movement gate** — `MazeView`'s ArrowUp passability check treats an `overlay.isOpen(gx,gy,facing)` edge as passable (and `isWelded` as blocked), layered over `passabilityRef`.

- [ ] **Step 3: Render** — when `doorMenuRef.open`, draw `composeDoorMenu(cursor)` over the bottom strip (same blit path as `composeOptionsStrip` at MazeView.tsx:350); render the picker / bar / result in their phases.

- [ ] **Step 4: Manual check** — `pnpm dev:viewer`, walk to the door, OPEN → FORCE → pick member → see outcome → on success walk through.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer/src/pages/game/MazeView.tsx
git commit -m "feat(#089): wire OPTIONS->OPEN door flow into MazeView"
```

---

## Stage 5: Integration e2e + smoke + notes

**Goal:** Full driving gate + manual smoke + propose Engineering-Notes / House-Rules. **Gate:** e2e + manual.

### Task 5.1: e2e walking gate

**Files:** Create `packages/viewer/e2e/maze-door.spec.ts`.

- [ ] **Step 1: Write the spec** — seed the pinned roster, drive walk-to-door (committed `pressKeys` path), OPEN → FORCE → pick member, then `expectMazeViewportMatchesFixture` against the `maze-door-*`/result fixtures at each step; on success, ArrowUp and assert the party moved through the now-open door.
- [ ] **Step 2: Run** `pnpm --filter @wiz6/viewer test:e2e maze-door`; iterate to green.
- [ ] **Step 3: Commit**

```bash
git commit -m "test(#089): e2e walking gate for OPEN-door FORCE/PICK"
```

### Task 5.2: Full-suite verification + manual smoke

- [ ] **Step 1:** `pnpm --filter @wiz6/parser test && pnpm --filter @wiz6/data test && pnpm --filter @wiz6/viewer test` — all green.
- [ ] **Step 2:** `pnpm -w tsc -b` / viewer build — clean.
- [ ] **Step 3:** Manual smoke in the browser (force a door, pick a door, jam a door by repeated failed forces, walk through an opened one).

### Task 5.3: Propose Engineering Notes + House Rule (ask Nate first)

- [ ] **Step 1:** Propose to Nate (do not build unprompted): EN "Force a door and you may jam it forever" (1/3 fail→weld), EN "You learn lockpicking only by failing" (Skulduggery XP on failed pick), EN the ~1/50 fatigue-collapse. HR "No door-jam on failed force" (default = engine). On approval, add cards to `EngineeringNotes.tsx` + `note-index.ts` and the `HOUSE_RULES_META` entry.

### Task 5.4: Close the TODO

- [ ] **Step 1:** Update `TODO.md` #089 → done (delete the entry; git log preserves it) and note the deferred KEY-via-USE follow-up under #088. Commit.

---

## Self-review notes

- **Spec coverage:** §2 mechanics → Stage 1 (1.5–1.8) + 4.2; §3 components → all stages; §4 data flow/overlay → 4.1/4.4; §5 tier 1 → 1.5–1.8, tier 2 → 3.3/3.5/4.3, tier 3 → 1.9, tier 4 → 5.1, tier 5 → 5.2; §6 staging → Stages 1–5; §7 EN/HR → 5.3.
- **Residual risk:** the door-record table layout (Task 1.4) and the roll-state capture (Task 1.9) depend on Task 1.1's live read — if the table layout can't be pinned, decode falls back to the per-cell `special4`/`orient2` planes already in `maze-block.ts` plus the `+0x6c0` index, documented inline.
- **Type consistency:** `DoorRecord` (data) used by `decodeDoorRecords`/`detectDoorAtParty`; `Rng` interface (`{uniform}`) used by `forceAttempt`/`pickAttempt`/`resolveDoorAttempt`, satisfied by `WichmannHill`; `DoorOutcome` = `'success'|'failure'|'jammed'` throughout.
