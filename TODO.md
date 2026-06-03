# wiz6 TODO

Stable-ID task list for cross-session tracking. Future sessions: read this on start; new items go in **Open** with the next free ID; closed items get **deleted** (git log preserves history). Never reuse IDs.

Format:

```
- #NNN [open|blocked] — Title
  - Notes / dependencies / refs
```

`open` = ready to work, `blocked` = waiting on another ID. There is no `done` status — finished items are removed.

Companion file: [`INBOX.md`](INBOX.md) — Nate's freeform jot pad. Claude processes it into TODO entries (single batch commit per session).

Next free ID: **#077**

---

## Open

- #076 [open] — Port the maze 3D view (renderer LOCATED: it's in ega.drv, not wmaze.ovr)
  - **2026-06-03 delta-trace breakthrough** (`docs/re/findings/wmaze-render-in-egadrv.json`): the live first-person renderer is NOT in wmaze.ovr — it's a service in **ega.drv** (loaded linear 0x6a1b0, executed via selector CS=0x6b91), far-called from wmaze's 0x6800–0x6b00 region. The three prior wmaze static-disasm passes (wmaze-3d-view / blit-geometry / texture-rasterizer) disassembled the wrong binary — their named render fns log 0 live trace hits. Their DATA tables (convergence/seam/walltypes) remain valid.
  - **Pipeline (live-evidenced):** texture run/skip expand (src seg 0x29c3 → off-screen buffer seg 0x4182, lin 0x6c552) → 2bpp vertical wall-column writer into 0x4182 (lin 0x6d9e0, rotating bit-masks) → EGA-planar blit 0x4182 → A000 VRAM via Sequencer (ega.drv@0x2069). The "masked/0xaa" texture bytes are just 2bpp-packed texels.
  - **Tooling:** `tools/libretro/trace-maze.ts` (reach|calibrate|validate|where|afine) reproduces the whole trace; needs the patched core (`tools/libretro/build-core.sh`; restore nightly via `fetch-core.sh`).
  - **Ghidra RE DONE (2026-06-03, `docs/re/findings/egadrv-blit-internals.json`):** ega.drv already imported (setup.sh); `list_functions.py` fixed for pyghidra 3.x (pass `--project-dir "$(pwd)/tools/ghidra"`). ega.drv = 17-entry far-call dispatch table at file 0; **entry 10 (off 0x2b) → FUN_1c94 = the wall/sprite compositor** (clear 0x1400 buffer to 0xff transparent + per-piece decode via FUN_210c + palette-remap (LUT @+0x192) + H-flip + clip + planar blit to A000 via writer @0x2069, es=A000 dx=0x3c5 Sequencer). **FUN_210c = masked 4-plane EGA blit**: transp = AND of 4 planes (src[0]/[8]/[0x10]/[0x18], cell stride 0x20); `dst = src&~transp | dst&transp`; per-cell presence bitmap; H/V flip. The "masked blob" is standard 4-plane EGA masked sprite data (NOT 2bpp — corrects wmaze-render-in-egadrv.json).
  - **Step-1 result (2026-06-03, live):** FUN_1c94/FUN_210c (entry 10) are the **SPRITE/object compositor, NOT the corridor walls** — 0 trace hits at dungeon LOAD *and* on movement (a bare corridor has no sprites). The 4-plane masked format is fully RE'd + portable, just not the wall path. The corridor **wall rasterizer** executes in the 0x6c400–0x6e400 region as **compiled/transient code**: at frame boundaries it reads as stable pixel data (idle==redraw, 0 diff) yet the tracer logs real execution mid-frame. **Tooling wall:** the non-pausing tracer + frame-boundary reads can't capture it (boundary-sampled segments like 0x4182 are unreliable — 90% zero at idle).
  - **TOOLING UPGRADE DONE (2026-06-03) — wall rasterizer CAPTURED.** Added capture-on-breakpoint to the core patch (`dbp_capture_set/get`; host `capset`/`capget`; `HostClient.captureSet/captureGet`; `trace-maze.ts cap`): snapshots guest RAM at the exact instruction the trace target fires, so transient/copied mid-frame code is observable (was invisible to frame-boundary reads). Captured the live wall rasterizer at lin 0x6d9e0 (4064/4096 bytes differ from idle). It is an **EGA planar pixel read-modify-write blitter** — code = **ega.drv file 0x1fd0** (inside FUN_1c94 region) COPIED into a work buffer (~0x6d800) and run there (why file-address tracing missed it). Per pixel-group: read 4-plane texels (ds:si+8/+0x10…), `shr cl` align, `and bx` set-mask, merge `dst=(dst&dx)|(src&bx)`, then write to A000 via Sequencer Map Mask (0x3c5 reg2)+GC(0x3cf)+latches, OR to off-screen page es:[di+0x2000] per flag [bp+0x18]&1.
  - **RASTERIZER ALGORITHM FULLY RE'd (2026-06-03).** The executed blob is a VERBATIM copy of ega.drv file 0x1df0..0x2262 (0 byte diffs) into a work buffer, entered at the file-0x1fd0 offset. OUTER loop: work seg from cs:[0x16d]; row stride ([bp-2]-1)<<5 (32B=4-plane×8 cell); per-column edge masks from sub-byte pos (cx=[bp-6]&7; set ah=0xff<<cl, clear al=~ah); Y-clip [bp+0xe]/[bp+0x14]; init strips to 0xffff (transparent). INNER 4-plane block (×4, src si+0/+8/+0x10/+0x18 stride 8): `ah=src; shr ax,cl; and ax,bx(set); dst=(dst&dx_clear)|(src&bx)`; write to off-screen PLANAR page es:[di+0x2000*plane] (0x8000 total) OR to A000 VRAM (Seq Map Mask + GC + latches) per flag [bp+0x18]&1.
  - **Caller/U-V — last RE piece before porting; 3 approaches tried + FAILED (2026-06-03):** (1) wmaze+0x681a/+0x6aa1 = party/panel code (0x1b0 stride), red herring; (2) bp-frame [bp+2]/[bp+4] → mazedata.ega DATA seg 0x3678 (the blob is JMP'd into, sharing the caller bp — no clean return); (3) stack scan for (ip,1a8) returns → false positive (lands mid-instruction in party_panel_redraw_all). The rasterizer writes the OFF-SCREEN path (flag [bp+0x18]=0, dest es=0x4182).
  - **Recommended next:** a memory-WRITE watch (new core-patch increment, same shape as the capture hook) on the off-screen page (es:0x4182) or the work-buffer copy target → log cs:ip of whatever writes them → find the copier + per-column driver → arg frame → map to convergence/seam tables (@0x42/@0x4a/@0x36e4) for U/V → decode one wall texture end-to-end → pixel-match → **port the EGA-planar RMW rasterizer to TS**. Alternatively skip the caller and do the **framebuffer-oracle port** (known geometry tables + per-slot textures from the captured frame). The rasterizer algorithm itself is DONE and port-ready either way.
  - **Sprite path (separate):** to validate FUN_1c94/210c (4-plane masked sprites) live, capture during a MONSTER encounter → DS + descriptor table (0x18-stride) + tile-index @0x17a + LUT @0x192. Findings: `docs/re/findings/egadrv-blit-internals.json`.

- #075 [open] — Pixel-gate the EQUIPPED-party six-portrait hand icons (MASTER OPTIONS + ADD picker)
  - The party-panel hand icons (`composeHandGlyphs`, wfont4) are pixel-gated only for EMPTY hands (castle-parity uses the unequipped pinned roster). The EQUIPPED-hand glyphs are gated by the `composeHandGlyphs` unit test + the Twink char-view fixture (inventory icons), but NOT by a six-portrait pixel fixture.
  - To close: commit a pre-equipped squad roster to `test-fixtures/states/` (e.g. `legendary-squad-equipped.pcfile.dbs`), add a `castle-1-squad` recipe (pcfileFixture → MASTER OPTIONS with TWINK's SHURIKEN equipped), mint the engine fixture, and add a castle-parity case (+ covers #067's AddPartyPage background path). Same shape as the `review-twink-shuriken` quantity fixture.

- #063 [open] — DOSBox-X MCP: Linux + Windows ports of input/window/screenshot helpers
  - macOS-only v1 shipped (Swift helper at `packages/mcp/helper/`). Linux (xdotool + ImageMagick), Windows (SendInput + screenshot APIs) follow the same TS module shape but ship a different helper binary.
  - The TS façades (`packages/mcp/src/dosbox/{input,window,screenshot}.ts`) are platform-agnostic; only the helper child process differs.

- #064 [open] — DOSBox-X MCP: drive the debugger (re-open `pause/resume/step/run_until/breakpoints` stubs)
  - The 9 debugger-driving stubs in `tools/control.ts` + `tools/breakpoints.ts` remain stubs after the dynamic-driving work — that work routes around the debugger entirely.
  - Two viable paths: (a) node-pty + a vt100 screen scraper of DOSBox-X's ncurses debugger UI; (b) patch DOSBox-X to expose a TCP debug port.
  - Path (b) is cleaner long-term; cost is maintaining a fork.

- #065 [open] — Visual regression harness for headless playthroughs
  - Once dynamic-driving is exercised in real use (`pnpm test:integration`), capture reference screenshot sequences for known game flows. Re-run the same sequence in CI; diff each frame against the reference. Catches gameplay-flow regressions the existing pixel-parity tests don't (they cover isolated frames, not transitions).

- #067 [open] — AddPartyPage omits wfont4 in its castle-scene composite
  - `AddPartyPage.tsx` calls `composeCastleFrame(...)` with only 12 args (missing the 13th, `wfont4`), so equipment glyphs in the party-panel portraits behind the ADD picker render wrong. Surfaced 2026-06-01 while fixing the same omission in `PartyMemberPicker.tsx` (the REVIEW/DISMISS picker fix) — there the browser e2e caught it via a 204px diff. `CastleScreen.tsx` and the fixed `PartyMemberPicker.tsx` both load + pass `wfont4`; AddPartyPage should too.
  - Fix is a 1-line analog (add wfont4 state + loader + the 13th arg). No pixel-parity gate exists for the ADD picker yet (only a cell fixture), so capture a `add-party-picker` engine fixture + parity test when fixing, or verify by browser e2e like the REVIEW picker.

- #059 [open] — Cursor position reset on ESC/Cancel in EDIT-submenu sub-flows
  - Per #040 final-review and Nate's smoke: ESC from `edit-submenu` returns to `action-menu` with `cursorIdx: 0`; N in `profession-confirm` returns to `profession-picker` with `cursorIdx: 0`. The user loses their selected position.
  - Resolve by carrying the "return cursor" through the reducer's state shape (e.g., `edit-submenu` remembers which action menu index it came from; `profession-confirm` remembers picker cursor). Minor UX; not blocking.

- #060 [open] — Character-creation spell selection screens render incorrectly (slots 1, 2, 3, and slot 4 = post-spell-select save-this-character prompt)
  - Surfaced during #040 smoke (2026-05-29). `packages/viewer/src/pages/roster/creation/screens/SpellPickScreen.tsx` (geometry in `ega/windows.ts`).
  - RE (2026-05-30, `docs/re/findings/wpcmk-spell-picker-geometry.json`): the window GEOMETRY is byte-exact correct (spellOuter 160,32 20x16 0x16; spellInner 168,56 19x8 0x17 — created in the grid-picker at wpcmk file 0x229c). **Not a geometry bug.** The bug is CONTENT/LAYOUT:
    - Outer panel is missing its frame chrome (top/sep H-rules at rows 0/2, V-rule borders); engine title "SPELLS" is at row 1 (port: row 0); engine "COST" label + value at **row 14** (port: "COST: N" at row 1).
    - "SELECT A NEW SPELL FOR YOUR SPELLBOOK" (msg 703) renders in the bottom bar, not the panel; port omits it.
  - **MODEL (2026-05-31, via DOSBox capture; CORRECTED below by binary RE):** the panel shows ONE spell at a time — a vertical scrollbar (↑/↓, left edge), the spell NAME ("ENERGY BLAST"), a row of level pips + a "no" (⊘) icon + the realm in colour ("FIRE" in red), and a "COST" label + value box below. ⚠ The "scrollable single-spell detail" framing was incomplete: the real navigation is a **6-school 3×2 GRID** (see the ELIGIBILITY FILTER entry below), not a flat scroll. Our port's flat `eligibleSpells` list is still wrong and must be replaced with the grid model.
  - **Engine fixture captured + committed:** `tools/parity/fixtures/engine/creation-spell-pick.{idx.gz,png}` (Mage, ENERGY BLAST/FIRE) — the pixel-parity gate the screen never had.
  - **DONE (2026-05-31):** `composeSpellPanel` (`ega/compose-spell-panel.ts`) reproduces the panel pixel-exact (frame chrome, SPELLS title row 1, scrollbar in spellInner col 0, spell name at inner r3, pips + realm + COST row 14) — verified by `tools/parity/spell-pick-parity.test.ts` at 100% vs the fixture. `SpellPickScreen.tsx` now renders that panel + the bottom-bar prompt (msg 0x2bf). The broken flat list is gone.
  - **DONE (2026-05-31):** per-spell **realm** now wired — `SpellPickScreen` reads `SPELL_TABLE[entryIdx].school` (0=Fire…5=Divine) → `REALM_NAMES` and feeds it to `composeSpellPanel` (first Mage spell → FIRE, gated by a unit test + the panel parity test). COST stays blank: the engine shows no SP cost when *learning* a starter spell at creation (verified vs the fixture) — cost is an in-game cast-time concept, not a creation one.
  - **DONE (2026-05-31):** realm COLOURS verified against the engine. Found the school→colour-nibble table at `wroot.exe` 0xff84 = `[4,2,3,6,7,5]` → FIRE 0x40 / WATER 0x20 / AIR 0x30 / EARTH 0x60 / MENTAL 0x70 / DIVINE 0x50. Front half (Fire/Water/Air) pixel-picked from live DOSBox-X captures across two classes (Mage + Priest) — matches the table exactly. 5 of 6 prior guesses were wrong (only FIRE and, by luck, EARTH were right). `REALM_ATTR` updated; see `docs/re/findings/spell-realm-colors.json`. Note: level-1 creation pools only expose schools 0-2, so Earth/Mental/Divine can't be captured at creation — back-half values come from the same authoritative table.
  - **Minor residual:** the pip bar is rendered as the engine's fixed decorative bar (its per-spell meaning, if any, is undecoded). The in-game CAST screen (separate) is where spell COST/SP would actually display — wire scenario.dbs spell cost there.
  - **ELIGIBILITY FILTER RE'd (2026-05-31, `docs/re/findings/spell-picker-eligibility.json`):** the picker is a **3-col × 2-row SCHOOL GRID** (cursor 0..5 == school; row0 = FIRE/WATER/AIR, row1 = EARTH/MENTAL/MAGIC). LEFT/RIGHT step ±3 (between rows), UP/DOWN step ±1 within a row. All six schools are navigable even when empty (blank spell cell). The earlier "only 3 spells, clamps at AIR" reading was just walking the top row — RIGHT jumps to EARTH. **Filter:** selectable iff `(byte5 & bookMask) && level == 1` (level cap is a hardcoded `1`, not char level → only ~5–7 spells, not ~33). Per-book mask **by book index**: Mage=0x8, Priest=0x4, **Alchemist=0x1 (bit0)**, **Psionic=0x2 (bit1)** — proving `spell-table.ts`/`spell-schools.ts` have the Alchemist/Psionic byte5 bits **swapped**. Pick decrements `DGROUP+0x5588+bookIdx`, looping until zero.
  - **IMPLEMENTED (2026-05-31, branch `spell-picker-grid`, plan `docs/superpowers/plans/2026-05-31-spell-picker-grid-rework.md`):** the flat-list interim is replaced with the real grid model.
    1. ✅ **Data fix:** `spellsInBook` mask `[8,4,2,1]→[8,4,1,2]`; `SPELLBOOK_SCHOOLS` Alchemist/Psionic rows swapped; `spellCost(entry)=b2` added. (Alchemist now Fire-inclusive; Psionic is the no-Fire book.)
    2. ✅ **Eligibility:** `creationSpellGrid(classIdx)` (6 per-school arrays of level-1 eligible spells) + `creationPickCount` in `@wiz6/data`.
    3. ✅ **Navigation:** `SpellPickScreen` is a two-level state machine — 3×2 school grid (left/right ±3, up/down ±1, clamped) → ENTER drills into a school's spell sub-list (up/down move the spell cursor, COST shows per spell) → ENTER picks; loops until the budget is met. School cursor drawn on the char-sheet mana icons (`compose-school-cursor.ts`).
    4. ✅ **Parity:** 6 engine fixtures (grid fire/water/air/earth + sub-list chill/terror) gated at 100% in `spell-pick-parity.test.ts`. All suites green (data 538, viewer 827, parity 6).
    - Deferred: the school-cursor's own pixel-rect gate (currently pixel-pick-verified against the water/earth fixtures, not a committed rect test); a full-screen creation parity fixture; manual browser smoke.

- #054 [open] — Audit CHARACTER MENU functional completeness
  - How much of the wpcmk CHARACTER MENU port is functionally equivalent to the engine vs scaffold? Pixel-parity is byte-exact on the rendered cells, but REVIEW/DELETE/RENAME/PORTRAIT actions are partly stubbed (per #019 deferred polish notes).
  - Method: walk each option in the engine via DOSBox-X, compare to the port flow-by-flow; file gaps as discrete TODOs. Output: a `docs/re/findings/wpcmk-functional-audit.json` with verified/stubbed/missing per action.

- #053 [open] — Visual-fidelity bucket (HD upgrade exploration)
  - AI-upscaled tiles / sprites / fonts (Real-ESRGAN or similar on the extracted assets, ship alongside originals via a toggle).
  - Custom shaders (#030 already tracks the WebGL presenter — this would be the content side: CRT, dither smoothing, depth-of-field for the dungeon view).
  - Additional AI-generated portraits (extend the 42-slot grid; need a portrait gallery UX for picking).
  - Additional AI-generated textures for specific areas (dungeon biomes, environment art).
  - All four ideas are gated on the asset-format migration (#031) and the shader presenter (#030).

- #052 [open] — Profession-list 2-column nav: Up/Down within column, Left/Right between
  - `packages/viewer/src/pages/roster/creation/screens/MenuPickerScreen.tsx` handles the class-select screen. When the list flows into two columns (the 11-class layout), the current keyboard nav probably wraps top-to-bottom across all entries instead of treating the columns as a 2D grid.
  - Target UX: ArrowUp/Down stays inside the active column; ArrowLeft/Right hops to the matching row of the adjacent column. Mirrors the engine's grid picker semantics.
  - Verify whether this needs to apply to RACE picker too (also has columnar layout).

- #051 [open] — Shorten the bonus-points QoL description
  - `packages/data/src/schemas/house-rules.ts` — `HOUSE_RULES_META.pinMaxBonusRoll.description` is ~500 words explaining the bonus-roll grind. The card it links to (`/explore/notes#bonus-point-lottery` in EngineeringNotes.tsx around line 108) already has the full pitch + math.
  - Trim the META description to 2-3 sentences (pitch + the "see linked card" hand-off). Keep the `learnMoreUrl` intact so the rich card is one click away.

- #048 [open] — Engineering-note permalinks don't scroll to the anchor
  - `/explore/notes` (`EngineeringNotes.tsx`) and the inline `<RECommentary>` cards: clicking a link like `/explore/notes#bonus-point-lottery` loads the page but does NOT scroll to the matching `<h2 id="bonus-point-lottery">`.
  - Likely cause: SPA navigation via react-router-dom does not trigger the browser's native hash-fragment scroll. Need a `useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView() }, [hash])` somewhere — either page-level (EngineeringNotes) or a global router-level scroll-to-hash hook.

- #047 [open] — gitignore `tools/dosbox/dosbox-autodrive.log`
  - DOSBox-X auto-creates this log when launched; it's per-run/local state and shouldn't be tracked. Single-line `.gitignore` addition.

- #046 [open] — Remove the "browser audio requires a gesture" user-facing message
  - Audio is unlocked silently on first keydown/pointerdown by `packages/viewer/src/lib/audio.ts` — the gesture-requirement is plumbing, not something the user needs to read about.
  - Locate the visible banner/toast that announces this and delete it. The unlock logic in `App.tsx` / `GameTitle.tsx` / `audio.ts` stays — only the user-facing notice goes.

- #042 [open] — Confirm WPCVW action menu disabled-attr against fixture
  - Scaffold uses attr 0x07 (dim gray) for disabled actions. Engine may render disabled with a different attr or not render them at all. Check against a fixture where `*0x4fce == 4` (camp/read-only) so some actions ARE disabled and visible.

- #057 [open] — Verify REPLACE disabled-entry attr in WPCVW EDIT submenu
  - `compose-edit-submenu.ts` uses attr 0x07 (dimmed gray) for the REPLACE row by analogy. Confirm against a captured engine fixture (depends on #055).

- #055 [blocked] — Capture WPCVW EDIT screen engine fixtures + add pixel-parity tests
  - Blocked on either dungeon traversal (state-0x11 reachable with `*0x4fce==5`) or MCP dynamic-driving capability (#017 v2) that lets us poke the context byte and capture saves at EDIT submenu / RENAME prompt / PORTRAIT change / CLASS picker.
  - Promote composer cell-grid assertions to pixel-parity gates once fixtures land.
  - Verify the REPLACE disabled-attr (currently 0x07 by analogy) against the engine.

- #070 [open] — EQUIP follow-ups (live-verify the MEDIUM-confidence bits)
  - EQUIP shipped 2026-06-01 (the re-equip wizard: equip-logic.ts + equip-wizard + compose-equip-picker, pixel-gated by `equip-slot0`, e2e-driven). These RE bits are implemented per the findings but NOT live-verified (stock fighter gear / single fixture don't exercise them):
  - **INTERACTION MODEL CORRECTED + REWORKED (2026-06-01, DOSBox-verified, `docs/re/findings/wpcvw-equip-ux-correction.json`).** The port had EQUIP backwards: cursor started on the first candidate with LEFT/RIGHT nav and the ▸ treated as the cursor — so up/down did nothing and it looked like only NONE was selectable (Nate's bug report). The engine: cursor starts on **NONE**; **UP/DOWN cycle** [NONE, candidates…]; the **▸ (0x64)** is a "candidate" marker, **✓ (0x17)** = equipped, and the **cursor** is the inverse box on the item (or highlighted NONE in the prompt); ENTER on NONE skips, on a candidate equips. Reworked `nextEquipCursor` + the reducer (initial cursor NONE, up/down) + `compose-equip-picker` (per-row ✓/▸/box markers + prompt NONE-highlight tracks the cursor) + page wiring + e2e (down→item, enter→equip). New fixtures `equip-slot1-equipped` + `equip-slot1-selected` at tol 0; this resolved the old item (4) "mid-nav prompt semantics" question. 898 viewer + 86 parity + 7 e2e green.
  - **Remaining MEDIUM bits:** (1) **Phase-3 grants** (`applyPhase3Grants`): codes 9/10 no-op; 11-13 magnitudes + attr bumps want a live DOSBox equip of grant-bearing gear. (2) **monk/ninja base-AC** martial-arts skill index in `computeBaseAc` is a guess. (3) **bodyAc byte-wrap** (0-AC weapon + 1-AC shield → 0xFF) not pixel-verified. (5) **bit0/bit1 persistence** unit-tested; a live equip+save+reload would confirm.
  - Drive the engine (fresh boot + send_input + save_state ≤9; load_state/screenshot chords were flaky 2026-06-01) for a grant-bearing, multi-candidate character to close these.

- #071 [open] — House Rule idea: friendlier per-item EQUIP
  - The engine EQUIP is a re-equip-from-scratch wizard (Phase-1 strips everything, then you re-pick all 8 slots in order). Faithful but tedious. Candidate HOUSE_RULES toggle: a per-item equip/unequip (pick an item → equip to its slot) instead of the full wizard. Default = engine wizard. Per the House Rules convention in CLAUDE.md — raise with Nate before implementing.

- #038 [open] — Port WPCVW USE action
  - Item-use dispatch table at wpcvw 0x4a5b. Per-item-id branches for scrolls/wands/etc.
  - Open follow-up from `wpcvw-character-view-ux.json`: the per-item-id table needs decoding.

- #037 [open] — Port WPCVW DROP action (RE done; dungeon-only — banked pending dungeon char-view)
  - **Fully RE'd 2026-06-01** (`docs/re/findings/wpcvw-drop-action.json`). Handler @ wpcvw 0x6a86: picker (msg 0x192 'DROP WHICH ITEM?', reuses the ASSAY inventory picker) → guard `flags & 0x43` on the inventory-item flags byte +0x442f (bit0=equipped/cursed-low, bit1=durable-cursed, bit6=class-locked): if any set → **beep (sound slot 0), NO message, NO popup, item stays, back to action menu**. Otherwise `0x17f7` unequips-then-removes: PASS A reverses the equipped item's AC/weapon stats (no-op for droppable items since equipped ⇒ bit0 ⇒ blocked); PASS B zeroes the id, `dec` count +0x4594, and **compacts** the inventory + 2 parallel arrays, fixing up equipment indices > the removed slot. **No confirmation dialog**; item is DESTROYED (no ground pool). Renames: 0x17f7→`inventory_unequip_and_remove`, 0x16c0→`inventory_reset_weapon_slot`.
  - **NOT camp-reachable**: DROP (index 7) is absent from the camp context mask (`*0x4fce==4` = EQUIP/SPELL/ASSAY/SWAG/SKILL/REVIEW); it's only in the dungeon-default + combat masks. Our `CharacterViewPage` is the camp view, so a faithful port has no reachable home until the **dungeon character-view** lands (the #055 cluster — blocked on dungeon traversal / MCP dynamic-driving for fixtures). Alternative when revisiting: an `allowDropFromCamp` HOUSE_RULES toggle (default OFF), mirroring `allowEditFromCamp`.
  - **Port build (when unblocked)** = ASSAY-sized: reducer `drop-picker` sub-state (reuse `nextInventoryCursor` + `compose-inventory-picker`, prompt 'DROP WHICH ITEM?') + `commit-drop`/`drop-refused` intents + a pure `dropItem(member, invIdx)` in `@wiz6/data` (compact inventory[22], clear tail, reindex equipment[]) + `isDroppable(item)=(flags&0x43)===0` + pixel-parity + e2e. The reusable inventory picker (from ASSAY) + the unequip/AC inverse of `applyEquipSelections` are READY.

- #036 [open] — Port WPCVW TRADE action
  - Give-to-party-member, 32-bit gold transfer. Engine: 0x513e.

- #072 [open] — ASSAY follow-ups (verify MEDIUM descriptor bits)
  - ASSAY shipped 2026-06-01 (read-only inspect: assayItem descriptor + compose-inventory-picker + compose-assay-display, pixel-gated by `assay-picker` + `assay-longsword`, e2e-driven). Remaining:
  - ~~(1) Inventory-picker cursor order~~ **FIXED 2026-06-01.** RE'd `ui_pick_inventory_item` @ wpcvw 0x1a48 (decompiled): NONE is `local_a == -1`, sits OUTSIDE both ends; entering from NONE (either direction) lands on the TOP item; Up on item i→i-1 (item 0→NONE); Down on item i→i+1 (last→NONE). Rewrote `nextInventoryCursor` to match + updated unit/reducer tests + simplified the ASSAY/SWAG e2e drives (1 ArrowUp from NONE → top). 57 picker/reducer + 7 e2e green. Applies to ASSAY + SWAG (all pickers) and future USE #038 / DROP #037.
  - (2) **MEDIUM descriptor bits** (unexercised by LONGSWORD): non-sword `attackModes` (cats 1-4 are best-guess), the `curse` line (no cursed stock item assayed), the `resistances` averaging (all-zero for LONGSWORD), and 2HAND-vs-1HAND for a genuine two-handed weapon. Assay a weapon/armor with those properties (live DOSBox) to confirm.

- #034 [open] — Port WPCVW SWAG action (RE done 2026-06-01; meatier mutating manager — sequence after SKILL/DROP groundwork)
  - **Fully RE'd** (`docs/re/findings/wpcvw-swag-action.json`). SWAG is an **interactive per-character item manager**, NOT a read-only viewer and NOT a shared party pool. Handler @ wpcvw 0x6b3d → `wpcvw_show_pool_inventory` @ 0x1db3 opens a 20x16 "SWAG BAG" popup (title msg 0x2ee) running a 3-option **ADD / REMOVE / DROP** picker loop (msg base 0x2ef; option 3 = EXIT).
  - **Key finding:** the "SWAG BAG" is the **upper half of the SAME 22-slot inventory array** at +0x4428 — carried = slots 0..9 (count +0x4594, cap 10); bag = slots 10..21 (count +0x4595, cap 12; bag item k at (k+10)*8+0x4428). **No DGROUP party-pool buffer exists.** This CORRECTS `character-record-inventory-equipment.json#equip-pool-count-offset` (+0x4595 is the bag count, NOT "equipment slots in use").
  - Mutations: **ADD** (carried→bag if not equipped; else beep) copies the 8-byte record into bag[count], inc +0x4595, removes from carried (dec +0x4594). **REMOVE** (bag→carried) copies back to carried[+0x4594], inc +0x4594, `inventory_remove_pool_slot` @ 0x1963 dec +0x4595 + compacts bag. **DROP** (destroy from bag, if not class-locked bit6/0x40; else beep) via the same compactor. Prompts msg 0x2f8/0x2f9/0x2fa.
  - Gating (high-confidence comparators): ADD off if bag≥12 OR carried==0; REMOVE off if bag==0 OR carried≥10; DROP off if bag==0. Enabled in camp/dungeon/combat masks.
  - **Port verdict:** no new party-pool model — but DOES require remodeling the existing 22-slot inventory as **10 carried (+0x4594) + 12 bag (+0x4595)** with the two count fields, plus 3 mutating sub-flows + two pickers. Reuses the DROP guards/compaction (#037). Bigger than SKILL. Plan: `docs/superpowers/plans/2026-06-01-wpcvw-swag.md`.
  - **Stage 1 DONE (2026-06-01):** `@wiz6/data` `character-view/swag-bag.ts` (counts derived from the packed 22-slot array; `swagAdd`/`swagRemove`/`swagDrop` with carried-compaction+equipment-fixup + bag-compaction; add/drop guards + gating). Bounded `equipCandidates`/`scanCarried` to the carried region (0-9) so bag items don't leak into EQUIP/ASSAY pickers. (Carried compaction+fixup = the deferred DROP #037 core.) 591 data tests green.
  - **Stage 4a DONE:** committed engine fixtures `swag-empty` + `swag-longsword`.
  - **Stages 2/3/5 DONE (2026-06-01) — SWAG SHIPPED.** Stage 2: extended `dump-cells.py` with `--header W,H,X,Y,ATTR` (finds chrome-heavy popups the printable-ASCII `--scan` rejects) → got the exact popup cells → `compose-swag-bag.ts` at **100% pixel-parity** (`swag-empty` + `swag-longsword`). Stage 3: reducer sub-flow (`swag-menu` → add/remove/drop pickers → commit intents) + `CharacterViewPage` wiring (mutate via `swagAdd`/`swagRemove`/`swagDrop`, guards beep-no-op). Stage 5: e2e drives the real ADD flow + asserts both fixtures + the persisted carried→bag move. 591 data + 892 viewer + 84 parity + 7 e2e green.
  - **Stage 6 (verify MEDIUM bits) — REMAINING:** (a) wire the **reject beep** for refused ADD (equipped) / DROP (class-locked) — currently a silent no-op; (b) confirm the col-18 **per-item icon** semantics (spriteIdx-based; LONGSWORD→0x02 matches `equipSlotIcon`, others unverified); (c) the engine post-action menu cursor-init (we reset to EXIT). (Picker nav-order #072 — FIXED 2026-06-01: `nextInventoryCursor` now engine-exact, used by SWAG too.)

- #033 [open] — Port WPCVW MERGE action
  - Body in FUN_5826. Open follow-up RE in `wpcvw-character-view-ux.json`.


- #032 [open] — Port WPCVW SKILL action (RE done 2026-06-01; **active port target** — read-only viewer)
  - **Fully RE'd** (`docs/re/findings/wpcvw-skill-action.json`). SKILL is a **READ-ONLY skill-level viewer** (NOT a "use a skill" action — proven: zero stores to +0x451c/+0x4590, zero RNG, zero skill checks across 0x4d36..0x4e93 + 0x9dfb..0xa340). Menu option 8 → handler 0x6b4e → `wpcvw_skill_viewer` @ 0x4d36 opens a 20x16 popup (x=0x14,y=4,w=0x14,h=0x10,attr=0x19) and runs a **category-tab picker** (`ui_menu_picker_grid` @ 0x6c, msg_base 600): WEAPONRY/PHYSICAL/PERSONAL/ACADEMIA + EXIT (tab 4). Arrows move the tab cursor only; selecting a tab re-renders that category's skill rows. NO ←→ level-adjust (that's the creation skill-train screen, a different screen).
  - Renderer `wpcvw_render_skill_category` @ 0x9dfb: reads class +0x4587, builds the per-class skill-availability table at global 0x57fe via 0x982f (row shown if class can learn it OR char already has level>0), then per enabled slot in the category range prints skill NAME (msg from CS table 0x157c+slot) + LEVEL = **record +0x451c+slot** (the skills[30] array, cap 50), plus a trailing skill-points line = **record +0x4590**. Category slot ranges (match wpcmk): WEAPONRY 0..9, PHYSICAL 0xa..0x10, PERSONAL 0x11..0x15, ACADEMIA 0x16..0x1d. Labels msg 600-604; skill names msg = slot+0xfa0 (skill-names.json).
  - **Port verdict:** faithful TS port works from existing `member.skills` (U8[30]) + existing `class-skill-availability.ts`. **ONE schema gap:** the skill-points byte at record +0x4590 (struct +0x1a8) is NOT yet in `packages/data/.../pcfile.ts` — add it (semantic = unspent skill-bonus pool, MEDIUM; confirm via DOSBox read across stock chars). Renames recommended: 0x9dfb `ui_render_spell_school_picker`→ skill-category renderer; 0x982f `item_compute_usability_bitmaps`→ skill-availability builder.
  - Build: schema field add → skill-viewer composer (popup + category tabs + per-slot name/level rows + points line) → reducer `skill-viewer` sub-state (category-tab cursor, ENTER re-renders, EXIT/ESC back) → CharacterViewPage wiring → pixel-parity fixture (camp-reachable; fighter/thief party has real skills) → e2e. Reuses ASSAY's read-only popup pattern. **Staged plan: `docs/superpowers/plans/2026-06-01-wpcvw-skill-viewer.md`.**
  - **Stages 1-5 DONE (2026-06-01) — SKILL viewer SHIPPED.** Plan: `docs/superpowers/plans/2026-06-01-wpcvw-skill-viewer.md`.
    - **Stage 1 (data):** binary-anchored skill-name correction — `SKILL_SLOT_NAMES` = engine map (msg 5500+slot; `docs/re/findings/wpcvw-skill-names.json`); slots 10/17-21 are real skills (SWIMMING/DEFENSE/SPEED/MOVEMENT/AIM/POWER); `pcfile.ts` comment fixed. New `@wiz6/data` `character-view/skill-viewer.ts` (`SKILL_CATEGORIES`/`skillRowVisible`/`skillViewerRows`). Engineering Notes card "The Skill Names Hiding In Plain Sight".
    - **Stage 2 (composer):** extracted `composeSkillPanelWindow` from `composeSkillTrainFrame`; `compose-skill-viewer.ts` = panel + dynamic tab strip. Pixel-exact (100%) vs all 3 fixtures.
    - **Stage 3 (reducer + page):** `skill-viewer` state + dynamic `skillTabEntries` (categories-minus-current + EXIT, PERSONAL gated by `hasPersonalSkills`); wired into `CharacterViewPage`.
    - **Stage 4 (fixtures):** drove DOSBox → committed `skill-viewer-{weaponry,physical,academia}` engine fixtures.
    - **Stage 5 (e2e):** mounted-app drive through 3 categories + EXIT, all pixel-match.
  - **Stage 6 (verify MEDIUM bits) — REMAINING follow-ups:**
    - (a) ~~capture a PERSONAL category fixture~~ **WON'T DO (confirmed by Nate 2026-06-01): NO class exposes the PERSONAL category.** No character ever gets `skills[17..21] > 0`, so the `hasPersonalSkills` gate never opens and the PERSONAL tab is never offered. Our composer/reducer still handle it defensively (engine-faithful dormant code, mirroring `composeSkillTrainFrame`'s preserved-but-never-shown PERSONAL entry) — no fixture is capturable or needed.
    - (b) **surface the `+0x1a8` skill-points field** on `ActivePartyMember` (currently defaults 0; reconcile the struct's `spells_to_learn` label vs the screen's "SKILL POINTS" — `docs/re/findings/wpcvw-skill-names.json`).
    - (c) promote the 3 function renames (0x4d36/0x9dfb/0x982f) into `docs/re/wpcvw-*.md`.
    - (d) confirm the engine's exact post-switch tab cursor-init (cosmetic; our reducer resets to 0).

- #031 [open] — Asset format migration: JSON → spritesheets
  - JSON encoding bloats binary glyph/portrait/PIC data by 10-30×. Glyphs are 32 bytes binary; the JSON form is ~600+ bytes. Network cost on every viewer load.
  - Plan: pre-built PNG spritesheets for wfont/wport/PIC with a small JSON metadata file. Keep JSON form for decoder development.
  - Touches extractor pipeline (`packages/cli`), loaders (`packages/viewer/src/data-loader.ts`), test fixtures.
  - Defer until we have measured load-time pain or want to ship to mobile.

- #030 [open] — WebGL presenter for shader / HD rendering
  - Implement a second `Presenter` backend (alongside `CanvasPresenter`) that takes RGBA and runs it through a WebGL pipeline. Enables CRT shaders, scanline effects, scale-up filters, HD-asset compositing.
  - Touches only `packages/viewer/src/lib/presenter.ts` (+ a new `WebGLPresenter.ts` and possibly a hook for component-level opt-in); composers are unaffected.
  - Blocked on: concrete need (no shader experiment in flight yet).

- #029 [open] — Per-region pixel tolerances in `compareRgba`
  - Currently `compareRgba(ours, eng, { tolerance: N })` applies one global tolerance. All parity tests today use `tolerance: 0` (strict gate).
  - When a future ported screen has localized animation drift (e.g. water tiles, particle effects) that we can't reproduce byte-exact, we'll want named-region overrides: `regions: [{ name, x, y, w, h, tolerance }]` with `defaultTolerance` for everything else.
  - Implement when the first such screen lands. CLAUDE.md test-layer convention already documents this as the preferred approach over globally lifting tolerance.

- #028 [open] — Simplify ADD PARTY picker composer per the resolved struct model
  - Per `docs/re/findings/wbase-picker-internals.json`: both picker panels use `cells_off = struct + 0x10` and the engine renders NATHAN at global col 22 because the row renderer leftpads cursor to x=2 (NOT because struct.x=22).
  - Today: composer hardcodes `RIGHT_CELL_X = 22` and emits NATHAN at panel col 0, plus separate `middleStrip` + `scrollbar` windows. Mental model is wrong even though pixel output is correct.
  - Simplification: set `RIGHT_CELL_X = 20`, shift right-panel cells right by 2 cols (scrollbar at col 1, NATHAN at col 2-7), drop the standalone `scrollbar` window and possibly the `middleStrip`.
  - Also update `tools/parity/dump-cells.py --picker` to use `cells_off = struct + 0x10` unconditionally (drop the +0x14 path) and regenerate the fixture at `tools/parity/fixtures/cells/add-party-picker-1char.json`.
  - Pixel parity should remain at 100% (verify before commit).
  - Engine routine that paints chrome at cell 19 rows 19-23 (the right-edge line glyph 0x1c) is still unidentified — likely belongs to a window we haven't located. Document as open question during this refactor.

- #019 [open] — wpcmk Phase 2 — Stages A–F COMPLETE; next: layout-refinement (now measurable via parity)
  - **Stage C (screens) COMPLETE** — `packages/viewer/src/pages/roster/creation/`: `state.ts` (pure flow reducer, §1 + characterMenu entry), `messages.ts` (§3 msg-id wiring), `screens/` (CharacterMenu, NameInput, MenuPicker[race/sex/class], BonusAllocator, Personality, PortraitPicker[placeholder pixels], SkillTrain, SpellPick, Confirm), `CreationPage.tsx` + `lib/build.ts`. Plan: `…-stage-c-screens.md`.
  - **Stage D (cutover) COMPLETE** — old `/roster/new` wizard + `pinMaxBonusRoll` deleted.
  - **Stage E (shell + chrome + CHARACTER MENU) COMPLETE** — window chrome RE'd (`wpcmk-window-chrome.json`: wfont1, fill 0x00, frame 0x01-0x08) + rendered (fixed the "ring sprite" bug); CHARACTER MENU 6-option entry (`CharacterMenuScreen`); one continuous screen at `/castle/character-menu` (reached via MASTER OPTIONS), centered in the shell; `/roster/new` + RosterView "+ New" deleted. Plan: `…-stage-e-shell.md`. Verified via PNG render (chrome + menu + name) — NOT yet browser-verified.
  - **Stage F (parity testing infra) COMPLETE** — Plan `…-parity-testing-infra.md`. (1) `tools/parity/decode-screen.ts` decodes the engine's exact 320×200 screen OFFLINE from a `.sav` `Vga` section; (2) Playwright installed + `packages/viewer/e2e/`; (3) `tools/parity/diff-image.ts` (`compareRgba`+diff PNG) + `screen-parity.ts`; (4) `tools/parity/sprite.ts` (renderFontGlyph/PicSprite, extractCell, assertSpriteMatches + CLI).
  - **decode-screen now color-faithful** (`75b5709`/`38a6455`/`64b33fd`): true VRAM base **`0x84000`**, NO masking, **wiz6-main AC→DAC palette** (wroot 0x2043) — black interiors / light-gray frames / white text / dark-gray bg all decode correctly across the 3 menu saves. Menu uses EGA planes 0+3.
  - **Dynamic CHARACTER MENU** (`6a5d3d3`): roster-state options — empty → CREATE PC+EXIT; partial → all 6; full (**16** slots) → no CREATE PC. RE: `wpcmk-character-menu-options.json`.
  - **Parity uses COMMITTED fixtures, not `.sav`** (`5581447`, done): `tools/parity/fixtures/engine/character-menu-{empty,partial,full}.{idx.gz,png}` (gzipped EGA-index arrays + viewer PNGs, ~1-2.5 KB each). `packages/viewer/tests/.../ega/screen-parity.test.ts` diffs our headless render vs the committed fixture — **zero `.sav` reads** (the 5 `.sav` mentions are all comments). Regenerate via `gen-fixture`. Satisfies "we should not need the save again."
  - **Layout pass 1 DONE** (parity **47% → 49.25%**, floor raised 40→45): menu options now pixel-exact — column-major fill, columns at bottomBar-local x=[18,30,2], rows 3&4; killed the flood-yellow highlight bug (bottom list is plain white; engine reflects selection in the TOP bar, not the bottom list). Verified vs empty/partial fixtures; FULL layout flagged unverified (doesn't fit the model — `wpcmk-screens.md` §1a open question). Doc: `wpcmk-screens.md` §1a "Option placement".
  - **Layout pass 2 DONE — BYTE-EXACT tile parity** (saves 1/2/3, all 3 windows, 0 diffs). The CHARACTER MENU is entirely tiles: `top` cleared black (wfont1) + `drawCharSheetTemplate` (port of FUN_06af's stat-panel frame); `bottomBar`/`menuPanel` cleared GRAY (char 0x20, attr 0x03 / wfont3); menu options column-major at bottomBar cols [4,16,28] rows [1,2] (attr 0x03); cursor = per-label black-on-yellow highlight (attr 0x50, `highlightRange`). Verified against the engine's LIVE window CELL memory. RE: `docs/re/findings/wpcmk-charmenu-toplayout.json`.
  - **Parity oracle pivoted to CELL grids**: `tools/parity/dump-cells.py` dumps the engine's `(char,attr)` window arrays from a save → `tools/parity/fixtures/cells/save{1,2,3}.json`; `cell-parity.test.ts` asserts byte-exact. This REPLACES the framebuffer fixtures (deleted) — **`tools/parity/decode-screen.ts` is BUGGY** (≈+14-cell/+2-row cyclic shift; the prior fixtures + layout-pass-1 positions were all shifted). decode-screen now carries a warning header.
  - **decode-screen display-start fix** (deferred, low priority): correct the CRTC display-start/origin math so the framebuffer decoder matches the engine (or retire it — cell-grid parity is the better oracle). Only needed if we want a pixel-level (vs tile-level) oracle.
  - **Per-screen byte-exact ports (cell-grid parity, via `dump-cells.py` fixtures)**: CHARACTER MENU (empty/partial/full), NAME INPUT, RACE/CLASS picker (menuPanel list + centered prompt), and the **populated char-sheet** (`ega/char-sheet.ts` — `drawCharSheet(top, draft, db, title)`: STR..KAR + values, HP/STM, BONUS, EXP/LVL/MKS/RNK, name/sex/race header, 6-icon bottom grid; right-aligned space-padded numbers; attr = param<<4). RE: `docs/re/findings/wpcmk-charsheet-fields.json` (3 routines: `ui_render_stat_panel` 0x2b04, `ui_redraw_character_sheet` 0x0df7, `ui_print_character_header` 0x0d52). Fixtures: `cells/{save1,save2,save3,name-input,race-select,class-select}.json`. New tool: `tools/ghidra/scripts/decompile.py` (PyGhidra shim; old `dump_function.py` broke on pyghidra 3.x). **Unverified (0 in all fixtures)**: EXP/MKS multi-digit widths, age values, school-mana bottom-grid — need a post-screen-07 save with non-zero hp/xp/level + a mid-game char. **Next screens to capture/port**: sex picker (03), bonus allocator (06), personality (08), skill train (13), spell pick (14), confirm (15).
  - **Browser-verify** `/castle/character-menu` (centering, keyboard nav, the 3 dynamic states) — Playwright e2e covers structural render; a human eyeball is still worthwhile.
  - **Parity infra follow-ups**: Playwright `webServer` skips `predev` (assumes extracted assets — CI needs an extract step); `waitForNonBlankCanvas` has a cold-server paint race (warm runs fine) — harden to wait for the gray frame color.
  - **Deferred polish**: real WPORT*.EGA portrait pixels (placeholder now); REVIEW/DELETE/RENAME/PORTRAIT menu actions are stubs; wall-clock animation feel.
  - **Stage A (engine) COMPLETE** — RNG, formulas, record encoder, parity harness, all tested; full RNG-sequence parity pending a manual DOSBox creation-commit save capture.
    - `WichmannHill`, `rollBonus`, `rollSkillBudget`, `rollKarmaWith`, `computeDerivedStats` all live in `@wiz6/data`; compose test in `packages/data/tests/character-creation/creation-engine.compose.test.ts`.
  - **Stage B (EGA primitives) COMPLETE** — `packages/viewer/src/pages/roster/creation/ega/`: `windows.ts` (window-set), `assets.ts` (`loadCreationFontSet`+palette), `render-frame.ts` (`renderCreationFrame`→RGBA + golden snapshot), `highlight.ts` (menu-cursor), `CreationCanvas.tsx`. Plan: `docs/superpowers/plans/2026-05-26-wpcmk-port-stage-b-ega.md`.
  - **Open RE items** (see `docs/re/wpcmk-screens.md` Open Questions): Fighter skill-budget tier2 (needs a Fighter creation save); portrait default (0 vs SPD+1); real HP formula derived (per-class roll); NUG ground-truth validation in `docs/re/findings/wpcmk-nug-ground-truth-validation.json`.
  - Phase 1 RE sweep: `docs/re/wpcmk-screens.md` (17 screens, 76/76 functions named) + 12 `docs/re/findings/wpcmk-*.json`.
  - Stage A plan: `docs/superpowers/plans/2026-05-26-wpcmk-port-stage-a-engine.md`; spec: `docs/superpowers/specs/2026-05-26-wpcmk-byte-perfect-design.md`.

- #004 [open] — PIC Stage B: pixel rendering + monster sprite integration
  - In-flight plan: `docs/superpowers/plans/2026-05-22-pic-stage-b-pixel-rendering.md` (6/57 boxes checked).
  - Decoder spec is complete; need descriptor parsing rewrite, EGA cell rendering, viewer wiring.

- #005 [open] — Viewer redesign Stage 2c
  - Plan: `docs/superpowers/plans/2026-05-22-viewer-redesign-stage-2c.md` (0/50).
  - Not started.

- #006 [open] — Viewer redesign Stage 2d (monster power tools)
  - Plan: `docs/superpowers/plans/2026-05-22-viewer-redesign-stage-2d.md` (0/44).
  - Compare mode (`/monsters/compare`), family-grouped index, copy-bytes/JSON header buttons.
  - `.pic` monster sprites are still blocked on prior stage; cross-references with #004.

- #022 [open] — Skill-train screen polish + remaining RE
  - Live viewer screen is now wired up via the shared `composeSkillTrainFrame` (commit 29aa2c8); parity test stays pixel-perfect (7/7 floor 100). Key bindings match the engine: ◄►=adjust skill, ▲▼=select, Enter=next category, ArrowLeft=no-op.
  - Open items: (1) RE the row 9/11 left-vert glyph 0x0f vs 0x0d — origin still unknown, reproduced as-is; (2) RE the row-3 "second age" field at top (5,3) — currently hardcoded "  1" in `composeSkillTrainFrame` to match slot 1 (TODO: derive from a real source — possibly child age or some chargen counter); (3) confirm layout for PHYSICAL/PERSONAL/ACADEMIA categories (different row counts may need a parity fixture per category); (4) consider hoisting the persistent wfont2 portrait patch into `CreationPage` so ALL post-portrait screens (skillTrain, spellPick, confirm) get it automatically instead of each repeating the pattern.

- #023 [open] — DISMISS A PARTY MEMBER (wbase character_submenu, slot 2)
  - Engine slot 2 calls `pick_party_member(0x4b3)` then `character_submenu(picked)`. The character_submenu (`FUN_25cc` @ wbase 0x25cc) is undecoded; per-member DISMISS likely lives inside it.
  - Needs an RE subagent pass on `wbase_character_submenu` to identify per-member options. Then a sibling spec/plan to `2026-05-28-add-party-member-design.md`.
  - Spec referenced this as the per-member inverse of ADD.

- #025 [open] — `msg.dbs` ID-to-text decoding for IDs ≥ 718
  - `load_msg_into_buf` (wroot 0x75b) has an ID → section/offset encoding not yet reversed. Our `extracted/messages/msg.json` covers IDs 0..717.
  - Blocks reading exact engine strings for any msg ID > 717. Picker titles (0x4b1 / 0x4b6 / 0x4b7), race/class/sex enum strings (bases 100/120/140), and many other UI labels live in the unmapped range.
  - ADD PARTY MEMBER uses fixture-captured strings (`save/1.sav` cells), so this isn't blocking the feature — but a proper decode would let the picker render strings from the msg DB rather than hardcoded constants in the composer.

- #021 [open] — Per-class bonus-allocator AUTO-FILL animation
  - End-state implemented (commit 9c7879b): `PICK_CLASS` snaps attributes to `max(race_base, class_min)` and deducts the deficit from the pool. Verified vs the engine save (NATHAN/Samurai/pool 17→2).
  - The engine ANIMATES the ramp: `wpcmk_pick_class_menu` exit calls FUN_2e85 → FUN_2fbd which dispatches via the 14-entry jump table at wpcmk CS `0x7505` (= file `0x2FA1`) to a per-class routine that increments attrs one-at-a-time with sound + per-frame redraw. Need to:
    1. Read the 14 jump-table entries from a class-selected save state (table lives in wpcmk data segment — pick any save where `wpcmk_pick_class_menu` has run).
    2. Decompile a couple of routines (Samurai class 11, Fighter class 0) to see the increment pattern (order of attrs, per-step delay, sound trigger).
    3. Decide whether to port the animation faithfully or do a generic per-attr ramp (1 frame per +1 increment, looping STR→PER until each reaches class_min) — both end at the same state.
  - Add a screen-parity case for `creation-bonus-allocator` (current slot 1: NATHAN, Samurai, post-auto-fill, pool=2, cursor on STR). Needs a `drawBonusAllocator` helper for the cursor + bottom-prompt rows (`MSG_ASSIGN_ABILITY` 0x0460 + arrow-glyph instructions 0x0454).

- #020 [open] — `renderEgaScreen` plane-3 storage for `titlepag.scr` bottom tagline (last 1.6% of intro parity)
  - `tools/parity/intro-parity.test.ts` sits at 98.38% on `title-art` / `title-art-copyright` (1038 px). The residual is entirely in the bottom 7 rows (y 185-191) and every diff pixel is exactly `engine = ours | 8` — the engine has the **intensity plane (bit 3)** set on the bottom tagline, ours doesn't.
  - `renderEgaScreen` (`packages/parser/src/formats/ega-screen-render.ts`) uses an empirical per-plane shift (`shiftX = 64·p`, `shiftY = −5·p`, plus a `yDrop`) that's pixel-exact for the whole rest of `titlepag` AND for `graveyrd` / `dragonsc`. At `shiftY=-15` plane-3's body is 0-diff; **no other `shiftY` recovers the band**, and a true global byte-rotation (`R3=-576`, the model the docstring describes) gives the same — band 1038, body 0. So no single plane-3 transform can place both regions. `titlepag.scr` plane 3 is stored non-uniformly there, or the engine brightens the tagline by some mechanism outside the static `.scr`.
  - Method to close: byte-level inspection of `original/titlepag.scr` plane 3 in the bottom-rows region (which is where exactly?), comparing against what the rotation model expects. Or grep wroot/winit for a tagline-brightening overlay. Beware: any change to `sourceCoordForPlane` risks regressions on `graveyrd` / `dragonsc` — re-run the full parity suite after.
  - User explicitly deferred (2026-05-27): "I don't think anything will blow up, but I don't wanna do it right now either."

- #009 [open] — Savegame + Roster: Phase 6 (Saves page UX) + Phase 7-8 (DOS interop, savegame editor) remain
  - Design: [`docs/superpowers/specs/2026-05-23-savegame-strategy.md`](docs/superpowers/specs/2026-05-23-savegame-strategy.md).
  - Plan: [`docs/superpowers/plans/2026-05-25-savegame-roster-phases-1-5.md`](docs/superpowers/plans/2026-05-25-savegame-roster-phases-1-5.md).
  - **Phases 1-5 shipped 2026-05-25**: schemas (`CharacterSchema` / `PartyMemberSchema` / `RosterSchema` / `SaveSchema` in `@wiz6/data`), gzip+base64 codecs in `@wiz6/parser`, localStorage stores (`wiz6:save:0..5`, `wiz6:roster`, `wiz6:gallery-origins`), curated `/gallery/characters.json` seed + auto-seed-on-first-visit, and a working `/roster` page (list + gallery badge + character download/upload).
  - **Phase 6 (`/saves` page UX)** is the natural next step — slot grid, per-slot download/upload buttons, "form party" picker pulling from the roster.
  - **Phase 7 (DOS interop)** waits on a separate `SAVEGAME.DBS` RE pass.
  - **Phase 8 (savegame editor)** builds on Phase 6 + the per-field engineering tooltips.

---

## Open questions (lower priority; investigation tasks, not features)

- #Q-B — wbase.ovr audio-config struct (partial)
  - 5 bytes copied to `0x3590..0x3594` at file `0x1488`. Identify option labels ("PC Speaker / AdLib / Tandy / Silent") and the device-selection contract. **Partially answered by #Q-L pass (2026-05-24)**: `*0x1756` is the device byte and `*0x3590` is the audio-mode/volume class. Config is NOT auto-detected — it's set by wbase from a static struct. Still need to identify the exact label↔value mapping in the menu UI.

- #Q-D — Fast-mode trigger (`*0x1760 & 2`)
  - Which gameplay states or sounds set the fast bit? Title clang uses slow.

- #Q-E — Apply audio-driver rename fixes to Ghidra project
  - The 2026-05-24 AdLib deep-dive (`docs/re/findings/wroot-adlib-driver.json`) produced 9 rename proposals for the audio driver region of wroot.exe. Key change: the misnamed `audio_adlib_init_voice@0x11962` (which is actually a 3-byte PIC EOI IRET stub) needs to be dropped; the real AdLib init is at image `0x11765` and should be named `adlib_chip_init_voice0`. Other proposals cover `adlib_write_register@0x11892`, the two delay helpers, the volume-LUT builder at `FUN_1000_17FE`, etc.
  - Method to close: update `tools/ghidra/scripts/apply_audio_names.py` (or write a new apply script) to merge the rename_proposals from the findings file. Also update `docs/re/snd-format.md` to fix the now-known-wrong "256-byte fixed LUT" claim (the LUT is runtime-rebuilt per call by `FUN_1000_17FE`).

- #Q-J — Decode `rate_or_vol` semantics in the sound-table
  - The sound-table snapshot in `@wiz6/data/sound-table.ts` exposes per-slot `rate_or_vol` values (e.g. slot 4 = 0x49, slot 7 = 0x34, slot 13 = 0x3C). The field is labelled "volume index" in the deep-dive findings but we haven't decoded the semantics — is the high nibble rate, low nibble volume? Is it scaled by music-mode at `*0x3590`? Affects in-game playback fidelity, not the intro (the intro currently uses `duration` for rate adjustment which is sufficient for SOUND04/05/06/07/13).
  - Method to close: decompile `audio_play_sound` at wroot image 0x10AAA and trace how rate_or_vol gets consumed. Or empirically vary playback rate while listening in DOSBox-X and our viewer.

- #Q-K — Runtime pitch modulation for context-dependent sounds
  - User observation (2026-05-24): the same .snd file (e.g. the death-groan sound effect) plays at different pitches depending on character context — sex of the dying character, possibly other state. Our static per-slot rate snapshot (`@wiz6/data/sound-table.ts`) captures only the BASELINE rate; the engine clearly modulates pitch at call time for some events.
  - Likely source: an additional parameter passed into `audio_play_by_id(N, duration_param, ?, flags_param)` at the call site. Or a runtime modifier byte in the sound-table flags field that the caller mutates before invocation.
  - Method to close: identify a deterministic in-game event with pitch variation (death groan via cliff-fall TPK is a good candidate per user), capture saves immediately before AND after the event in DOSBox-X, diff the sound-table memory + relevant character fields. Or decompile the specific call site (e.g. wmaze's TPK handler) to see what it passes.
  - Doesn't block any current work — intro/credits sounds are deterministic. Relevant when we get to dungeon/combat audio.
