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

### Stage 2 — Composer — Status: COMPLETE (100% pixel-parity)
**Unblocked by extending `dump-cells.py` with a `--header W,H,X,Y,ATTR` mode** that finds structs by their exact 5-byte header (the `--scan` printable-ASCII filter rejected the chrome-heavy popup). `dump-cells.py tools/dosbox/save/5.sav --header 0x14,0x10,0x14,4,0x19` dumped the popup's exact cells. Rewrote `compose-swag-bag.ts` to emit them byte-exact: top/band/sep/bottom chrome glyphs, title band ("SWAG BAG" col 6 + flank icon 0x64 cols 2/17), vertical divider at col 17, item rows (margin 0x00 col 1, name col 2 attr 0x90 + pad attr 0x10, item icon col 18 attr 0x04), gray strip col 18 on empty rows, and the 0x0f left-edge quirk on rows 9/11/13. The earlier 96.6% diffs (ASSAY chrome copied wrong; missed divider/strip; "scrollbar" was actually a per-item icon column) all resolved. `swag-empty` + `swag-longsword` parity cases at **100%** (84 parity tests green).
Sub-pickers (ADD/REMOVE/DROP "which item?") reuse `compose-inventory-picker` (gated by ASSAY) — no separate composer needed.

### Stage 4b — pixel-parity test — Status: COMPLETE
`swag-empty` + `swag-longsword` cases in `screen-parity.test.ts` at tol 0.

### Stage 3 — Reducer + page wiring — Status: Not Started
Reducer sub-flow: `swag-menu` (ADD/REMOVE/DROP/EXIT cursor) → `swag-add-picker`/`swag-remove-picker`/`swag-drop-picker` → commit intents (`commit-swag-add/remove/drop`) → back to `swag-menu`. Beep-and-stay on refused ADD (equipped) / DROP (class-locked). Wire into `CharacterViewPage` (mutate via swag-bag, persist, re-render).

### Stage 4a — Engine fixtures CAPTURED (2026-06-01) — Status: COMPLETE
Committed `swag-empty` (empty bag, dynamic menu [ADD, EXIT]) + `swag-longsword` (bag=[LONGSWORD] after an ADD, menu [ADD,REMOVE,DROP,EXIT]). Confirmed model:
- SWAG BAG popup = the same 20×16 @ (col20,row4,attr0x19) window as ASSAY/SKILL; title "SWAG BAG" + flank bag-icons (row 0); bag item rows (name near col 1) + a right-edge scrollbar; black interior.
- The 3-option menu is on the bottom strip (replacing the action menu): dynamic disables HIDE options (empty bag → only ADD+EXIT). Column-major 2-row, x_step 8: ADD(c0r0), REMOVE(c0r1), DROP(c1r0), EXIT(c1r1). Cursor on EXIT at entry.
- ADD/REMOVE/DROP sub-pickers = the standard `compose-inventory-picker` (prompts msg 0x2f8/0x2f9/0x2fa) — already gated by ASSAY; no separate fixtures needed.
- **Side-finding:** the picker nav `up`-from-NONE → TOP item (confirms #072: our `nextInventoryCursor` is backwards). Tracked in #072; not fixed here.

### Stage 4b — pixel-parity test — Status: Not Started
`screen-parity.test.ts` cases for `swag-empty` + `swag-longsword` at tol 0 (after the composer).

### Stage 5 — e2e + manual smoke — Status: Not Started
Mounted-app drive: SWAG → ADD a carried item → REMOVE / DROP → assert canvas + persisted inventory.

### Stage 6 — Verify MEDIUM bits — Status: Not Started
Display-only byte semantics (icon +0x442d, qty +0x442e, the 0xcc show-charges table); cursed-but-unequipped item reaching the bag.

## Notes
- SWAG is the first camp action to MUTATE inventory layout → the carried-scan bounding (Stage 1) is the integration-risk part; gate it with tests that existing ASSAY/EQUIP still see only carried items.
- The carried-compaction + equipment fixup IS the DROP #037 core — building it here unblocks a future DROP port.
