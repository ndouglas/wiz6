---
title: wpcmk byte-perfect, screen-accurate port
date: 2026-05-26
status: Approved — ready for implementation plan
supersedes: docs/superpowers/specs/2026-05-26-character-creation-flow.md
---

# wpcmk Byte-Perfect Character Creation — Design Spec

## Goal

Reverse-engineer the entire `wpcmk.ovr` character-creation overlay (plus the portrait picker and post-commit return path) and replace the current `/roster/new` wizard with a screen-accurate, byte-perfect reproduction. "Frame-perfect" here means the rendered screens, the keyboard interaction, and the on-disk character record all match the original DOS engine — derived from the binary, not from playing through DOSBox.

This spec supersedes `2026-05-26-character-creation-flow.md`. The existing 9-step React wizard (and its tests, and the `pinMaxBonusRoll` house rule) is deleted at cutover.

## Scope

**In scope:**
- `wpcmk_create_character_master` and everything it transitively reaches: race/class/alignment menu pickers, attribute roller, bonus-point roller, bonus allocator, skill-train UI, spell picker (caster classes), karma roll, character-sheet redraw, welcome animation.
- Portrait picker subscreen (`portrait_*` family in wpcmk).
- Post-creation return path: disk commit to `pcfile.dbs`, slot resolution / occupancy handling, transition back to wbase state 4.
- Byte-perfect Wichmann-Hill RNG (the engine's 3-stream Lehmer LCG at wroot `0x125b9`, seedable for parity testing).
- Pixel-accurate EGA rendering using the same palette, fonts, and window geometry the engine uses.
- Engine-exact keyboard input (cursor, accept, cancel, letter shortcuts where the engine had them). No mouse, no touch.

**Out of scope:**
- wbase main-menu entry handling (how the user reaches `/roster/new` from elsewhere in the app — this remains a router click in the SPA, not an in-game menu).
- In-game character editing (`wpcmk` may be reused for that — separate later effort).
- Audio. Sound effects for cursor moves, accept, etc. wired in a follow-up.
- Mouse / touch input.
- House rules / mercy toggles.
- Backwards compat with the current `/roster/new` route shape.
- Resuming a partial creation across page reload — engine doesn't, we don't.

## Architecture

Two-phase delivery.

### Phase 1 — Exhaustive RE

Each item below is one parallel-dispatchable subagent investigation producing structured findings under `docs/re/findings/`. After parent review, prose is promoted to a new `docs/re/wpcmk-screens.md` reference document — the per-screen ground truth the port reads against.

**Flow + structure**
1. **Screen-flow map.** Walk `wpcmk_create_character_master` (file 0x4e47) top-to-bottom. Identify every screen state, transitions, conditional branches (e.g., spell picker skipped for non-casters). Output: ordered list of screens with entry/exit conditions and the on-buffer side effects of each.
2. **Window layouts.** For each screen, decode the `ui_window_create` call sites — coordinates, dimensions, frame style, fg/bg colors. Output: per-screen window-geometry table.
3. **msg.dbs string IDs per screen.** Resolve every `ui_window_putstring*` thunk argument to its msg.dbs ID. Output: per-screen string table (title, prompts, error strings, button labels).

**Per-loop UI mechanics**
4. **Bonus-allocator UI loop.** Decompile `bonus_allocator_*`. Cursor mechanics, +/- handling, pool tracking, edge cases (can't lower below race floor, can't raise past 18). Output: state machine + key-handling pseudocode.
5. **Skill-train UI loop.** Decompile `skill_train_*`. 4-pillar → 82-entry mapping, starter pool value (resolves the placeholder `10` from the superseded spec), point-spending rules, validation. Output: state machine + the actual starter-pool integer.
6. **Portrait picker UI loop.** Decompile `portrait_*`. Left/right cursor through WPORT*.EGA, race+sex filter logic, default index, accept/cancel flow. Output: state machine + filter formula.
7. **Generic menu picker.** Decompile the widget used by race/class/alignment screens. Cursor wrap, disabled-entry handling (e.g., classes whose requirements aren't met), letter shortcuts.

**Keyboard + cross-overlay**
8. **`kbd_check_with_filter` filter masks per screen.** Each screen calls the keyboard thunk with a mask saying which keys are valid. Output: per-screen keymap.
9. **Spell-name resolution.** The 82-entry spell table has school/level/byte5 but no names — find the msg.dbs IDs (or procedural label scheme) the engine uses to label each entry.

**Boundary & commit**
10. **Post-commit return path.** Disk write (pcfile.dbs slot resolution, occupancy handling), state transition back to wbase state 4. Output: commit sequence + slot-resolution rules.
11. **Remaining unnamed wpcmk functions** (10 of 76). Name pass on the leftovers; some may turn out to be relevant to the above.

**Sub-investigation:** Wichmann-Hill seed source — the engine seeds at game boot from some source (clock / CPU tick / constant). For full-flow parity we need to know the seed *at the moment creation starts*, not just at boot.

Some items are independent (1–3, 8, 9, 11); items 4–7 benefit from 1 being done first (the screen map identifies what each loop is *for*).

### Phase 2 — Port

Code lives under `packages/viewer/src/pages/roster/creation/` (new directory). Existing `NewCharacterPage.tsx` and `steps/` are deleted at cutover.

```
packages/viewer/src/pages/roster/creation/
├── CreationPage.tsx                 # top-level: owns reducer, RNG, canvas, keyboard listener
├── engine/
│   ├── rng.ts                       # Wichmann-Hill 3-stream LCG
│   ├── rng.test.ts
│   ├── formulas.ts                  # rollBonus, rollAttributes, rollKarma, bumpToMeetClass, derivePortraitPool
│   ├── formulas.test.ts
│   ├── state-machine.ts             # typed reducer; mirrors RE item #1
│   ├── state-machine.test.ts
│   ├── character-record.ts          # 432-byte struct serializer
│   └── character-record.test.ts
├── ega/
│   ├── window.ts                    # window-chrome drawer
│   ├── font.ts                      # glyph blit from extracted font
│   ├── cursor.ts                    # blinking cursor
│   └── palette.ts
└── screens/
    ├── NameInputScreen.tsx
    ├── RaceMenuScreen.tsx
    ├── BonusRollScreen.tsx
    ├── ClassMenuScreen.tsx
    ├── BonusAllocatorScreen.tsx
    ├── SkillTrainScreen.tsx
    ├── SpellPickerScreen.tsx
    ├── KarmaRollScreen.tsx
    ├── PortraitPickerScreen.tsx
    ├── ReviewScreen.tsx
    └── __snapshots__/               # pixel-snapshot fixtures
```

The final screen list comes from RE item #1; the list above is illustrative.

### Deletions at cutover
- `packages/viewer/src/pages/roster/NewCharacterPage.tsx` and the `steps/` directory
- `packages/viewer/tests/pages/roster/NewCharacterPage.test.tsx` and `NewCharacterPage.caster.test.tsx`
- `pinMaxBonusRoll` house rule (settings entry + any UI references)

## State shape

```ts
type CreationState = {
  currentScreen: ScreenId;       // discriminant from state-machine.ts
  record: CharacterRecord;       // 432-byte struct, partially filled as creation progresses — authoritative
  rng: WichmannHillState;        // 3-stream LCG state, serializable
  cursor: number;                // active menu cursor / picker index
  scratch: ScratchPad;           // per-screen ephemeral (text-input buffer, allocator pool counter, etc.)
};
```

`record` is the source of truth; each screen mutates its specific slice (matching what wpcmk writes to DGROUP `0x5470`). No separate `CharacterDraft` type.

## Data flow

```
keydown → CreationPage.handleKey → reducer(state, event, rng) → new state
                                                                    ↓
                                                          screens[state.currentScreen]
                                                                    ↓
                                                          renders to canvas via ega/
```

**RNG lifecycle.** Constructed once at `CreationPage` mount with a seed from `Date.now()` (default) or a query-param (`?seed=...`) for parity testing. Passed by reference to the reducer. Each `rng.next(...)` call mutates state; serializable so save/restore mid-creation works.

**msg.dbs consumption.** Screens look up strings via a `messages.ts` map (built at `predev` time from existing msg.dbs JSON output). Per-screen string IDs come from RE item #3. No runtime msg.dbs parsing.

**Commit path.** `ReviewScreen` "Accept" dispatches a `COMMIT` event. The reducer transitions to a terminal `COMMITTING` state; `CreationPage` observes this, calls `character-record.ts` to serialize, then `roster-store.addCharacter()`, then `navigate('/roster')`. If the engine has a post-commit screen ("Created — press any key to return"), it lives between `COMMITTING` and navigation.

**Cancel handling.** ESC dispatches a `CANCEL` event. The reducer follows wpcmk's actual cancel semantics from RE — which may be "back to previous screen" for most screens but "abort entire creation, return to main menu" at certain points. The reducer encodes what the binary does; we do not invent friendlier semantics.

## Testing strategy

Three layers, TDD per commit (red → green → refactor).

**Unit (engine/)**
- `rng.test.ts` — Wichmann-Hill output sequence parity against captured DOSBox trace fixture.
- `formulas.test.ts` — one test per decoded routine. `rollBonus`: 1M-sample distribution check matches `(90.25% / 9.50% / 0.25%)` documented in `wpcmk-character-creation.md`. `bumpToMeetClass`: enumerated outputs per (race, class). `derivePortraitPool`: enumerated outputs per (race, sex).
- `state-machine.test.ts` — one test per transition edge from RE item #1. Covers cancel semantics, conditional skipping (spell picker → karma when non-caster).
- `character-record.test.ts` — round-trip partial record through serializer, compare to `character-record-*.json` layout.

**Component (screens/)**
- One per screen. Each receives a known state, asserts canvas-pixel snapshot + that keydown events dispatch the right actions. Snapshots reviewed manually on first run, then locked. Tests run at fixed `devicePixelRatio = 1`; font is bitmap (not vector); assertions against PNG buffers (not data URLs) to avoid sub-pixel rounding flakiness.

**Integration (CreationPage)**
- **Fighter happy-path**: scripted keydown sequence drives full creation; assert final record bytes match a captured DOSBox-saved character.
- **Mage with spell picks**: exercises the spell-picker branch.
- **Cancel mid-creation**: drive partway, press ESC at the right screen, assert engine-accurate cancel destination, no record written.
- **Slot-occupancy overwrite**: drive to commit on an occupied slot, assert overwrite prompt + accept overwrites + reject backs out.

**Parity (`tools/parity/`)**
- New target: `tools/parity/decode-character.ts`. Given a DOSBox save state and a slot index, extract the 432-byte character record from physical memory at `*0x5470`. Given the same Wichmann-Hill seed + input event log, the port produces a byte-identical record.
- Capture playbook: DOSBox saves mid-creation at known checkpoints (race chosen, class chosen, attributes allocated, etc.); diff against port output at the equivalent state-machine state.
- CI runs at least one full caster + non-caster creation flow as parity tests.

## Open issues

Resolved by Phase 1 unless noted otherwise.

- **Starter skill-points pool value.** Placeholder `10` in superseded spec; real value pinned by RE item #5.
- **Spell-name source.** msg.dbs IDs vs procedural labels — RE item #9.
- **Font file.** Whether wpcmk uses `WFONT.*` or something special. RE item #2 confirms.
- **Slot-picker location.** wbase vs wpcmk. The `roster_*` family in wpcmk hints both ways. RE item #10 resolves.
- **Per-screen cancel semantics.** Some screens back up one step, some abort entirely. RE item #1 enumerates.
- **Wichmann-Hill seed at creation start.** Engine seeds at game boot; for full-flow parity we need the seed value *when creation begins*. Sub-investigation under Phase 1.

## Risks

- **`character-record-extended-map.json` is v2.** If the on-disk layout has cases the v2 map doesn't cover (spellbook flag encoding, alignment bytes), the serializer test fails late. Mitigation: prioritize RE item #10 (post-commit) early — it forces a full record byte-by-byte verification.
- **EGA primitive scope creep.** `CastleScreen`'s patterns may not generalize cleanly to all wpcmk screens. Mitigation: a dedicated Phase 2 prologue task extracts and freezes the `ega/` API before any screen impl.
- **Pixel-snapshot brittleness.** Font anti-aliasing, browser canvas sub-pixel rounding, devicePixelRatio. Mitigation in Testing section.
- **Findings-JSON fallibility.** Per the memory `findings-json-fallibility.md`, "high confidence" claims in findings JSON can still be wrong. Phase 1 outputs are parent-reviewed and spot-checked against the asm before promotion to `docs/re/wpcmk-screens.md`.

## Persistence

On `ReviewScreen` "Accept", construct a `Character` (typed by `@wiz6/data` `CharacterSchema`) from the serialized record, generate a UUID id, call `addCharacter(char)` from `roster-store.ts`, then `useNavigate('/roster')`. No intermediate persistence — if the user navigates away mid-flow the draft is lost. Engine matches: it doesn't persist mid-creation either.

## Routing changes

- `/roster/new` route remains; behind it `CreationPage` replaces `NewCharacterPage`.
- "+ New Character" button on `RosterView.tsx` continues to link to `/roster/new`.
- `?seed=...` query param read at mount for parity-test mode.

## File layout summary

See "Phase 2 — Port" above for the full tree. Brief recap of what's new vs deleted:

**New** under `packages/viewer/src/pages/roster/creation/`: `CreationPage.tsx`, `engine/` (rng, formulas, state-machine, character-record + tests), `ega/` (window, font, cursor, palette), `screens/` (one per wpcmk screen + snapshot fixtures).

**Deleted** under `packages/viewer/src/pages/roster/`: `NewCharacterPage.tsx`, `steps/`.

**Deleted under tests**: `NewCharacterPage.test.tsx`, `NewCharacterPage.caster.test.tsx`.

**Modified**: `roster-store.ts` unchanged. `RosterView.tsx` unchanged (link target same). House-rule settings entry for `pinMaxBonusRoll` removed.

**New parity target**: `tools/parity/decode-character.ts` + capture playbook in `tools/parity/README.md`.
