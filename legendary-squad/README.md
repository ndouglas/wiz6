# Legendary Squad — a ready-to-play Wiz6 party

A pre-rolled 6-character party where **every member is an elite class**. Built by
driving the original Wizardry VI character-creation flow through the dosbox-pure
harness with the creation bonus-bypass flag (`*0x56ce = 1` → the bonus roll comes
up 21 every time), so each character had enough bonus points to qualify for an
otherwise-grindy elite class outright.

## Roster

| Slot | Name  | Race          | Class         | Sex | Attributes (STR/INT/PIE/VIT/DEX/SPD/PER/KAR) |
|-----:|-------|---------------|---------------|-----|----------------------------------------------|
| 0    | TWINK | Faerie (5)    | Ninja (13)    | M   | 14 / 11 / 10 / 12 / 12 / 14 / 12 / 6         |
| 1    | BEAU  | Rawulf (9)    | Lord (10)     | M   | 18 / 9 / 12 / 12 / 9 / 9 / 14 / 11           |
| 2    | VEXA  | Lizardman (6) | Valkyrie (8)  | F   | 18 / 5 / 11 / 14 / 10 / 11 / 8 / 13          |
| 3    | SABLE | Felpurr (8)   | Samurai (11)  | F   | 18 / 12 / 7 / 9 / 12 / 14 / 11 / 7           |
| 4    | EMBER | Dracon (7)    | Monk (12)     | F   | 15 / 8 / 13 / 12 / 10 / 13 / 8 / 10          |
| 5    | QUILL | Mook (10)     | Bishop (9)    | M   | 17 / 15 / 15 / 10 / 7 / 7 / 9 / 8            |

(Valkyrie is female-only; the other sexes are cosmetic. Quill the Bishop learned
two starting spells — one MAGIC, one FAITH — during creation.)

## How to use it

Drop `pcfile.dbs` into your Wizardry VI save directory (the same folder that
holds the game's existing `PCFILE.DBS`), replacing the file there. Boot the game,
choose **ADD PARTY MEMBER** from MASTER OPTIONS, and the six characters above will
be available to add to your party.

> Back up your existing `PCFILE.DBS` first — this overwrites the whole roster.

## How it was generated

`tools/libretro/build-legendary-squad.ts` drives the creation flow once per
character in a single dosbox-pure session, booting from an empty-roster overlay so
the squad lands in slots 0–5. For each member it:

1. types the name, picks the race, picks the sex (pinning `*0x56ce = 1` so the
   sex→class bonus roll yields 21),
2. navigates the qualification-gated class picker to the elite class,
3. runs a closed-loop bonus allocator (`dumpDraft()` → raise each gated stat to
   the class minimum, then spend the remainder, cap 18) until the pool is 0,
4. accepts karma + portrait, drains the skill-training budget, and (for the
   Bishop) picks the required spells,
5. saves.

The created records are harvested out of the ephemeral gameDir's `pcfile.dbs`
before the session closes (the savestate path does not persist host-file writes).
Verify the result with `pnpm tsx tools/libretro/verify-squad.ts`.
