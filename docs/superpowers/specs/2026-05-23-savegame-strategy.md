# Savegame Strategy — Design Spec

**Date:** 2026-05-23
**Status:** Design approved (no implementation work yet).
**Tracker:** [`TODO.md`](../../../TODO.md) #009.
**Scope:** Define how the Wiz6 web port will persist, load, share, and exchange player save data — both internally (browser-side) and externally (compatibility with the original DOS `SAVEGAME.DBS` format).

## Problem

The port has no save/load mechanism today. As the gameplay simulation extends past character creation into combat, dungeon traversal, and quest progression, persisting party state across sessions becomes necessary for both player UX and developer testing.

We have to decide three things, each independent of the others:

1. **User-facing UX** — how does a player save and load?
2. **Underlying format** — what does the save data structurally contain?
3. **State scope** — what's actually captured in a snapshot?

This spec is the answer.

## Decisions

### UX: hybrid

Browser-side storage as the **primary** path, with a manual export / import for portability. Specifically:

- 6 named save slots backed by `localStorage` (`wiz6:save:0` … `wiz6:save:5`), mirroring the original Wiz6's slot UX.
- IndexedDB fallback if the serialized save exceeds localStorage's typical 5 MB limit (unlikely; back-of-envelope estimate is a few KB per save).
- A "Download" button on every save slot — produces a single `.wiz6.json` file the user can keep on disk, share with friends, or move between devices.
- An "Upload" button that takes a `.wiz6.json` file and writes it into a chosen slot.
- (Optional follow-up) URL-encoded share-link feature — compresses + base64-encodes a save into a query string. Viable only if compressed saves stay under ~6-8 KB. Not on the critical path; revisit when we have a sample of real saves.

Server-side accounts are out of scope. The port lives on a single host, has no auth, and doesn't try to be a cloud-save service.

### Format: our own schema, with DOS interop as a future bridge

The canonical save format is a versioned **JSON document** validated by a zod schema living in `@wiz6/data`. Structure follows the engine's BSS layout we've already documented through the naming-pass series — character records at `0x43e8` stride `0x1b0`, position block at `0x4f80..0x4faa`, scenario flags, maze state — but represented as typed JSON, not raw binary.

```typescript
// Sketch — exact field list determined during implementation.
export const SaveSchema = z.object({
  schemaVersion: z.literal(1),
  metadata: z.object({
    slotName: z.string(),
    timestamp: z.string().datetime(),
    portVersion: z.string(),
    rngSeed: z.number().int().optional(), // advisory; see "State scope" below
  }),
  party: z.array(CharacterSchema).max(6),
  position: PositionSchema,
  scenarioFlags: z.record(z.string(), z.unknown()),
  mazeState: MazeStateSchema,
});
```

Rationale for our own schema over mirroring `SAVEGAME.DBS`:

- The DOS format reflects 1990 storage constraints — bit-packed flags, fixed-size string fields, byte-level struct packing. Mirroring it constrains the port's data model forever to those constraints.
- Once a binary blob is canonical, any new field we want (port-specific settings, calibration metadata, RNG seed, future quality-of-life data) has to live in a sidecar or break interop.
- Most binary formats from this era have at least one fixed-size field that turns out to be too small.

**DOS interop** is added as a **bonus bridge**, not as the foundation:

- `importDosSave(buf: Uint8Array): Save` — read a real `SAVEGAME.DBS` from disk and convert into our schema. Requires the DOS-format RE pass (separate task; not blocking).
- `exportDosSave(save: Save): Uint8Array` — round-trip the other direction. Requires the importer working first plus a faithful encoder. Useful as a correctness check (round-trip equality) and as a "load my port save in DOSBox-X" feature.

The bridge is one-shot in each direction; we don't try to maintain bit-level compatibility across schema evolution.

### State scope: player-visible + advisory RNG seed

A save captures:

- **Party state**: each character's record (stats, inventory, equipped slots, spells known, conditions, XP, level, gold). 6 slots max.
- **Position state**: current zone, x / y / z / facing, automap reveal per level.
- **Scenario flags**: quest progression bitfields, NPC dialogue state, scripted-event triggers.
- **Maze state**: open doors, disarmed traps, looted chests, encounter cooldowns.
- **Advisory RNG seed**: the engine's PRNG state at save time, captured as an integer. **Not** load-bearing for gameplay — gameplay PRNG continues to evolve from whatever state it's in when you load. The seed is captured for future tooling (deterministic replay, the #010 A/B compare harness, save-scum-faithful behavior tests).

A save does **not** capture:

- Full engine memory (DOSBox-X-style save-state). Too brittle to schema evolution.
- Mid-combat state. Wiz6 didn't allow mid-combat saves; we follow.
- UI / camera state (sidebar open/closed, palette picker, etc.). Those live in their own localStorage scopes.

## File structure

```
packages/data/src/schemas/
  ├── save.ts                   # SaveSchema + Character/Position/Maze sub-schemas

packages/parser/src/formats/
  ├── save.ts                   # encodeSave / decodeSave (round-trip the JSON envelope)
  └── savegame-dbs.ts           # DEFERRED — importDosSave / exportDosSave (needs DOS RE)

packages/viewer/src/lib/
  ├── save-store.ts             # localStorage / IndexedDB abstraction; 6-slot CRUD
  └── save-export.ts            # Download / Upload (`.wiz6.json` file helpers)

packages/viewer/src/pages/saves/
  ├── SavesPage.tsx             # /explore/saves — slot grid, download/upload, future editor
  └── SaveSlot.tsx              # single-slot card component
```

The `savegame-dbs.ts` module is a stub initially; it gets implemented after the DOS-format RE pass lands.

## Implementation phases

Each phase ships independently. None of them depend on the SAVEGAME.DBS RE work.

### Phase 1 — Schema

Define `SaveSchema` + sub-schemas in `@wiz6/data`. zod-validated. TDD with snapshot tests for stability.

### Phase 2 — Encoder / decoder

`encodeSave(save) → Uint8Array` (gzipped JSON, base64-encoded for URL-safe transport) and `decodeSave(bytes) → Save` round-trip pair in `@wiz6/parser`. Round-trip tests.

### Phase 3 — Storage

Browser-side abstraction in `packages/viewer/src/lib/save-store.ts`. 6-slot localStorage (fallback to IndexedDB if size limit hit). API: `listSlots() / readSlot(n) / writeSlot(n, save) / deleteSlot(n)`.

### Phase 4 — UX

`/explore/saves` page (or a section of an in-game shell when the shell exists). Slot grid, download/upload buttons. No editor yet — that's a follow-up.

### Phase 5 — DOS interop (deferred)

Requires:
- A separate RE pass on `SAVEGAME.DBS` — file structure, field layout, character-record packing, scenario-flag encoding.
- Implementation of `importDosSave` + `exportDosSave` in `packages/parser/src/formats/savegame-dbs.ts`.
- Import/export buttons on the saves page.

Tracked as a follow-up TODO once Phase 4 has shipped and the format is actually useful.

### Phase 6 — Savegame editor (deferred)

A `/explore/saves/edit/:slot` page that renders each field of a save as an editable form, with "engineering-archaeology" tooltips on each field showing what byte offset / RE finding it came from. Fits the rest of the data-explorer's framing.

Depends on Phase 4. Independent of Phase 5 (works on the port's own saves without needing DOS interop).

## Non-goals

- **Server-side cloud saves.** No accounts, no infra.
- **Mid-combat saves.** Wiz6 didn't have them.
- **Encrypting saves.** They're player-controlled.
- **Anti-tampering.** Players who edit their saves are welcome to.

## Open questions resolved during this design

- *Should we mirror SAVEGAME.DBS exactly?* No — schema-evolution risk is too high. DOS interop is a bridge, not the foundation.
- *Should we capture the RNG seed?* Yes, but as an advisory field, not a load-bearing one. Doesn't force determinism on gameplay; enables future analysis tooling.
- *Should there be a savegame editor?* Yes, but as a follow-up. The port-canonical schema is the prerequisite.

## See also

- [`docs/re/wpcvw-character-view.md`](../../re/wpcvw-character-view.md) — character record layout at BSS `0x43e8` stride `0x1b0`; this is the primary source for what fields a save must capture.
- [`docs/re/wmaze-functions.md`](../../re/wmaze-functions.md) — the in-engine save flow (`maze_save` at 0x8974, `maze_load` at 0x8e4f) plus the position-state globals at `0x4f80..0x4faa`.
- [`docs/re/wmexe-action-execution.md`](../../re/wmexe-action-execution.md) — combat round chain; informs whether we need to capture mid-combat state (we don't).
