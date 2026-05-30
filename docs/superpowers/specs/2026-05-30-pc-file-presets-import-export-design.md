# PC File Presets & Import/Export — Design

**Date:** 2026-05-30
**Status:** Approved (brainstorm) — ready for implementation plan

## Summary

Let players populate the in-viewer **PC File** (the engine's 16-entry
`PCFILE.DBS`) from a library of named **Presets** — the built-in stock six plus
sets the player rolls up or imports — and import/export character files in both a
lossless native JSON format and the engine's real `PCFILE.DBS` format.

Party formation is explicitly **out of scope and unchanged**: characters reach
the active party only through the existing castle ADD PARTY MEMBER picker, which
reads the PC File exactly as the original engine does. Nothing in this feature
writes to the active party.

## Mental model

```
  Presets (library)          PC File (working PCFILE.DBS, ≤16)        Party
  ┌─────────────────┐  copy  ┌──────────────────────────────┐  ADD   ┌────────┐
  │ Stock (built-in)│ ─────▶ │ 16 character slots            │ PARTY  │ ≤6 PCs │
  │ My Heroes       │        │ (today's `wiz6:roster`)       │ MEMBER │        │
  │ Imported …      │        │                               │ ─────▶ │        │
  └─────────────────┘        └──────────────────────────────┘ (engine└────────┘
       ▲   │ import/export              ▲   │ import/export    picker, │
       │   ▼ (.dbs / .json)             │   ▼ (.dbs / .json)  unchanged)
      files on disk                    files on disk
```

The only new data flow is **Presets → PC File** (a copy). Everything to the
right of the PC File is the existing, engine-faithful machinery.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Stable ↔ roster ↔ pcfile relationship | A separate **library** of presets; the working file (today's roster) stays as-is, relabeled "PC File". |
| Import/export format | **Both**: JSON (lossless native) + `PCFILE.DBS` (engine interop, documented fidelity). |
| Unit / size | A preset ≈ a 16-slot file (≤16 chars); whole-file import/export **and** single-character export (JSON). |
| Stock six | A **built-in, read-only** preset decoded from the bundled `pcfile.dbs`. Custom presets via "Save as preset"; others via import. |
| Name collisions on copy/merge | **De-dupe by name** — skip with a notice. |
| Import destination | **Chooser on import**: add as a new Preset, or load into the PC File. |
| PC File representation | **Capped list** (Option 1): keep ≤16; positional slots + `slot_status` are materialized only at `.dbs` export time. No in-memory positional slots. |
| Party interaction | **None.** Party formation stays entirely in the engine's ADD PARTY MEMBER flow. |

## Terminology

- **PC File** — the working character file the engine reads (the in-viewer
  `PCFILE.DBS`). Backed by the existing `wiz6:roster` store, ≤16 entries.
- **Preset** — a named, ≤16-character set in the library that you copy *from*.
  "Stock" is a built-in read-only preset.
- We retain the existing internal `roster` store key/name to avoid a
  localStorage migration; "PC File" is the user-facing label.

## Data model & storage

**PC File** — reuse `wiz6:roster` (`RosterSchema`, `Character[]`) with one new
invariant: **at most 16 characters**. Enforced in the store's write path and
surfaced as a UI guard. No key rename, no migration. The ADD PARTY MEMBER
picker (`availableRosterFor`) keeps reading it unchanged.

**Presets** — new in `@wiz6/data`:

```ts
PresetSchema = {
  schemaVersion: 1,
  id: string,            // uuid
  name: string,
  readOnly?: boolean,    // true only for the built-in Stock preset
  characters: Character[] // length 0..16
}
PresetsFileSchema = { schemaVersion: 1, presets: Preset[] }  // unique ids
```

Stored at `localStorage` key `wiz6:presets` (custom + imported presets only).
Follows the existing store conventions (validate on read/write, fall back to
empty on corrupt data with a `console.warn`).

**Stock preset** — built-in and read-only, **not** persisted in `wiz6:presets`.
A build-time script emits `stock-preset.json` (the six characters decoded from
the bundled `pcfile.dbs`, reusing the existing `generate-gallery` decode path).
The presets store presents it as a synthetic read-only preset merged ahead of
the stored ones at read time.

**File formats:**
- **JSON** (lossless): `{ format: 'wiz6-pcfile', version: 1, characters: Character[] }`.
  Validated on import; rejects unknown `format`/`version`.
- **DBS** (engine): a real 6936-byte `PCFILE.DBS` (24-byte header + 16×432-byte
  records), produced/consumed by the engine-format core below.

## Engine-format core (`@wiz6/parser`, pure)

```ts
characterToPcfileSlot(c: Character): PcfileSlot   // synthesizes a full 432-byte record
pcfileSlotToCharacter(s: PcfileSlot): Character   // generalizes generate-gallery's slot→char map
encodePcfile(slots: Array<PcfileSlot | null>, status?): Uint8Array  // header + 16×432 records
// decodePcfile(bytes) already exists.
```

- `encodePcfile` writes the 24-byte header (`record_size=0x1B0`, `slot_count=16`,
  `header_size=24`, `slot_status[16]`) followed by 16 records. Empty slots →
  zeroed record + status `0`; populated → status `1`. (In-party status `2` is
  not used: the PC File alone doesn't know party membership, and party state is
  the engine's concern — see Non-goals.)
- `characterToPcfileSlot` must write **every** engine field from the `Character`
  (attributes, HP/SP at +0x18..+0x1e, encumbrance at +0x20/+0x22, age at +0x08,
  class/race/sex/alignment, skills, conditions, rendered portrait at +0x19c,
  etc.). It does **not** rely on a preserved `raw` blob, since app-created
  characters have none. Unmodeled record bytes are zeroed.

### Fidelity (documented, the main implementation risk)

- **JSON** round-trips losslessly.
- **DBS export** drops viewer-only fields with no home in the 432-byte record:
  `id` (UUID), `rosterCharacterId`, `portraitSlotId`. On **import**, a fresh
  UUID is generated. Everything the engine uses round-trips.
- Record bytes our `Character` schema does not yet model are zeroed on export;
  this is acceptable for stock + freshly-created characters (verified all-zero
  in those records during prior RE) but should be called out in the export UI.

## UI & flows

**Route** `/pc-file` → `PcFilePage.tsx`. Two panes (Layout A), reusing the
existing character-card components:
- **Left — Presets panel:** list of presets (Stock first, read-only badge),
  each expandable to its characters. Per-character **copy →** and per-preset
  **copy all →**. Footer: **Import .dbs / .json…**. Per custom preset:
  **Export ▾**, **Delete**.
- **Right — PC File panel:** the ≤16 characters, with empty-slot affordance.
  Per-character action: **Export (.json)** (a single-character file — the same
  JSON envelope with `characters` length 1, re-importable anywhere). Panel
  actions: **Save as preset**, **Export ▾** (.dbs / .json for the whole file),
  **New character** (routes into the existing creation flow). An informational
  note: *"To add these to your party, use the castle's ADD PARTY MEMBER — it
  reads this PC File, same as the original game."*

**Flows:**
1. **Copy** preset character(s) → PC File: de-dupe by name (skip + notice),
   respect the 16 cap (block + notice when full).
2. **Save as preset:** snapshot the current PC File into a new named preset in
   `wiz6:presets`. (Presets are created only via Save-as-preset or Import —
   there is no empty-preset editor.)
3. **Import** (.dbs/.json): parse → chooser → **Add as preset** (append to
   library) or **Load into PC File** (**replaces** the PC File; confirm when
   it's non-empty). The imported file must hold ≤16 characters or it is rejected
   (a `.dbs` is 16 slots by construction; a JSON with >16 is invalid).
4. **Export** PC File or a preset → `.dbs` or `.json`; or a single character →
   `.json` (browser download). The first `.dbs` export in a session shows the
   fidelity note once.
5. **Delete** a custom preset (Stock cannot be deleted/edited).

## Error handling

- **16-cap:** a **copy / copy-all** that would exceed 16 fills up to 16 and
  reports what was skipped. **Import → Load into PC File** replaces (it does not
  merge), and rejects any file holding >16 characters.
- **Duplicate name:** a **copy** of a name already in the PC File is skipped
  with a per-name notice. (Import-replace starts from the imported file's own
  names, so intra-file duplicates, if any, are the file's.)
- **Malformed import:** bad JSON, wrong `format`/`version`, or a `.dbs` failing
  `decodePcfile`'s header/size validation → rejected with a clear message and
  **no partial mutation** of the PC File or library.
- **Read-only Stock:** edit/delete actions are disabled/absent.

## Testing

- **Parser — byte round-trip (gate):** decode `original/pcfile.dbs` →
  `encodePcfile` → assert **byte-identical** (preserved via each slot's `raw`).
- **Parser — app-native fidelity:** `Character → characterToPcfileSlot →
  encodeCharacterRecord → decodePcfile → pcfileSlotToCharacter` asserted
  **field-equal** for engine-tracked fields (no `raw`), on the stock six and a
  freshly-built character.
- **Parser — bridge + container round-trips:** `pcfileSlotToCharacter ∘
  characterToPcfileSlot` on the stock six; `encodePcfile`/`decodePcfile`.
- **Data:** `PresetSchema`/`PresetsFileSchema` validation; presets store CRUD;
  Stock read-only invariant; PC File 16-cap invariant.
- **Viewer:** `PcFilePage` flows — copy (de-dupe + cap), import chooser
  (preset vs replace, malformed rejection), export (download invoked), delete.
  Use `skipAssetLoad`/flag where rendering isn't asserted.

## Non-goals (YAGNI)

- In-place preset editing (presets are snapshots; edit by copying into the PC
  File, changing, re-saving).
- Drag-and-drop (buttons suffice).
- Multi-file `.dbs` packing/splitting (a preset is ≤16 = one file).
- Any sharing beyond local file download/upload.
- In-memory positional slots / `slot_status=2` tracking.
- Any change to party formation, the ADD PARTY MEMBER picker, or the active
  party store.

## File-level impact (orientation, not prescriptive)

- `packages/data/src/schemas/preset.ts` (new) + index exports; PC File 16-cap in
  the roster schema/store path.
- `packages/parser/src/formats/`: `characterToPcfileSlot`, `pcfileSlotToCharacter`,
  `encodePcfile` (alongside existing `pcfile.ts` / `encode-character-record.ts`).
- `packages/viewer/src/lib/presets-store.ts` (new); PC File cap guard in
  `roster-store.ts`.
- `packages/viewer/src/pages/.../PcFilePage.tsx` + `PresetsPanel` / `PcFilePanel`
  + route + nav entry; reuse `RosterCharacterCard`.
- Build-time `stock-preset.json` generator (reuse `generate-gallery` decode).
- Tests across data / parser / viewer as above.
