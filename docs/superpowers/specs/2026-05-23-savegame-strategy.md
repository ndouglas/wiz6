# Savegame & Roster Strategy — Design Spec

**Date:** 2026-05-23
**Status:** Design approved (no implementation work yet).
**Tracker:** [`TODO.md`](../../../TODO.md) #009.
**Scope:** Define how the Wiz6 web port will persist, load, share, and exchange player data across **three layers**: the per-visitor character roster (third-persistence layer), individual save slots (six per visitor), and external interchange with the original DOS `SAVEGAME.DBS` format.

## Problem

The port has no persistence mechanism today. As the gameplay simulation extends past character creation into combat, dungeon traversal, and quest progression, two related but distinct persistence needs emerge:

1. **The roster** — characters live independently of any individual game. A visitor creates a character once; that character can be drafted into multiple parties, return to the roster between adventures, persist their death state across game-overs, and (in original Wiz6) be the unit of long-term player identity.
2. **The save** — a particular game's mid-flight party + dungeon position + scenario flags + timing state.

Both need a UX, a format, and a scope.

We have to decide:

1. **User-facing UX** — how does a player save and load?
2. **Underlying format** — what does the save data structurally contain?
3. **State scope** — what's actually captured in a snapshot?
4. **Roster model** — is the roster shared or per-visitor? Is the save self-contained or roster-dependent? What's the first-time-visitor experience?

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

export const CharacterSchema = z.object({
  /** Stable UUID. Used by the roster as the primary key, and by saves to
   * carry an optional back-reference to the roster entry. */
  id: z.string().uuid(),
  name: z.string(),
  race: z.string(),
  class: z.string(),
  // ... full stats / inventory / equipped / spells / conditions / XP / level / gold
  // (derived from the wpcvw character-record layout at BSS 0x43e8 stride 0x1b0)
});

export const PartyMemberSchema = CharacterSchema.extend({
  /** If present, the engine should sync state changes (level-up, death,
   * class change, etc.) back to this roster entry on save / end-of-game.
   * Absent when a save was imported from another visitor without their
   * roster (the party member is a one-off snapshot). */
  rosterCharacterId: z.string().uuid().optional(),
});

export const SaveSchema = z.object({
  schemaVersion: z.literal(1),
  metadata: z.object({
    slotName: z.string(),
    timestamp: z.string().datetime(),
    portVersion: z.string(),
    rngSeed: z.number().int().optional(), // advisory; see "State scope" below
  }),
  party: z.array(PartyMemberSchema).max(6),
  position: PositionSchema,
  scenarioFlags: z.record(z.string(), z.unknown()),
  mazeState: MazeStateSchema,
});

export const RosterSchema = z.object({
  schemaVersion: z.literal(1),
  characters: z.array(CharacterSchema),
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

### Roster: per-visitor private + curated gallery, snapshot-style saves

The original Wiz6 has **three** persistence layers, not two: the roster (`SCENARIO.DBS` character database) lives independently of any individual game. Characters are created into the roster *first*, drafted into parties *second*, and persist their last-known state (XP, level, gear, death) across game boundaries. Saves snapshot the party at save-time but don't own the characters.

We mirror this three-layer model.

**Roster scope decision: per-visitor private + curated gallery.**

- Each visitor's roster lives in their browser's localStorage at `wiz6:roster`. Not shared with other visitors.
- A small **curated gallery** ships with the build as a static `/public/gallery/characters.json` — pre-made characters the project owner publishes for everyone. Read-only in the UI; visitors can import gallery characters into their private roster with a click. This gives new visitors something to immediately play with, and is a natural home for "the canonical Manual party" / Wiz lore characters / engineering-archaeology curiosities.
- Per-account / server-side rosters are explicitly out of scope (same rationale as the savegame UX decision — no auth, no infra).

**Save ↔ roster relationship: snapshot, with optional back-reference.**

- A save embeds the full character records of its party. Self-contained — loadable even if the visitor's roster has been wiped.
- Each party member optionally carries a `rosterCharacterId` field. If present, the engine can synchronize back to the roster on death, level-up, or "end of game" events (mirrors how DOS Wiz6's roster reflects a character's most-recent in-save state). If absent (e.g. a downloaded save imported from another visitor), the party member is treated as a one-off snapshot — the save loads fine, but there's no roster entry to update.

**Lifecycle:**

| Action | Roster effect | Save effect |
|---|---|---|
| Create a character | Add new record with stable UUID | — |
| Form a party for a new game | — | Each chosen roster character's record gets snapshotted into the save's `party[]` and stamped with `rosterCharacterId` |
| Save mid-game | — | Party snapshots in the save update |
| Character levels up / dies / changes class in-game | Optional write-back to roster on save (mirrors DOS behavior) | Save reflects new state |
| Delete roster character | Remove record | Existing saves keep their self-contained snapshot; the back-reference becomes dangling but the save still loads |
| Download a character | — | New `.wiz6char.json` file in the user's downloads |
| Upload a character | New record imported into roster | — |
| Import a gallery character | Copy the gallery record into the visitor's private roster | — |

**First-time-visitor experience:** the roster is pre-seeded with the curated gallery on first visit. Visitors can immediately form a party and start a game. Creating their own characters bumps them above the seed in the roster UI. Gallery characters are mark-visibly as such ("imported from gallery") so the visitor knows they're playing with someone else's design.

## File structure

```
packages/data/src/schemas/
  ├── character.ts              # CharacterSchema + PartyMemberSchema (shared)
  ├── save.ts                   # SaveSchema + Position/Maze sub-schemas
  └── roster.ts                 # RosterSchema

packages/parser/src/formats/
  ├── save.ts                   # encodeSave / decodeSave (round-trip the JSON envelope)
  ├── roster.ts                 # encodeRoster / decodeRoster
  └── savegame-dbs.ts           # DEFERRED — importDosSave / exportDosSave (needs DOS RE)

packages/viewer/src/lib/
  ├── save-store.ts             # localStorage abstraction; 6-slot CRUD
  ├── roster-store.ts           # localStorage abstraction; full-list CRUD + back-sync from save
  ├── gallery.ts                # static-JSON gallery loader + "import to roster" helper
  └── save-export.ts            # Download / Upload helpers (`.wiz6.json`, `.wiz6char.json`)

packages/viewer/src/pages/saves/
  ├── SavesPage.tsx             # /explore/saves — slot grid, download/upload, future editor
  └── SaveSlot.tsx              # single-slot card component

packages/viewer/src/pages/roster/
  ├── RosterPage.tsx            # /explore/roster — character list, create/edit/delete, gallery import
  └── RosterCharacterCard.tsx   # single-character card

packages/viewer/public/gallery/
  └── characters.json           # static curated gallery, shipped with build
```

The `savegame-dbs.ts` module is a stub initially; it gets implemented after the DOS-format RE pass lands. The gallery JSON ships hand-curated content; adding new characters is a content commit, not a code change.

## Implementation phases

Each phase ships independently. None of them depend on the SAVEGAME.DBS RE work.

### Phase 1 — Schemas

Define `CharacterSchema`, `PartyMemberSchema`, `SaveSchema`, `RosterSchema` in `@wiz6/data`. zod-validated. TDD with snapshot tests for stability. Character schema is shared between roster and save (PartyMember extends with the optional `rosterCharacterId` back-reference).

### Phase 2 — Encoder / decoder

`encodeSave(save) → Uint8Array` (gzipped JSON, base64-encoded for URL-safe transport) and `decodeSave(bytes) → Save` round-trip pair in `@wiz6/parser`. Same shape for `encodeRoster` / `decodeRoster`. Round-trip tests for both.

### Phase 3 — Storage

Two browser-side abstractions:

- `packages/viewer/src/lib/save-store.ts` — 6-slot localStorage (fallback to IndexedDB if size limit hit). API: `listSlots() / readSlot(n) / writeSlot(n, save) / deleteSlot(n)`.
- `packages/viewer/src/lib/roster-store.ts` — single-roster localStorage. API: `readRoster() / writeRoster(r) / addCharacter(c) / removeCharacter(id) / updateCharacter(c)`. Also `syncFromSave(save)` — when a save's party members carry `rosterCharacterId`, copy their updated stats back into the matching roster entries (mirrors DOS Wiz6's roster-reflects-most-recent-save behavior).

### Phase 4 — Gallery seed

Curated `/public/gallery/characters.json` shipped with the build (initially: 1-6 hand-authored characters, content-only — no UI yet). `packages/viewer/src/lib/gallery.ts` exposes `loadGallery() / importToRoster(galleryCharId)`. On first visit, the roster auto-seeds with the gallery.

### Phase 5 — Roster page UX

`/explore/roster` page: character list, create / edit / delete affordances, "import from gallery" button, "download character" / "upload character" buttons (separate from save download). Gallery characters in the roster are visibly marked as such.

### Phase 6 — Saves page UX

`/explore/saves` page (or a section of an in-game shell when the shell exists). Slot grid, download/upload buttons. "Form party" UI when starting a new game pulls from the visitor's roster. No editor yet — that's a follow-up.

### Phase 7 — DOS interop (deferred)

Requires:
- A separate RE pass on `SAVEGAME.DBS` — file structure, field layout, character-record packing, scenario-flag encoding. Whether the DOS roster (`SCENARIO.DBS`-character section?) is in scope: TBD; the RE pass clarifies.
- Implementation of `importDosSave` + `exportDosSave` in `packages/parser/src/formats/savegame-dbs.ts`.
- Import/export buttons on the saves and (possibly) roster pages.

Tracked as a follow-up TODO once Phase 6 has shipped and the format is actually useful.

### Phase 8 — Savegame editor (deferred)

A `/explore/saves/edit/:slot` and `/explore/roster/edit/:id` pair of pages that render each field as an editable form, with "engineering-archaeology" tooltips on each field showing what byte offset / RE finding it came from. Fits the rest of the data-explorer's framing.

Depends on Phase 5 + 6. Independent of Phase 7 (works on the port's own data without needing DOS interop).

## Non-goals

- **Server-side cloud saves.** No accounts, no infra.
- **Mid-combat saves.** Wiz6 didn't have them.
- **Encrypting saves.** They're player-controlled.
- **Anti-tampering.** Players who edit their saves are welcome to.

## Open questions resolved during this design

- *Should we mirror SAVEGAME.DBS exactly?* No — schema-evolution risk is too high. DOS interop is a bridge, not the foundation.
- *Should we capture the RNG seed?* Yes, but as an advisory field, not a load-bearing one. Doesn't force determinism on gameplay; enables future analysis tooling.
- *Should there be a savegame editor?* Yes, but as a follow-up. The port-canonical schema is the prerequisite.
- *Is the character roster shared across visitors or per-visitor?* Per-visitor private, plus a curated gallery shipped with the build. No accounts, no infra.
- *Are saves snapshots or roster references?* Snapshots. Optional `rosterCharacterId` back-reference per party member lets the engine sync state back to the roster, but isn't required for load.
- *What's a new visitor's first experience?* Roster pre-seeded with the curated gallery. Visitor can immediately form a party and start. Creating their own characters bumps them above the seed.

## See also

- [`docs/re/wpcvw-character-view.md`](../../re/wpcvw-character-view.md) — character record layout at BSS `0x43e8` stride `0x1b0`; this is the primary source for what fields a save (and the roster) must capture.
- [`docs/re/wmaze-functions.md`](../../re/wmaze-functions.md) — the in-engine save flow (`maze_save` at 0x8974, `maze_load` at 0x8e4f) plus the position-state globals at `0x4f80..0x4faa`.
- [`docs/re/wpcmk-character-creation.md`](../../re/wpcmk-character-creation.md) — character-creation overlay; the roster I/O at `0x001b` (read/write fixed-size records via `*0x4fee` template) is the closest DOS-side analog to our `roster-store.ts`.
- [`docs/re/wmexe-action-execution.md`](../../re/wmexe-action-execution.md) — combat round chain; informs whether we need to capture mid-combat state (we don't).
