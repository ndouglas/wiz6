# wpcmk Port — Stage C: Flow State Machine + Screen Components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. TDD. Each subagent prompt must start by `cd`-ing into the worktree (subagents default to the main checkout).

**Goal:** Wire Stage A (engine) + Stage B (EGA primitives) into a playable, screen-accurate character-creation flow: a pure flow **reducer** modeling wpcmk's 17-step sequence, the interactive **screen components**, message-string wiring, and a `CreationPage` that owns the reducer + RNG + keyboard + canvas. Stage D (route cutover + deleting the old wizard) is separate.

**Architecture:** A pure `creationReducer(state, event)` drives the flow (state = the in-progress 432-byte-shaped record + RNG state + cursor + per-screen scratch). Non-interactive steps (init, bonus roll, derived stats, skill init, starter items, save) are reducer actions that call the Stage-A engine functions; interactive steps render a screen component that emits events. Screens are dumb: given `state` they render via Stage-B EGA primitives (`renderCreationFrame`/`CreationCanvas`) and translate arrow/Return keys (per §8) into events. `CreationPage` owns the `useReducer`, the `WichmannHill` instance, the keyboard listener, and asset loading.

**Tech Stack:** React 18, TS ESM (`.js` imports), vitest + @testing-library/react. Consumes `@wiz6/data` (`WichmannHill`, `rollBonus`, `rollSkillBudget`, `rollKarmaWith`, `computeDerivedStats`, `RACE_BASE_STATS`, `CLASS_REQUIREMENTS`/`meetsClassRequirements`, `CLASS_SPELLBOOKS`/`classIsCaster`, `SPELL_TABLE`, `CharacterSchema`), `@wiz6/parser` (`encodeCharacterRecord`, tile-window `puts`/`createTileWindow`), the Stage-B `creation/ega/` modules, and `roster-store` (`addCharacter`).

**Spec:** `docs/superpowers/specs/2026-05-26-wpcmk-byte-perfect-design.md`
**RE reference (authoritative):** `docs/re/wpcmk-screens.md` — §1 flow/transitions, §3 msg strings per screen, §4 bonus-allocator keys, §5 skill-train, §6 portrait, §7 menu-picker, §8 arrow-key input model, §9 spell names.

---

## Key facts the implementer MUST honor (from the RE reference)

- **Input model (§8):** action codes are arrow keys + Return — **1=Left, 2=Up, 3=Right, 4=Down, 5=Return**, ESC ignored by creation screens. All screens dispatch on these. (Name input uses raw keys.)
- **Flow (§1):** name(00, pre-entry) → init(01) → race(02) → **sex(03, MALE/FEMALE)** → bonus-roll(04, non-interactive) → class(05, qualification-gated) → bonus-allocator(06) → derived-stats(07, non-interactive) → personality/karma(08) → skill-init(09, non-interactive) → portrait(10) → starter-items(11, non-interactive) → char-sheet-redraw(12) → **skill-train(13, SKILL, conditional on `skillBudget>0`)** → **spell-pick(14, SPELL, casters only)** → confirm(15, "SAVE THIS CHARACTER? YES/NO") → save(16) / discard.
- **Record offsets (verified):** race@0x19d, alignment@0x19e, class@0x19f, sex@**0x1a1**, attributes@0x12c (STR/INT/PIE/VIT/DEX/SPD/PER/KAR), portrait@0x19c, skill levels[30]@0x134, skill budget@0x1a8. Use `@wiz6/data` `CHARACTER_RECORD` struct + `CharacterSchema` field names — do NOT hand-roll offsets.
- **Menu picker (§7):** grid nav (1=prev col,2=prev row,3=next col,4=next row,5=confirm), no wrap, disabled entries pre-filtered (skipped), no letter shortcuts, returns the original index.
- **Bonus allocator (§4):** keys 1=decrease/2=prev attr/3=increase/4=next attr/5=confirm-when-pool-0; cap 18; can't drop below racial floor; cursor wraps 0↔6 (STR..SPD..PER).
- **Class order (canonical `@wiz6/data`):** 0=Fighter…9=Bishop,10=Lord,11=Samurai,12=Monk,13=Ninja.
- **Open RE (do NOT block on these — use the documented best-known and leave a TODO):** Fighter skill-budget tier2 specifics; portrait default (0 vs SPD+1) — use the Stage-A `rollSkillBudget` + portrait default 0 as implemented.

---

## File structure (new, under `packages/viewer/src/pages/roster/creation/`)

```
creation/
├── state.ts                  # CreationState type, initialState, creationReducer (pure), ScreenId enum
├── messages.ts               # per-screen msg.dbs string lookup (§3 IDs) over the extracted msg.json
├── CreationPage.tsx          # owns useReducer + WichmannHill + keyboard + asset load; renders current screen
├── screens/
│   ├── ScreenProps.ts        # shared { state, dispatch, fontSet, palette } contract + key→event mapping helper
│   ├── NameInputScreen.tsx   # screen 00 (raw-key text input)
│   ├── MenuPickerScreen.tsx  # screens 02/03/05 (race/sex/class) — parametrized §7 picker
│   ├── BonusAllocatorScreen.tsx  # screen 06 (§4)
│   ├── PersonalityScreen.tsx     # screen 08 (karma roll, RETURN to accept)
│   ├── PortraitPickerScreen.tsx  # screen 10 (§6)
│   ├── SkillTrainScreen.tsx      # screen 13 (§5)
│   ├── SpellPickScreen.tsx       # screen 14 (§9, casters)
│   └── ConfirmScreen.tsx         # screen 15 (YES/NO)
tests mirror under packages/viewer/tests/pages/roster/creation/
```
Non-interactive steps (init/bonus-roll/derived/skill-init/items/redraw/save) are reducer ACTIONS in `state.ts`, not components.

---

## Task C1: Flow state machine (`state.ts`)

**Files:** Create `packages/viewer/src/pages/roster/creation/state.ts`, `packages/viewer/tests/pages/roster/creation/state.test.ts`.

**Goal:** Pure `creationReducer` + `CreationState` + `initialCreationState(rng)` + `ScreenId`, modeling §1's flow with byte-accurate engine calls for the non-interactive steps and event-driven transitions for interactive screens.

- [ ] **Step 1: Read** `docs/re/wpcmk-screens.md` §1 (the full screen sequence + transitions table + conditional branches) and the Stage-A engine exports (`WichmannHill`, `rollBonus`, `rollSkillBudget`, `rollKarmaWith`, `computeDerivedStats`, `RACE_BASE_STATS`, `meetsClassRequirements`, `classIsCaster`, `CLASS_SPELLBOOKS`) and `CharacterSchema` field names.
- [ ] **Step 2: Define the types.**

```typescript
// packages/viewer/src/pages/roster/creation/state.ts
import { WichmannHill } from '@wiz6/data';

export type ScreenId =
  | 'name' | 'race' | 'sex' | 'class' | 'bonusAllocator'
  | 'personality' | 'portrait' | 'skillTrain' | 'spellPick'
  | 'confirm' | 'committing' | 'done' | 'cancelled';

export interface CreationState {
  screen: ScreenId;
  rng: WichmannHill;                 // mutated in place by engine calls
  // in-progress character fields (subset of CharacterSchema, filled as we go):
  draft: {
    name: string;
    race: number | null;
    sex: number | null;
    class: number | null;
    attributes: { str:number; int:number; pie:number; vit:number; dex:number; spd:number; per:number; kar:number };
    bonusPool: number;               // rolled, then spent to 0 in allocator
    skillBudget: number;             // rolled, then spent to 0 in skill-train
    skills: number[];                // 30 entries
    portrait: number;
    spellPicks: number[];            // chosen spell entry indices
    // derived (computed at step 07): hp, stamina, gold, age, level, xp, encumbrance
    derived: Partial<{ hpInitial:number; stamina:number; gold:number; age:number; level:number; xp:number; encumbranceMin:number; encumbranceMax:number }>;
  };
  cursor: number;                    // active menu/allocator cursor
  scratch: Record<string, unknown>;  // per-screen ephemeral
}

export type CreationEvent =
  | { type: 'SET_NAME'; name: string }
  | { type: 'PICK_RACE'; index: number }
  | { type: 'PICK_SEX'; index: number }
  | { type: 'PICK_CLASS'; index: number }
  | { type: 'ALLOC_ADJUST'; attr: number; delta: number }   // +1/-1 to attr
  | { type: 'ALLOC_CONFIRM' }
  | { type: 'ACCEPT_PERSONALITY' }
  | { type: 'PICK_PORTRAIT'; index: number }
  | { type: 'TRAIN_SKILL'; slot: number }
  | { type: 'PICK_SPELL'; entry: number }
  | { type: 'SKILLS_DONE' } | { type: 'SPELLS_DONE' }
  | { type: 'CONFIRM'; keep: boolean }
  | { type: 'CANCEL' };
```

- [ ] **Step 3: Write failing tests** for the transition graph (one test per §1 edge). Cover: name→race→sex→(bonus rolled non-interactively)→class→allocator→(derived computed)→personality→(skill init)→portrait→(items)→(redraw)→skillTrain (only if `skillBudget>0`)→spellPick (only if `classIsCaster`)→confirm→committing (keep) | cancelled (discard). Assert the non-interactive steps populate the draft (e.g. after PICK_SEX the reducer rolls `bonusPool` via `rollBonus(rng)` and lands on `class`; after ALLOC_CONFIRM it computes `derived` via `computeDerivedStats` and rolls karma; etc.). Assert conditional skips (non-caster skips spellPick; zero skillBudget skips skillTrain). Assert determinism: same seed + same event sequence ⇒ identical final draft.
- [ ] **Step 4: Run, expect fail.**
- [ ] **Step 5: Implement** `creationReducer` + `initialCreationState`. Non-interactive steps fire as part of the transition INTO/OUT of adjacent events (e.g., `PICK_SEX` → set sex, roll `bonusPool`, advance to `class`). Use the Stage-A engine fns; seed attributes from `RACE_BASE_STATS` on PICK_RACE; gate class on `meetsClassRequirements`. CANCEL semantics per §1 (confirm-discard → `cancelled`; treat other screens' cancel per the reference — if unspecified, back one screen).
- [ ] **Step 6: Run, expect pass.**
- [ ] **Step 7: Commit.** `git add ... && git commit -m "feat(viewer): creation flow reducer + state machine (stage C)"`

---

## Task C2: Message-string wiring (`messages.ts`)

**Files:** Create `creation/messages.ts` + test.

**Goal:** Per-screen string lookup using the §3 msg IDs over the extracted `msg.json` (loaded via `loadMessageDb`). Provide `creationString(msgId: number): string` and named per-screen constants (e.g. `MSG.racePrompt = 0x0450`, etc., straight from §3).

- [ ] **Step 1: Read** §3 of `wpcmk-screens.md` (the msg-ID table) and how `loadMessageDb`/the MessageDb shape exposes a message by `id` (the `indexedMessages[].id` field — now fixed). Confirm how to map an id → text.
- [ ] **Step 2: Write failing test**: `MSG` constants match §3 (e.g. raceTitle=0x045c, racePrompt=0x0450, sexPrompt=0x0451, classPrompt=0x0452, bonusTitle=0x0460, confirmPrompt=0x044f, etc.); given a loaded MessageDb, `creationString(0x044f)` returns "SAVE THIS CHARACTER?". Use an injectable MessageDb (load real `msg.json` from disk in the test, like the font loaders in Stage B).
- [ ] **Step 3: Run, expect fail.**
- [ ] **Step 4: Implement** `messages.ts` (the `MSG` id table + a lookup that takes the loaded MessageDb). Race/class/skill/spell names use dynamic base+index (race `0x64+i`, class `0x78+i`, spell `0xFA0+i`).
- [ ] **Step 5: Run, expect pass.**
- [ ] **Step 6: Commit.**

---

## Task C3: Screen contract + generic menu-picker screen (race/sex/class)

**Files:** Create `creation/screens/ScreenProps.ts`, `creation/screens/MenuPickerScreen.tsx` + tests.

**Goal:** The shared screen contract + key→event mapping helper, and ONE parametrized menu-picker component driving race (02), sex (03), class (05) per §7.

- [ ] **Step 1: Read** §7 (menu-picker mechanics), §3 (the prompts/titles + option-name bases), Stage-B `windows.ts`/`render-frame.ts`/`highlight.ts`/`CreationCanvas.tsx`. Define `ScreenProps = { state, dispatch, fontSet, palette, messages }` and a `mapKey(e: KeyboardEvent): 1|2|3|4|5|null` helper (ArrowLeft→1, ArrowUp→2, ArrowRight→3, ArrowDown→4, Enter→5; per §8).
- [ ] **Step 2: Write failing tests**: `MenuPickerScreen` for race renders 11 options + prompt/title (RTL: it renders a `CreationCanvas`; assert it mounts + that pressing ArrowDown then Enter dispatches `PICK_RACE` with the cursor-advanced index; disabled class entries (failing `meetsClassRequirements`) are skipped by the cursor). Drive keys via `fireEvent.keyDown`.
- [ ] **Step 3: Run, expect fail.**
- [ ] **Step 4: Implement** `MenuPickerScreen` (props pick which list: races/sexes/classes + the dispatch event + the enabled-predicate). Build a `menuPanel` TileWindow, `puts` the options, `highlightRow` the cursor, render via `renderCreationFrame`/`CreationCanvas`; translate keys via the §7 grid-nav + the cursor (skip disabled). Confirm → dispatch the pick event.
- [ ] **Step 5: Run, expect pass.**
- [ ] **Step 6: Commit.**

---

## Task C4: Name-input screen (00)

**Files:** `creation/screens/NameInputScreen.tsx` + test. Per §1/§3 (prompt msg 0x044c "CHARACTER NAME >"); raw-key text entry (not the 1-5 model); ≤ the record name length; Enter submits (non-empty, unique), Esc/empty cancels.

- [ ] Steps: read §3 + the name-length limit from `CharacterSchema`; failing test (typing letters + Enter dispatches `SET_NAME`; empty+Enter does nothing/cancels); implement (controlled buffer rendered into `bottomBar`); pass; commit. Follow the C3 component pattern.

---

## Task C5: Bonus-allocator screen (06)

**Files:** `creation/screens/BonusAllocatorScreen.tsx` + test. Per §4: keys 1=decrease/2=prev/3=increase/4=next/5=confirm(pool==0); cap 18; floor = racial min; cursor wraps 0↔6; title msg 0x0460, labels 0x0454/0x0455/0x0453.

- [ ] Steps: read §4; failing test (Right increments current attr + decrements pool; can't exceed 18 or pool<0; Enter only confirms at pool 0 → dispatch `ALLOC_CONFIRM`); implement (dispatch `ALLOC_ADJUST`/`ALLOC_CONFIRM`; render stat panel in `top`, controls in `bottomBar`); pass; commit.

---

## Task C6: Personality/karma screen (08)

**Files:** `creation/screens/PersonalityScreen.tsx` + test. Per §1/§3: karma already rolled in the reducer (`rollKarmaWith`); this screen shows it (label msg 0x0457 "CASTING KARMA - PRESS \x15") and waits for RETURN → `ACCEPT_PERSONALITY`.

- [ ] Steps: read §3; failing test (Enter dispatches ACCEPT_PERSONALITY); implement; pass; commit.

---

## Task C7: Portrait-picker screen (10)

**Files:** `creation/screens/PortraitPickerScreen.tsx` + test. Per §6: cycle all portraits (no race/sex filter), keys Left/Right cycle, Enter selects → `PICK_PORTRAIT`; labels msg 0x0458/0x0459; default index per Stage-A (0). Render the WPORT image area in `menuPanel` (a portrait image; if portrait assets aren't wired yet, render the index + a placeholder and leave a TODO to wire the actual WPORT*.EGA pixels).

- [ ] Steps: read §6; failing test (Left/Right change index, Enter dispatches PICK_PORTRAIT); implement; pass; commit.

---

## Task C8: Skill-train screen (13)

**Files:** `creation/screens/SkillTrainScreen.tsx` + test. Per §5: spend `skillBudget` across the 4 skill categories (WEAPONRY/PHYSICAL/PERSONAL/ACADEMIA, labels msg 0x0258+); loops until budget 0; each allocation raises a `skills[]` slot; "SKILL POINTS" label msg 0x159a. Dispatch `TRAIN_SKILL`/`SKILLS_DONE`.

- [ ] Steps: read §5; failing test (allocating raises skills[slot] + decrements budget; when budget hits 0 → SKILLS_DONE); implement; pass; commit.

---

## Task C9: Spell-pick screen (14)

**Files:** `creation/screens/SpellPickScreen.tsx` + test. Per §9: casters only; pick spells from the 82-entry table filtered by the class's spellbooks (`CLASS_SPELLBOOKS`/`SPELL_TABLE`); spell names via msg `0xFA0 + entryIdx`; title 0x02bc "SPELLS", "COST" 0x0f75. Dispatch `PICK_SPELL`/`SPELLS_DONE`.

- [ ] Steps: read §9 + `CLASS_SPELLBOOKS`/`SPELL_TABLE`; failing test (Mage sees mage-book spells; picking dispatches PICK_SPELL; correct pick-count → SPELLS_DONE); implement; pass; commit.

---

## Task C10: Confirm screen (15)

**Files:** `creation/screens/ConfirmScreen.tsx` + test. Per §1/§3/§10: shows the full character sheet (top window) + "SAVE THIS CHARACTER?" (msg 0x044f) + YES/NO (msg 0x045a); YES → `CONFIRM {keep:true}`, NO → `CONFIRM {keep:false}`.

- [ ] Steps: read §3/§10; failing test (YES dispatches CONFIRM keep:true; NO keep:false); implement (render the assembled sheet — name/race/sex/class/attrs/hp/stamina/gold); pass; commit.

---

## Task C11: `CreationPage` integration

**Files:** Create `creation/CreationPage.tsx` + test. Owns `useReducer(creationReducer, initialCreationState(new WichmannHill(...)))` (seed from `Date.now()` or `?seed=`), loads `loadCreationFontSet` + `loadMessageDb` once, attaches a `keydown` listener, and renders the component for `state.screen`. On `committing`: build a `Character` from the draft (via `CharacterSchema` + `encodeCharacterRecord` round-trip optional), `addCharacter`, navigate to `/roster`.

- [ ] **Step 1: Read** `roster-store` `addCharacter`, `CastleScreen`'s asset-load pattern, the existing `NewCharacterPage` route usage.
- [ ] **Step 2: Failing test**: mount `<CreationPage seed={12345}/>` in a MemoryRouter; assert it renders the name screen first; script a full keydown sequence through a Fighter creation; assert `addCharacter` was called with a valid `Character` (name/race/sex/class/attrs set) and navigation to `/roster`. (A second test: a Mage exercising the spell-pick branch.)
- [ ] **Step 3-6:** run/fail → implement → run/pass → commit.

---

## Task C12: Stage C wrap-up + queue Stage D

**Files:** Modify `TODO.md`. Confirm full viewer suite green. Note Stage C complete; queue **Stage D**: swap the `/roster/new` route to `CreationPage`, delete the old wizard (`NewCharacterPage.tsx` + `steps/` + `lib/draft.ts`/`build-character.ts` + their tests), remove `pinMaxBonusRoll`. Commit.

---

## Self-review notes (parent only)
- **Spec coverage:** Stage C = spec's `state.ts` + `screens/` + `CreationPage`. Stage D = cutover/deletion (intentionally deferred so the new flow can be built + tested alongside the old one before removal).
- **Reducer-first ordering:** C1 (state machine) is the backbone; every screen (C3–C10) is a thin event emitter over it; C11 wires it to React/RNG/keyboard. This keeps the byte-accurate logic in the pure reducer (testable without DOM) and the screens dumb.
- **Leverage:** screens reuse Stage-B `renderCreationFrame`/`CreationCanvas`/`highlight` + `puts`; engine math is all Stage-A. If a subagent starts re-deriving a formula or re-blitting glyphs, stop — it's already done.
- **Open RE that does NOT block Stage C:** Fighter tier2 + portrait default — use the Stage-A implementations; leave TODOs. The old `/roster/new` wizard stays live until Stage D, so nothing user-facing breaks mid-stage.
- **Portrait pixels:** wiring actual WPORT*.EGA portrait images into the picker may need a portrait asset/loader; if not readily available, C7 renders index + placeholder with a TODO (doesn't block the flow).
