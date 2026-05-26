# wpcmk Port — Stage A: Byte-Perfect Engine + Parity Harness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow TDD: failing test first, minimal impl, refactor, commit.

**Goal:** Byte-perfect, parity-tested character-creation *logic* — the Wichmann-Hill RNG, the creation formulas (bonus roll, skill budget, derived stats), a `Character → 432-byte record` encoder, and a differential parity harness against DOSBox saves. No UI/rendering (that's Stage B+).

**Architecture:** Pure logic lives in `@wiz6/data` (formulas, RNG — no I/O) and `@wiz6/parser` (record encode/decode — the decoder side already exists). We **correct and extend existing `@wiz6/data/character-creation/` modules** rather than duplicate them. The byte-perfect ground truth is `docs/re/wpcmk-screens.md` + the 12 `docs/re/findings/wpcmk-*.json`.

**Tech Stack:** TypeScript ESM (relative imports use `.js`), vitest, zod schemas (`z.infer` for types), `pnpm --filter <pkg> test -- --run`. Existing modules to build on: `@wiz6/data/character-creation/*`, `@wiz6/data/structs/character-record.ts` (`CHARACTER_RECORD` BssStruct), `@wiz6/parser/formats/pcfile.ts` (`decodePcfile`), `@wiz6/data/schemas/character.ts` (`CharacterSchema`).

**Spec:** `docs/superpowers/specs/2026-05-26-wpcmk-byte-perfect-design.md`
**RE reference:** `docs/re/wpcmk-screens.md` (esp. §4 bonus allocator, §5 skill budget, §12 RNG seed; buffer-writes table in §1)

---

## Conventions for every task

- All paths absolute from repo root. Work in the worktree (the SDD controller will tell each subagent the exact `cd` path).
- TS ESM: relative imports use `.js` extension even from `.ts` source.
- Types come from `z.infer<typeof Schema>` — never define a type separately from its schema.
- Every commit must pass `pnpm --filter @wiz6/data test -- --run` (and `@wiz6/parser` where touched).
- RNG note: the engine RNG is **Wichmann-Hill 1982, 3-stream Lehmer LCG** (wroot `rng_advance` @ image 0x125b9). Stream constants `(q,a,c)`: stream1 `(0xb1,0xab,-2)` reseed `+0x763d`; stream2 `(0xb0,0xac,-0x23)` reseed `+0x7663`; stream3 `(0xb2,0xaa,-0x3f)` reseed `+0x7673`. Default boot seed triple `(stream1=3000, stream2=1, stream3=29999)`. See `docs/re/findings/wpcmk-rng-seed-at-creation.json`.
- `rng(n)` in the RE means "uniform integer in `[0, n)`" derived from the Wichmann-Hill output. The exact reduction (which stream(s), how combined, mod n) MUST be confirmed against `rng_advance`'s decompile during Task 1 — do not assume.

---

## Task 1: Wichmann-Hill RNG core

**Files:**
- Create: `packages/data/src/rng/wichmann-hill.ts`
- Create: `packages/data/tests/rng/wichmann-hill.test.ts`
- Modify: `packages/data/src/index.ts` (export)

**Goal:** A seedable 3-stream Wichmann-Hill generator that reproduces `rng_advance`, plus a `uniform(n)` helper matching the engine's `rng(n)` reduction.

- [ ] **Step 1: Confirm the exact algorithm against the decompile.** Before writing code, open `rng_advance` (wroot image 0x125b9) in Ghidra (project `tools/ghidra/wiz6.gpr`) OR read `docs/re/findings/wroot-naming-pass.json` + `wpcmk-rng-seed-at-creation.json`. Determine: (a) per-stream update `s = (s % q) * a − (s / q) * c'` (note sign — the findings say constants like `-2`; confirm whether it's `+ (s/q)*c` with negative c or a subtraction) and the reseed-when-negative add; (b) how the three stream outputs combine into the returned value; (c) how `rng(n)` reduces that to `[0,n)`. Record the confirmed algorithm as a comment block at the top of `wichmann-hill.ts`. If the decompile is ambiguous on the combine/reduce step, capture a short output trace from a DOSBox save (read the three stream words, step the game, re-read) via the MCP and match it.

- [ ] **Step 2: Write the failing test** for the per-stream advance + combined output, using values confirmed in Step 1.

```typescript
// packages/data/tests/rng/wichmann-hill.test.ts
import { describe, expect, it } from 'vitest';
import { WichmannHill } from '../../src/rng/wichmann-hill.js';

describe('WichmannHill', () => {
  it('reproduces the documented stream constants and reseed', () => {
    const rng = new WichmannHill(3000, 1, 29999); // default boot seed
    const first = rng.nextRaw();                  // combined output, one advance
    // EXPECTED value(s) come from Step 1 (decompile/trace). Fill the literal:
    expect(first).toBe(/* confirmed value */ 0);
    expect(rng.streams()).toEqual([/* s1' */ 0, /* s2' */ 0, /* s3' */ 0]);
  });

  it('uniform(n) returns values in [0, n)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    for (let i = 0; i < 1000; i++) {
      const v = rng.uniform(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it('is deterministic for a fixed seed', () => {
    const a = new WichmannHill(3000, 1, 29999);
    const b = new WichmannHill(3000, 1, 29999);
    expect(Array.from({ length: 50 }, () => a.uniform(100)))
      .toEqual(Array.from({ length: 50 }, () => b.uniform(100)));
  });
});
```

- [ ] **Step 3: Run, expect fail.** `pnpm --filter @wiz6/data test -- --run wichmann-hill` → FAIL (module missing).

- [ ] **Step 4: Implement `wichmann-hill.ts`** with the algorithm confirmed in Step 1. Class `WichmannHill` with: constructor `(s1, s2, s3)`; `nextRaw(): number` (advance all three streams, return the combined value exactly as `rng_advance` does); `uniform(n): number` (the `rng(n)` reduction); `streams(): [number, number, number]` (for testing/parity); `clone()`. No I/O, no `Math.random`.

- [ ] **Step 5: Run, expect pass.** Same command → PASS. Fix the literals in Step 2 if Step 1's values differ from the placeholder.

- [ ] **Step 6: Export + commit.** Add `export * from './rng/wichmann-hill.js'` to `packages/data/src/index.ts`. Then:
```bash
git add packages/data/src/rng/wichmann-hill.ts packages/data/tests/rng/wichmann-hill.test.ts packages/data/src/index.ts
git commit -m "feat(data): byte-perfect Wichmann-Hill RNG (wpcmk port stage A)"
```

---

## Task 2: Bonus-roll formula

**Files:**
- Create: `packages/data/src/character-creation/bonus-roll.ts`
- Create: `packages/data/tests/character-creation/bonus-roll.test.ts`
- Modify: `packages/data/src/index.ts`

**Goal:** `rollBonus(rng: WichmannHill): number` matching wpcmk `stat_roller_bonus` (0x4e81): `5 + rng(6)`, then `+8` on each of two independent `1/20` rolls. Range 5..26 with unreachable gaps at 11,12,19,20.

- [ ] **Step 1: Write failing tests** (distribution + reachability):

```typescript
// packages/data/tests/character-creation/bonus-roll.test.ts
import { describe, expect, it } from 'vitest';
import { WichmannHill } from '../../src/rng/wichmann-hill.js';
import { rollBonus } from '../../src/character-creation/bonus-roll.js';

describe('rollBonus', () => {
  it('produces values only in 5..10, 13..18, or 21..26 (gaps at 11,12,19,20)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const seen = new Set<number>();
    for (let i = 0; i < 200_000; i++) seen.add(rollBonus(rng));
    for (const gap of [11, 12, 19, 20]) expect(seen.has(gap)).toBe(false);
    for (const v of seen) expect(v).toBeGreaterThanOrEqual(5);
    for (const v of seen) expect(v).toBeLessThanOrEqual(26);
  });

  it('matches the theoretical distribution within tolerance', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const N = 1_000_000;
    let noBonus = 0, oneBonus = 0, twoBonus = 0;
    for (let i = 0; i < N; i++) {
      const v = rollBonus(rng);
      if (v <= 10) noBonus++; else if (v <= 18) oneBonus++; else twoBonus++;
    }
    expect(noBonus / N).toBeCloseTo(0.9025, 2); // (19/20)^2
    expect(oneBonus / N).toBeCloseTo(0.0950, 2); // 2*(1/20)*(19/20)
    expect(twoBonus / N).toBeCloseTo(0.0025, 2); // (1/20)^2
  });
});
```

- [ ] **Step 2: Run, expect fail.** `pnpm --filter @wiz6/data test -- --run bonus-roll` → FAIL.

- [ ] **Step 3: Implement** `rollBonus`:
```typescript
// packages/data/src/character-creation/bonus-roll.ts
import type { WichmannHill } from '../rng/wichmann-hill.js';

/** wpcmk stat_roller_bonus @ 0x4e81: 5 + rng(6), then +8 on each of two 1/20 rolls. */
export function rollBonus(rng: WichmannHill): number {
  let bonus = 5 + rng.uniform(6);
  if (rng.uniform(20) === 0) bonus += 8;
  if (rng.uniform(20) === 0) bonus += 8;
  return bonus;
}
```

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Export + commit.**
```bash
git add packages/data/src/character-creation/bonus-roll.ts packages/data/tests/character-creation/bonus-roll.test.ts packages/data/src/index.ts
git commit -m "feat(data): byte-perfect bonus-roll formula"
```

---

## Task 3: Skill-budget formula

**Files:**
- Create: `packages/data/src/character-creation/skill-budget.ts`
- Create: `packages/data/tests/character-creation/skill-budget.test.ts`
- Modify: `packages/data/src/index.ts`

**Goal:** `rollSkillBudget(rng, classIdx, attrs): number` — base `rng(9) + 10` (10..18), then for Fighter/Ranger/Bishop/Monk/Ninja subtract a per-class `tier2 = floor(attr / div) + base`, clamped at 0 (Fighter). This writes record 0x1a8 (skill_growth_budget). See §5.

- [ ] **Step 1: Confirm the per-class tier2 constants.** Open OQ #4 — the `div`/`base` per class were not fully enumerated in Phase 1. Decompile `skill_pool_roll_and_class_adjust` (wpcmk 0x4222) + its class jump table at file 0x4545 (runtime 0x8aa9) in Ghidra. Extract `div`, `base`, and which `attr` feeds tier2 for Fighter/Ranger/Bishop/Monk/Ninja. Record them as a table constant in `skill-budget.ts`. If a class's handler can't be resolved, mark it `tier2 = 0` and add an `open_question` comment.

- [ ] **Step 2: Write failing tests** — base range for non-adjusted classes, and exact tier2 outputs for the 5 adjusted classes using the Step-1 constants (enumerate a few `(attr) → expected budget` cases). Use a stubbed RNG that returns a fixed `uniform(9)` so the base is deterministic.

```typescript
// packages/data/tests/character-creation/skill-budget.test.ts
import { describe, expect, it } from 'vitest';
import { rollSkillBudget } from '../../src/character-creation/skill-budget.js';

// Minimal deterministic rng stub: uniform(9) always returns `fixed`.
function stubRng(fixed: number) { return { uniform: (_n: number) => fixed } as any; }

describe('rollSkillBudget', () => {
  it('Mage (no tier2) keeps rng(9)+10', () => {
    expect(rollSkillBudget(stubRng(0), 1 /* Mage */, {} as any)).toBe(10);
    expect(rollSkillBudget(stubRng(8), 1, {} as any)).toBe(18);
  });
  it('Fighter clamps at 0 when tier2 exceeds the base', () => {
    // Fill expected from Step-1 constants:
    expect(rollSkillBudget(stubRng(0), 0 /* Fighter */, /* attrs */ {} as any))
      .toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 3: Run, expect fail.**

- [ ] **Step 4: Implement** `rollSkillBudget` with the Step-1 `TIER2_BY_CLASS` table. Pure function.

- [ ] **Step 5: Run, expect pass.**

- [ ] **Step 6: Export + commit.**
```bash
git add packages/data/src/character-creation/skill-budget.ts packages/data/tests/character-creation/skill-budget.test.ts packages/data/src/index.ts
git commit -m "feat(data): skill-budget formula (rng(9)+10 minus class tier2)"
```

---

## Task 4: Wire karma roll to the RNG (verify existing)

**Files:**
- Modify: `packages/data/src/character-creation/karma-roll.ts` (only if needed to accept a `WichmannHill`)
- Create: `packages/data/tests/character-creation/karma-roll.rng.test.ts`

**Goal:** `karma-roll.ts` is already byte-perfect (`rng(19)` + optional +1, cross-validated vs stock chars). Ensure it composes with `WichmannHill` (it currently takes an `rng01?` float). Add a thin overload/adapter `rollKarmaWith(rng: WichmannHill, personalityConfirmed?: boolean)` that uses `rng.uniform(19)`, and a test.

- [ ] **Step 1: Read** `packages/data/src/character-creation/karma-roll.ts` to see the current `rollKarma` signature.
- [ ] **Step 2: Write failing test** asserting `rollKarmaWith(rng)` ∈ 0..18, and 1..19 when `personalityConfirmed`.
- [ ] **Step 3: Run, expect fail.**
- [ ] **Step 4: Implement** `rollKarmaWith` in `karma-roll.ts` delegating to the existing logic with `rng.uniform(19)`. Do NOT change the existing `rollKarma` contract.
- [ ] **Step 5: Run, expect pass.**
- [ ] **Step 6: Commit.**
```bash
git add packages/data/src/character-creation/karma-roll.ts packages/data/tests/character-creation/karma-roll.rng.test.ts
git commit -m "feat(data): karma roll adapter over WichmannHill"
```

---

## Task 5: Derived-stats formulas

**Files:**
- Create: `packages/data/src/character-creation/derived-stats.ts`
- Create: `packages/data/tests/character-creation/derived-stats.test.ts`
- Modify: `packages/data/src/index.ts`

**Goal:** `creation_init_derived_stats` (wpcmk 0x4ddd, screen-07): age, encumbrance min/max + weight, `hp_initial`, `level=1`, `xp=1`. See §1 buffer-writes (offsets 0x008..0x027) and `docs/re/findings/wpcmk-screen-flow.json`.

- [ ] **Step 1: Extract exact formulas** from `wpcmk-screen-flow.json` / decompile 0x4ddd. Confirmed so far: `age = rng(1000) + 0x19aa`; `hp_initial = encumb_max × 15` (×10 for Faerie); `level=1`; `xp=1`. Confirm the encumbrance/weight formulas (likely VIT/STR-derived) before coding.
- [ ] **Step 2: Write failing tests** for each derived field given fixed attrs + stubbed RNG.
- [ ] **Step 3: Run, expect fail.**
- [ ] **Step 4: Implement** `computeDerivedStats(rng, race, attrs)` returning `{ age, encumbranceMin, encumbranceMax, weightMin, weightMax, hpInitial, level, xp }`.
- [ ] **Step 5: Run, expect pass.**
- [ ] **Step 6: Export + commit.**
```bash
git add packages/data/src/character-creation/derived-stats.ts packages/data/tests/character-creation/derived-stats.test.ts packages/data/src/index.ts
git commit -m "feat(data): derived-stats formulas (age/encumbrance/hp/level/xp)"
```

---

## Task 6: Add `sex` to the Character schema

**Files:**
- Modify: `packages/data/src/schemas/character.ts`
- Modify: `packages/data/tests/schemas/character.test.ts` (or wherever schema tests live)

**Goal:** Screen-03 is the SEX picker (MALE=0/FEMALE=1, record offset 0x19e — see §1/§3). The `Character` schema has no `sex` field. Add `sex: U8` (0=Male, 1=Female). Keep it required but default-safe for existing rosters (the decoder maps record 0x19e).

- [ ] **Step 1: Read** `packages/data/src/schemas/character.ts` and the record map `packages/data/src/structs/character-record.ts` to confirm 0x19e is free / how it's currently decoded.
- [ ] **Step 2: Write failing test** asserting `CharacterSchema` parses a character with `sex: 0` and `sex: 1`, rejects `sex: 2`.
- [ ] **Step 3: Run, expect fail.**
- [ ] **Step 4: Implement** — add `sex` to `CharacterSchema` (enum/`U8` capped at 1) and to `CHARACTER_RECORD` struct at 0x19e. Ensure existing roster fixtures still parse (provide a migration default if the field is newly required — prefer `.default(0)` to avoid breaking stored rosters).
- [ ] **Step 5: Run, expect pass** + run the full data suite to catch fixture breakage.
- [ ] **Step 6: Commit.**
```bash
git add packages/data/src/schemas/character.ts packages/data/src/structs/character-record.ts packages/data/tests/
git commit -m "feat(data): add sex field to Character (record 0x19e)"
```

---

## Task 7: Character-record encoder (`Character → 432 bytes`)

**Files:**
- Create: `packages/parser/src/formats/encode-character-record.ts`
- Create: `packages/parser/tests/formats/encode-character-record.test.ts`
- Modify: `packages/parser/src/index.ts`

**Goal:** The inverse of `decodePcfile`'s per-record decode — serialize a `Character` to the exact 432 bytes wpcmk writes (`*0x5470`). Round-trips with the decoder. This is the parity-test target.

- [ ] **Step 1: Read** `packages/parser/src/formats/pcfile.ts` (`decodePcfile`) and `packages/data/src/structs/character-record.ts` (`CHARACTER_RECORD` BssStruct) to learn the field layout + how decode maps bytes→Character.
- [ ] **Step 2: Write failing round-trip test**: take a known stock-character record (extract 432 bytes from `original/pcfile.dbs` for THESUS, or use an existing pcfile test fixture), `decodePcfile` → Character, `encodeCharacterRecord(char)` → bytes, assert bytes equal the original 432 (modulo documented don't-care padding).

```typescript
// packages/parser/tests/formats/encode-character-record.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodePcfile } from '../../src/formats/pcfile.js';
import { encodeCharacterRecord } from '../../src/formats/encode-character-record.js';

describe('encodeCharacterRecord round-trip', () => {
  it('re-encodes a stock character to byte-identical 432 bytes', () => {
    const pcfile = new Uint8Array(readFileSync('original/pcfile.dbs'));
    const decoded = decodePcfile(pcfile);
    const char = decoded.characters[0];           // adjust to actual shape
    const reEncoded = encodeCharacterRecord(char); // Uint8Array(432)
    const originalRecord = /* slice the 432 bytes for char 0 from pcfile */;
    expect(Array.from(reEncoded)).toEqual(Array.from(originalRecord));
  });
});
```

- [ ] **Step 3: Run, expect fail.**
- [ ] **Step 4: Implement** `encodeCharacterRecord(char: Character): Uint8Array` using `CHARACTER_RECORD` field offsets (LE u8/u16/u32, arrays, name padding to 8). Mirror `decodePcfile` exactly. Any byte the decoder ignores, fill with the value the engine writes (0 for cleared regions).
- [ ] **Step 5: Run, expect pass.** Iterate on don't-care bytes until the stock record round-trips.
- [ ] **Step 6: Export + commit.**
```bash
git add packages/parser/src/formats/encode-character-record.ts packages/parser/tests/formats/encode-character-record.test.ts packages/parser/src/index.ts
git commit -m "feat(parser): Character → 432-byte record encoder (round-trips decodePcfile)"
```

---

## Task 8: Parity harness — `decode-character`

**Files:**
- Create: `tools/parity/decode-character.ts`
- Modify: `tools/parity/README.md`

**Goal:** Differential test: given a DOSBox save at creation-commit, extract the 432-byte record from physical memory (`*0x5470` region) and compare to our `encodeCharacterRecord` output for the same inputs. Plus document the fixed-seed strategy (§12).

- [ ] **Step 1: Read** `tools/parity/README.md` + `tools/parity/extract.py` to learn the existing find/dump/diff workflow.
- [ ] **Step 2: Implement** `tools/parity/decode-character.ts` (tsx script): args `--save <N.sav> --slot <i>`; resolves the creation buffer at DGROUP `*0x5470` (base from save inspect) or the pcfile slot; dumps 432 bytes; prints hex. Reuse `tools/parity/extract.py` plumbing where possible (shell out or port).
- [ ] **Step 3: Wire a comparison path**: a second mode `--compare <our.bin> <engine.bin>` that diffs and exits 0/1 (or reuse `tools/parity/diff.py`).
- [ ] **Step 4: Document** in `tools/parity/README.md`: the seed strategy — fixed triple `(3000,1,29999)` for deterministic tests; capture-a-save for bit-exact regression (read `CS:[0x1d3b/3d/3f]`). Add a worked example mirroring the existing `.pic` parity recipe.
- [ ] **Step 5: Smoke-test** the harness against one existing save in `tools/dosbox/save/` (verify it extracts 432 plausible bytes; full creation-commit save capture is deferred — note it).
- [ ] **Step 6: Commit.**
```bash
git add tools/parity/decode-character.ts tools/parity/README.md
git commit -m "feat(parity): character-record extraction + seed strategy docs"
```

---

## Task 9: Stage A wrap-up — integration sanity + TODO

**Files:**
- Modify: `TODO.md`

**Goal:** Confirm the engine pieces compose, and queue Stage B.

- [ ] **Step 1: Compose-test** — write a throwaway/kept test `packages/data/tests/character-creation/creation-engine.compose.test.ts` that, with a fixed-seed `WichmannHill`, runs: pick race (RACE_BASE_STATS) → bonus roll → allocate (trivial) → class qualify → derived stats → karma → skill budget, and asserts a fully-populated attribute set within valid ranges. This proves the modules interoperate.
- [ ] **Step 2: Run** the full `@wiz6/data` + `@wiz6/parser` suites — all green.
- [ ] **Step 3: Update TODO.md** — replace #019 with a Stage-B entry (EGA primitives) and note Stage A complete. Bump next-free-ID.
- [ ] **Step 4: Commit.**
```bash
git add packages/data/tests/character-creation/creation-engine.compose.test.ts TODO.md
git commit -m "test(data): creation-engine compose test; queue Stage B"
```

---

## Self-review notes (parent only)

- **Spec coverage:** Stage A maps to the spec's `engine/` layer (rng, formulas, character-record) + parity harness. UI layers (ega/, screens/, CreationPage) are Stage B+.
- **Deviation from spec file layout:** spec put `engine/` under `packages/viewer/src/pages/roster/creation/`. We instead extend `@wiz6/data/character-creation/` + `@wiz6/parser` (DRY — those modules already exist) and will thin-wrap/re-export under viewer in a later stage. This is intentional.
- **Confirm-before-coding tasks:** Tasks 1 (RNG reduce step), 3 (tier2 constants), 5 (encumbrance formula) require a decompile confirmation step because the exact arithmetic wasn't fully pinned in Phase 1. Each has an explicit Step-1 confirmation gate.
- **Risk:** the `rng(n)` reduction (Task 1) is the crux of all byte-perfect parity. If it's wrong, every downstream formula's *sequence* diverges even if the per-call math is right. Task 1 Step 1 must nail it against a live trace, not just the static decompile.
