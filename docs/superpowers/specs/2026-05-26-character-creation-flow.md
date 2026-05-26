# Character Creation Flow — Design Spec

**Date:** 2026-05-26
**Status:** Approved — ready for implementation plan

## Goal

Build an engine-faithful, multi-step character creation wizard at `/roster/new`. New characters land in the roster (`@wiz6/data` Roster schema, localStorage-backed via `roster-store.ts`). The flow mirrors Wiz6's training-grounds creation sequence, gated by the existing `pinMaxBonusRoll` house rule for the cursed bonus-roll RNG.

## Architecture

Single React route `/roster/new` containing a wizard shell that owns a `CharacterDraft` state object. Each of the 9 steps is its own component receiving `{ draft, onUpdate, onNext, onBack }`. The shell tracks current step index (0..8), validates the draft against the current step's completion criteria, and only enables the Next button when valid. Back navigation always allowed; forward navigation gated on step validity. Browser history records each step transition via `pushState` so refresh and deep-linking work.

## Engine-faithful step order

Mirrors wpcmk's flow:

1. **Name** — text input, ≤14 chars. Validation: non-empty, ASCII printable.
2. **Race** — 11 races (Human, Elf, Dwarf, Gnome, Hobbit, Faerie, Lizardman, Dracon, Felpurr, Rawulf, Mook). Selecting a race seeds `attributes` from `RACE_BASE_STATS[raceIdx]`. Cards show race name + stat floors.
3. **Bonus roll** — pinned to max if `pinMaxBonusRoll` house rule is ON (default). Shows the rolled value, "Accept" button. Stock mode uses `karmaRoll(rng)`-style RNG (TBD: actual bonus-roll formula from wpcmk not yet decoded).
4. **Class pick** — 14 classes. Each shown with its attribute requirements (`CLASS_REQUIREMENTS`). Buttons disabled (greyed) for classes whose requirements aren't met given race floors + bonus pool spent so far. `meetsClassRequirements(attrs, classIdx)` helper from existing data.
5. **Attribute distribute** — six +/- pairs for STR/IQ/PIE/VIT/DEX/SPD with a pool counter. Lower bound = race floor; upper bound = 18 (Wiz6 cap). Must spend all bonus points to proceed.
6. **Skill points** — class-specific skill list via `CLASS_SKILL_AVAILABILITY[classIdx]`. Pool = level-1 starting skill points (TBD; placeholder 10 for now). +/- buttons per available skill.
7. **Spell picker** — caster classes only (`classIsCaster(classIdx)`). Renders N picker dialogs, where N = sum of `CLASS_SPELLBOOKS[classIdx]`. Each picker shows the book's spells filtered by `byte5 & bookMask` from the 82-entry spell table. Non-casters skip this step entirely.
8. **Karma roll** — display-only `karmaRoll()` result. "Accept" button.
9. **Review** — final card showing all chosen values, derived portrait (`SPD + 1` → portrait index). "Create character" button writes to roster via `addCharacter()`, navigates to `/roster`.

## State shape

```ts
type CharacterDraft = {
  name: string;
  raceIdx: number | null;
  classIdx: number | null;
  bonusPool: number;
  attributes: { str: number; iq: number; pie: number; vit: number; dex: number; spd: number };
  bonusDistribution: { str: number; iq: number; pie: number; vit: number; dex: number; spd: number };
  skillPoints: Record<number, number>;
  starterSpells: Array<{ bookIdx: number; entryIdx: number }>;
  karma: number;
};
```

Initial draft: empty/null fields. Each step mutates only its own slice via `onUpdate({...})`.

## Validation rules

| Step | Valid when |
|---|---|
| Name | `name.length ≥ 1 && name.length ≤ 14` |
| Race | `raceIdx !== null` |
| Bonus roll | `bonusPool > 0` (set after rolling) |
| Class | `classIdx !== null && meetsClassRequirements(currentAttrs, classIdx)` |
| Attributes | `sum(bonusDistribution) === bonusPool` |
| Skill points | `sum(skillPoints values) === starterSkillPoints` |
| Spell picker | `starterSpells.length === expectedPickCount(classIdx)` (0 for non-casters) |
| Karma | `karma > 0` (set after rolling) |
| Review | always |

## Persistence

On Review's "Create character", construct a `Character` from the draft, generate a UUID id, call `addCharacter(char)` from `roster-store.ts`, then `useNavigate('/roster')`. No intermediate persistence — if the user navigates away mid-flow, the draft is lost. (Acceptable for v1; can add localStorage draft-resume later.)

## Open issues flagged in implementation

- **Bonus-roll max value**: actual elite-tier max from wpcmk's roll formula isn't byte-decoded yet. Placeholder constant `MAX_BONUS_POINTS = 28` with TODO comment in code.
- **Spell names**: 82-entry table has school/level/byte5 but no human names. Picker shows "School-Level #N" style placeholder labels (e.g. "Fire L3 #2"). Replaceable once names are decoded.
- **Skill names**: `SKILL_SLOT_NAMES` constant is martydill-sourced (speculative). UI uses them with a footnote about uncertainty.
- **Starter skill points pool**: placeholder 10 per character; actual engine value TBD.

## Routing changes

- Add `<Route path="/roster/new" element={<NewCharacterPage />} />` in `router.tsx`.
- Add "+ New Character" button to `RosterView.tsx` linking to `/roster/new`.

## File layout

```
packages/viewer/src/pages/roster/
├── NewCharacterPage.tsx                 # wizard shell
├── NewCharacterPage.module.css
├── steps/
│   ├── NameStep.tsx
│   ├── RaceStep.tsx
│   ├── BonusRollStep.tsx
│   ├── ClassPickStep.tsx
│   ├── AttributeDistributeStep.tsx
│   ├── SkillPointStep.tsx
│   ├── SpellPickStep.tsx
│   ├── KarmaStep.tsx
│   ├── ReviewStep.tsx
│   └── shared.module.css               # common wizard step CSS
└── lib/
    ├── draft.ts                         # CharacterDraft type, initialDraft, validation helpers
    └── draft.test.ts

packages/viewer/tests/pages/roster/
├── NewCharacterPage.test.tsx            # integration: Fighter happy-path
├── NewCharacterPage.caster.test.tsx     # integration: Mage with spell picker
└── steps/
    └── (one .test.tsx per step)
```

## Testing approach

- **Unit per step**: vitest + @testing-library/react. Each step component receives props + asserts rendered UI and onNext/onUpdate behavior.
- **Integration**:
  1. Fighter happy-path — type name → pick race → accept bonus → pick class → distribute attrs → skill points → karma → review → create → assert roster has new character.
  2. Mage with spell picker — same flow but with caster class; assert spell picker presents Mage book spells, two picks made, draft.starterSpells.length === 2.
- **Validation**: each step's "Next disabled" path covered.
- **Draft state machine**: unit tests in `draft.test.ts` for the validation predicates.

## Out of scope (deferred)

- Resuming a draft after navigation (no localStorage persistence of in-progress draft).
- Editing an existing character (separate route, separate flow — same draft component might be reusable later).
- Actual engine-RNG parity for bonus roll and karma roll (placeholder formulas; correct ordering and pinning behavior, but byte-level RNG accuracy not targeted in v1).
- DOS-EGA-themed styling. Use existing dark-theme tokens; not pixel-art recreation.
- Auto-add to party (out of scope per design choice — roster only).
