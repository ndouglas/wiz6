# Wizardry VI Webapp — Design Spec

**Date:** 2026-05-19
**Status:** Approved (pending written-form review)
**Scope:** Faithful TypeScript reimplementation of *Wizardry VI: Bane of the Cosmic Forge* (DOS), with toggleable modern expansions and a headless training environment for reinforcement learning agents.

## Goals

- Faithful reimplementation of Wiz6 DOS in TypeScript, runnable in the browser.
- Pixel-faithful first-person + monster sprite rendering. Modernized UI chrome that augments the original look without replacing it.
- Toggleable expansions: auto-map / top-down view, journal / quest log, persistent combat log, multi-slot saves with quick-save/load, party templates.
- Strict Mode setting that disables every augmentation, restoring the original UX.
- Headless training environment exposing a Gymnasium-style API for training agents to play the game.
- Engine-level hint system to deal with genuinely unsolvable puzzles (the "concessions" for RL training and for human players).

## Non-Goals (v1)

- Loading original Wiz6 save files. Format research is its own project; punt.
- Wiz7 / Wiz8 support. Same Cosmic Forge engine family but different scenarios and later iterations.
- Mod / custom scenario support. Designed for, but post-v1.
- Multiplayer.
- Mobile-first UI. Desktop primary; mobile may follow from a responsive layout but is not a stage gate.

## Reverse-Engineering Methodology

Hybrid:

- Cross-reference community documentation (Cosmic Forge wiki, format notes, prior partial reverse-engineering work). Use as hypothesis, never as code source.
- Disassemble specific overlays in Ghidra when behavior is ambiguous or undocumented. The original game's overlay split (`wmele.ovr`, `wmexe.ovr`, `wmaze.ovr`, `wmnpc.ovr`, `wpops.ovr`, `wtrea.ovr`, `wpcvw.ovr`, `wpcmk.ovr`, `wbase.ovr`, `wdopt.ovr`, `winit.ovr`) maps roughly to system boundaries and will inform our package boundaries.
- Validate everything against the original game running in DOSBox via a scripted-input + state-snapshot harness (built once, reused per system).

## Stack

- **Language:** TypeScript everywhere — engine, parser, render, UI, headless CLI.
- **Workspace:** pnpm monorepo with strict package boundaries enforced via tsconfig project references and an eslint rule banning DOM and Node-only imports in the engine and data packages.
- **Rendering:** Canvas 2D. WebGL is overkill for Wiz6's fixed-perspective wireframe + sprite composition.
- **UI Framework:** React.
- **Runtime:** Browser (UI) + Node (headless / training).

## Repo Layout

```
/
├── original/                # DOS files (gitignored): wroot.exe, *.ovr, *.dbs, *.pic, *.hdr, ...
├── extracted/               # ETL output (gitignored): JSON + PNG
├── packages/
│   ├── data/                # @wiz6/data    — TS types + zod schemas for extracted data; loader interfaces
│   ├── parser/              # @wiz6/parser  — CLI: reads original/, writes extracted/
│   ├── engine/              # @wiz6/engine  — pure deterministic core
│   ├── render/              # @wiz6/render  — Canvas 2D renderers (first-person + auto-map)
│   ├── ui/                  # @wiz6/ui      — React app
│   └── headless/            # @wiz6/headless — Node CLI for training / sim
├── docs/
│   ├── re/                  # one .md per file format / system reverse-engineered
│   └── superpowers/specs/   # design specs
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Package Dependency Graph

One-way:

- `data` → nothing
- `parser` → `data`
- `engine` → `data`
- `render` → `engine`
- `ui` → `engine` + `render` + `data`
- `headless` → `engine` + `parser` + `data`

Enforced via tsconfig project references plus an eslint `no-restricted-imports` rule banning DOM and Node-only modules from `engine` and `data`.

## Engine Architecture

The whole engine is one function:

```ts
function step(
  state: GameState,
  action: Action,
  rng: RngContext,
): { state: GameState; events: GameEvent[] };
```

- **`GameState`** is fully JSON-serializable: party, current map id + position + facing, NPC states, optional active encounter, inventory, time, RNG seed, sub-mode (`overworld` | `combat` | `menu` | `dialogue`).
- **`Action`** is a discriminated union. `legalActions(state)` returns the legal-action mask, consumed by both the UI (to enable/disable buttons) and NN training (to mask the policy).
- **`rng`** is supplied by the caller; the engine never reads `Math.random` or `Date.now`. RNG state lives in `GameState`.
- **`events`** are the load-bearing side channel. Every meaningful thing the engine does emits an event. Journal entries, combat log, UI animations, sound, NN reward shaping, and save deltas are all event consumers; they never reach into engine internals.

### Determinism Guarantees

Same `(state, action, rng)` produces the same `(state', events)`. Validated by replay tests that fix a seed and assert against a recorded event trace. This property is what makes parallel headless rollouts safe for training.

### Combat as a Sub-State Machine

When an encounter triggers, `state.mode = 'combat'` and `state.combat` becomes populated. Combat has its own action space (attack, defend, cast, parry, run, change party order). The same `step()` function dispatches based on `mode`. When combat resolves, mode flips back and a `CombatResolvedEvent` summarizes the outcome.

### Hint System

`hint(state, level): Hint[]` — the engine knows what currently constitutes a soft-lock and what nudges to give. Exposed to the player through the journal / quest log; exposed to RL training as an optional free action.

### Save Format

`JSON.stringify(state)` plus a `schemaVersion` field. Migrations between versions are explicit functions in `engine`.

### Things the Engine Does Not Do

- **Animation timing.** Engine state has no notion of "this animation is playing for 200ms." Anything time-based is UI-side (renderers interpolate between engine states or pace event playback).
- **Audio playback.** The engine emits `PlaySoundEvent`; the UI decides whether to play it. Headless mode ignores those events. `.snd` files are extracted to WAV (or similar) by the parser.

## Data Flow

### Build-Time

```
original/
   ↓
@wiz6/parser CLI (`pnpm parse`)
   ↓
extracted/
   ├── monsters.json + monsters/<n>.png
   ├── items.json
   ├── spells.json
   ├── classes.json
   ├── races.json
   ├── maps/<level>.json
   ├── messages.json
   ├── portraits/<n>.png
   ├── tiles/*.png
   └── manifest.json     (versions + checksums for cache invalidation)
```

### Runtime — Browser

`@wiz6/ui` fetches JSON from `/extracted/` and zod-validates via `@wiz6/data`. Image atlases are preloaded at startup.

### Runtime — Headless

`@wiz6/headless` reads JSON from disk via `@wiz6/data`'s Node loader.

### Snapshot Fixtures

Small known-good samples (one map, a handful of monsters, a few items) committed to git as test fixtures. Bulk extracted data stays gitignored.

## UI Architecture

Pixel-faithful game viewports + augmented original-styled chrome. Every augmentation is a toggleable setting in a "QoL" group; defaults are on; Strict Mode disables them all at once.

### Game Viewports

- **First-person viewport** — pixel-faithful EGA reproduction. Same wall-piece composition as original (`mazedata.ega` chunks). Monster sprites from `mon*.pic`.
- **Auto-map viewport** — top-down grid; fog of war until visited or Locate-style spell reveals; party position + facing arrow; click to zoom; toggle to a level-stack overview that floats above the dungeon. Default-on (the headline expansion); off in Strict Mode.

### UI Chrome (React)

Original visual frame preserved: monospace text, EGA palette, mnemonic keyboard menus. Augmentations land *in place* on the screens that need them.

| Original screen | Keep as-is | Augmentation (toggleable; off in Strict Mode) |
|---|---|---|
| 3D viewport | yes | — |
| Party panel | yes | — |
| Menu prompt (F)ight C)ast etc.) | yes | — |
| Message log | yes | Persistent combat-log panel (collapsible) |
| Inventory | structure | Sort, compare, drag-to-equip |
| Dialogue (keyword input) | yes | Known-keyword list (Wiz7-style) |
| Spellbook | structure | Click-for-description |
| Combat readout | text | Inline damage numbers, initiative display |
| Saves | one slot → many | Multi-slot with screenshots + timestamps, F5/F9 |
| (none) | — | Journal / quest log auto-populated from events |
| (none) | — | Auto-map viewport |

### Game Loop

```
input → Action → engine.step(state, action, rng) → { state', events }
                                                    ├─→ renderers redraw
                                                    ├─→ event subscribers (journal, log, sound)
                                                    └─→ (headless) training tape (s, a, r, s')
```

State lives in a small Zustand-like store. Renderers and React components subscribe to state slices.

## Headless Training Environment

`@wiz6/headless` exposes a Gymnasium-style env:

```ts
const env = new WizardryEnv({ seed: 42, scenario: 'default' });
const obs = env.reset();
while (!env.done) {
  const action = policy.act(obs, env.legalActions());
  const { obs: next, reward, events, info } = env.step(action);
}
```

- **Observations** are a flat numeric encoding of state (party stats, position, visible tiles, encounter state).
- **Reward shaping** is pluggable; initial baseline = XP gained + new-tile-revealed bonus.
- **Hints** surface as an optional free action — the "concessions" for soft-lock puzzles.
- Parallel rollouts via worker threads; engine purity makes this safe.

## Reverse-Engineering Workflow

### Per File Format (parser package)

1. Hypothesize format from community docs + hex inspection.
2. Write parser + zod schema; emit JSON.
3. Round-trip check (re-pack to byte-identical original where feasible; for lossy formats, re-pack to a representative form).
4. Visual diff: viewer renders extracted assets side-by-side with DOSBox screenshots.
5. Document in `docs/re/<format>.md` — offsets, fields, gotchas.

### Per Gameplay System (engine package)

1. Disassemble the relevant overlay in Ghidra. Overlay-to-system mapping (approximate):
   - `wmele.ovr` → melee
   - `wmexe.ovr` → turn executive
   - `wmaze.ovr` → movement / maze traversal
   - `wmnpc.ovr` → NPCs
   - `wpops.ovr` → popups / messages
   - `wtrea.ovr` → treasure / items
   - `wpcvw.ovr` → PC view / character sheet
   - `wpcmk.ovr` → PC making (character creation)
   - `wbase.ovr` / `wdopt.ovr` / `winit.ovr` → base / display options / init
2. Identify formulas and RNG draws; document.
3. Implement in TS with identical RNG sequencing.
4. Golden test: scripted action sequence + fixed seed produces the same state trace as a DOSBox playthrough.
5. Document in `docs/re/<system>.md`.

### Validation Strategy

- **Static:** golden fixtures (small extracted samples + expected JSON) committed to git. Catches parser regressions on every test run.
- **Dynamic:** DOSBox harness (scripted input + state snapshots) gating engine releases. Built once during Stage 2; reused thereafter.
- **Community-known examples:** documented damage formulas and table values encoded as unit tests.

## Architectural Pillars (Invariants)

1. **Engine purity.** `@wiz6/engine` and `@wiz6/data` contain no DOM, Node, or wall-clock dependencies. Enforced by eslint + tsconfig.
2. **Determinism.** No randomness or time outside the RNG context. Replay tests verify.
3. **Event-driven expansions.** Every expansion (journal, log, auto-map, training tape) consumes the engine's event stream. No expansion modifies engine internals.
4. **Build-time ETL.** Original `original/*` files are never read by engine or UI at runtime; only by the parser CLI.
5. **Faithful viewport, augmentable chrome.** Game viewports are pixel-faithful; UI chrome augments the original look in-place; every augmentation has a setting; Strict Mode disables them all.

## Stages

Each stage gets its own `IMPLEMENTATION_PLAN.md` written at the start of the stage; each ends with golden tests passing plus a manual playtest checkpoint.

| # | Stage | Deliverable |
|---|---|---|
| 1 | **Data extraction + viewer** | `@wiz6/data`, `@wiz6/parser`, browser viewer for every extracted asset (maps, monsters, items, portraits, spells, messages). No game logic. **First plan to write.** |
| 2 | Engine: party + maps + movement | `step()` for overworld actions: move, turn, doors, stairs, traps, encounter triggers. Headless only. DOSBox harness built here. |
| 3 | Engine: combat | Full combat sub-state machine. Damage formulas verified against DOSBox. Headless only. |
| 4 | Engine: items, equip, spells | Inventory, equipment, spell effects. |
| 5 | Engine: NPCs, dialogue, quests | Keyword dialogue + quest state. |
| 6 | UI faithful pass | `@wiz6/render` + `@wiz6/ui`. First playable game. |
| 7 | Expansions + Strict Mode | Auto-map, journal, combat log, multi-save, party templates, settings panel. Every augmentation toggleable. |
| 8 | Headless training env + hint system | `@wiz6/headless` Gym-style env. Hint system as first-class engine concept. |
| 9 | (Future) Mod / scenario support | Schema and loader for custom scenarios. |

## Open Questions / Punted

- **DOSBox harness specifics:** which fork (DOSBox-X? a TAS build?), input scripting format, state snapshot format. Decided at Stage 2 start.
- **Save format migration policy:** decided after the first multi-version playtest.
- **Mobile UI:** out of scope; revisit after Stage 7.
