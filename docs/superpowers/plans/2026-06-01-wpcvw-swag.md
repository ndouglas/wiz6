# Plan: Port the WPCVW camp SWAG action (SWAG BAG manager) — #034

**RE:** `docs/re/findings/wpcvw-swag-action.json` (full static RE).
**Reuses:** the DROP guards/compaction (`#037` RE), the inventory picker (`compose-inventory-picker`), the read-only popup idiom (ASSAY).

## What SWAG is

Camp character-view option 4 → `wpcvw_swag_bag_manager` @ 0x1db3. A per-character **SWAG BAG** manager (NOT a party pool). The bag is the **upper 12 slots (10-21)** of the same 22-slot `inventory` array; carried = slots 0-9. Two counts: carried (+0x4594, cap 10), bag (+0x4595, cap 12). A 20×16 popup ("SWAG BAG", msg 0x2ee) lists the bag, with a 3-option **ADD / REMOVE / DROP** picker (msg 0x2ef/0x2f0/0x2f1) looping until EXIT.

- **ADD** (msg 0x2f8): pick a CARRIED item; if not equipped (flags bit0=0) move it carried→bag (+ compact carried, fixup equipment); equipped → beep.
- **REMOVE** (msg 0x2f9): pick a BAG item; move bag→carried (append) + compact bag.
- **DROP** (msg 0x2fa): pick a BAG item; if not class-locked (flags bit6=0) destroy it (compact bag); else beep.
- **Gating:** ADD off if bag≥12 OR carried==0; REMOVE off if bag==0 OR carried≥10; DROP off if bag==0.

## Data model — NO schema change

Derive counts from the packed regions of the existing `inventory[22]`: carried = slots [0,9] with itemId>0; bag = slots [10,21] with itemId>0. SWAG mutations maintain the packed invariant. (The on-disk `inventoryCount`/`inventoryCountPage2` exist in `pcfile.ts` but aren't on the runtime member; we don't need them — derive instead.)

## Stages

### Stage 1 — Pure SWAG logic + carried-scan bounding (TDD, no fixtures) — Status: COMPLETE
Done: `@wiz6/data` `character-view/swag-bag.ts` (`carriedCount`/`bagCount`, `carriedItems`/`bagItems`, `swagItemAddable`/`swagItemDroppable`, `canSwag{Add,Remove,Drop}`, `swagAdd`/`swagRemove`/`swagDrop` with carried-compaction+equipment-fixup and bag-compaction). Bounded `equipCandidates` + `scanCarried` to the carried region (slots 0-9) so bag items don't leak into EQUIP/ASSAY pickers (+ bag-exclusion test). 591 data + 885 viewer + 82 parity green; tsc clean. (Carried-compaction+equipment-fixup also = the deferred DROP #037 core.)
- New `packages/data/src/character-view/swag-bag.ts`:
  - `CARRIED_CAP=10`, `BAG_CAP=12`, `BAG_BASE=10`.
  - `carriedCount`/`bagCount`, `carriedItems`/`bagItems` (→ `{idx, item}` lists).
  - guards: `swagItemAddable(item) = (flags & 0x01)===0`; `swagItemDroppable(item) = (flags & 0x40)===0`.
  - gating: `canSwagAdd`/`canSwagRemove`/`canSwagDrop`.
  - mutations (immutable clones): `swagAdd(member, carriedIdx)` (copy carried→bag[bagCount], compact carried 0-9 + fixup equipment indices), `swagRemove(member, bagIdx)` (copy bag→carried[carriedCount], compact bag 10-21), `swagDrop(member, bagIdx)` (compact bag). A shared `compactCarried`/`compactBag` helper (the carried one fixes equipment indices — the DROP #037 core).
- **Bound carried-scans to slots 0-9** so bag items don't leak into other pickers: `scanCarried` (CharacterViewPage) + `equipCandidates` (equip-logic) should iterate only the carried region. Add tests that a bag-resident item is excluded.
**Tests:** counts, lists, guards, gating, each mutation (carried compaction + equipment fixup, bag compaction, destroy), round-trips.

### Stage 2 — Composer — Status: Not Started
`compose-swag-bag.ts`: the 20×16 "SWAG BAG" popup (title + bag rows: name + qty/icon + empty rows) + the 3-option ADD/REMOVE/DROP picker strip (with dynamic disables greyed/hidden). Reuse `compose-inventory-picker` for the ADD (carried) + REMOVE/DROP (bag) sub-pickers.

### Stage 3 — Reducer + page wiring — Status: Not Started
Reducer sub-flow: `swag-menu` (ADD/REMOVE/DROP/EXIT cursor) → `swag-add-picker`/`swag-remove-picker`/`swag-drop-picker` → commit intents (`commit-swag-add/remove/drop`) → back to `swag-menu`. Beep-and-stay on refused ADD (equipped) / DROP (class-locked). Wire into `CharacterViewPage` (mutate via swag-bag, persist, re-render).

### Stage 4 — Engine fixtures + pixel-parity — Status: Not Started
Drive DOSBox: open SWAG (empty bag), ADD an item, capture the bag-with-item + each sub-picker. Commit fixtures + parity test at tol 0. (Stock THESUS bag starts empty — drive an ADD to populate.)

### Stage 5 — e2e + manual smoke — Status: Not Started
Mounted-app drive: SWAG → ADD a carried item → REMOVE / DROP → assert canvas + persisted inventory.

### Stage 6 — Verify MEDIUM bits — Status: Not Started
Display-only byte semantics (icon +0x442d, qty +0x442e, the 0xcc show-charges table); cursed-but-unequipped item reaching the bag.

## Notes
- SWAG is the first camp action to MUTATE inventory layout → the carried-scan bounding (Stage 1) is the integration-risk part; gate it with tests that existing ASSAY/EQUIP still see only carried items.
- The carried-compaction + equipment fixup IS the DROP #037 core — building it here unblocks a future DROP port.
