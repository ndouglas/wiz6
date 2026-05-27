# wpcmk Port — Stage E: Window Chrome + CHARACTER MENU + Shell Integration

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps. TDD. Each subagent prompt MUST start by `cd`-ing into the worktree (subagents default to the main checkout).

**Goal:** Make the character-creation flow render like the real game and live where it belongs: (1) fix the window chrome (black-fill + gray double-line frame tiles — the current "ring sprite" bug), (2) build the real CHARACTER MENU (6-option entry: CREATE/REVIEW/DELETE/RENAME PC, PORTRAIT, EXIT) as the front of a SINGLE continuous EGA screen, (3) embed it in the centered game shell at `/castle/character-menu` reached via MASTER OPTIONS, and delete the old `/roster/new` route + RosterView "+ New Character" button.

**Architecture (confirmed with user):**
- **One continuous screen** at `/castle/character-menu`: the persistent window chrome stays up; only the bottom area swaps between the 6-option CHARACTER MENU and the creation steps (matches wpcmk's single overlay + the reference screenshots).
- The Stage-C `creationReducer` gains a new INITIAL screen `'characterMenu'`; CREATE PC → `'name'` (start creation); on commit/cancel the flow returns to `'characterMenu'` (NOT navigate away). EXIT → leave to `/castle`.
- The page renders inside the shell's centering wrapper (`.page`/`.canvasWrap`, same as CastleScreen).
- **Delete** `/roster/new` + its routing + the RosterView "+ New Character" button. Sole entry: MASTER OPTIONS (CastleScreen `/castle`) → CHARACTER MENU (`/castle/character-menu`) → CREATE PC.

**Reference:** the two user screenshots (CREATE PC initial + CHARACTER MENU) — black-interior windows with light-gray double-line frames on a gray (attr 8) background; CHARACTER MENU shows CREATE PC / REVIEW PC / DELETE PC / RENAME PC / PORTRAIT / EXIT in a 2-row×3-col layout under the chrome. RE ref: `docs/re/wpcmk-screens.md` §2 (windows), §7 (menu picker); `wpcmk_entry_and_roster_menu` (FUN_59e0) is the engine's CHARACTER MENU.

**Tech Stack:** as Stage C (React, TS ESM, vitest). Reuses Stage-B EGA primitives + Stage-C reducer/screens + CastleScreen's centering CSS.

---

## Task E1 (RE): Window-chrome tile codes

**Files:** Create `docs/re/findings/wpcmk-window-chrome.json`; promote to `docs/re/wpcmk-screens.md` §2.

**Goal:** Determine exactly how a wpcmk window's black interior + gray double-line frame is drawn — which tile CHARACTER codes and which wfont, as written by `ui_window_create` (wroot image 0x011a) and/or the window-clear/border routine. The current bug: Stage-B filled windows with char 0x20 in font4, whose glyph 0x20 is a graphic ("ring sprite"). Find the real fill + border tile chars.

- [ ] Dispatch an RE subagent: decompile `ui_window_create` (wroot image 0x011a; file 0x031a per MZ +0x200... confirm) and any window-border/clear helper it calls. Determine: (a) the BLACK-FILL tile char + attr (which font, what code renders a solid black 8×8 cell); (b) the FRAME tiles — top-left/top-right/bottom-left/bottom-right corners, horizontal edge, vertical edge — their char codes + attr/font; (c) whether the frame is a separate draw or part of the same font as the body. Cross-check by rendering candidate font4/font3 glyph codes against the reference screenshot (the extracted font tile PNGs under `extracted/` if present, or render via the parser). Deliverable: findings JSON with the exact `{ blackFillChar, frameChars: {tl,tr,bl,br,h,v}, attr/font }` + evidence. Parent spot-checks + promotes to §2.
- [ ] Commit findings + §2 promotion.

---

## Task E2: Window-chrome rendering

**Files:** `packages/viewer/src/pages/roster/creation/ega/chrome.ts` (new) + test; modify `ega/windows.ts`.

**Goal:** Render windows as black boxes with gray double-line frames (per E1), replacing the `clearWindow(0x20, attr)` fill that causes ring sprites.

- [ ] `drawWindowChrome(win)`: fill the interior with the E1 black-fill tile, draw the E1 frame tiles around the border. Update `createPersistentWindows`/the screen setup so every persistent + temp window gets proper chrome instead of 0x20-fill.
- [ ] Update the B3 golden snapshot (render-frame test) to the corrected frame; add a chrome unit test (corners/edges/fill cells carry the right char+attr). Verify the rendered frame visually matches the reference (RGBA buffer is non-uniform, has the frame pattern).
- [ ] Full viewer suite green. Commit.

---

## Task E3: Reducer — characterMenu entry + return-to-menu

**Files:** modify `creation/state.ts` + tests.

**Goal:** Add the CHARACTER MENU as the flow's entry, and make creation return to it.

- [ ] Add `'characterMenu'` to `ScreenId` and make `initialCreationState` start there. Add menu events: `{type:'MENU_CREATE'}` → `'name'` (reset draft for a fresh character); `{type:'MENU_EXIT'}` → `'exit'` (new terminal screen meaning "leave to castle"); `{type:'MENU_REVIEW'|'MENU_DELETE'|'MENU_RENAME'|'MENU_PORTRAIT'}` → for now no-op or a `'notImplemented'` marker (stubs; real impls later). On `CONFIRM {keep:true}` → after commit, return to `'characterMenu'` (so the user can make another) — OR keep `'committing'` but have the page, after saving, dispatch back to menu. On `CONFIRM {keep:false}`/`CANCEL` → return to `'characterMenu'` (not `'cancelled'`/navigate-away). Keep a distinct `'exit'` terminal for MENU_EXIT.
- [ ] Tests: starts at characterMenu; MENU_CREATE → name; full create → returns to characterMenu; MENU_EXIT → exit. Update existing state tests for the new entry/terminal behavior.
- [ ] Full suite green. Commit.

---

## Task E4: CharacterMenuScreen component

**Files:** `creation/screens/CharacterMenuScreen.tsx` + test.

**Goal:** The 6-option menu over the window chrome (2 rows × 3 cols per the reference: row1 CREATE PC / DELETE PC / PORTRAIT, row2 REVIEW PC / RENAME PC / EXIT — match the screenshot's exact layout/order), arrow-nav (the §7 grid picker — Left/Right/Up/Down move across the 2×3 grid, Enter selects), dispatching the E3 menu events. Render via the persistent chrome + `CreationCanvas`. Strings via msg.dbs if the IDs are known (the roster-menu strings CREATE PC/REVIEW PC/DELETE/RENAME/PORTRAIT/EXIT — resolve their msg IDs from the §3/Phase-1 roster-picker findings; else render literals as a documented fallback).

- [ ] Failing test: renders the 6 options; arrow nav moves the cursor across the 2×3 grid; Enter on CREATE PC dispatches `MENU_CREATE`; Enter on EXIT dispatches `MENU_EXIT`. 4. Implement (mirror MenuPickerScreen). Pass. Commit.

---

## Task E5: Wire CreationPage at /castle/character-menu, centered; delete /roster/new

**Files:** modify `CreationPage.tsx` (render `'characterMenu'` → CharacterMenuScreen; handle `'exit'` → `navigate('/castle')`; wrap canvas in the shell `.page`/`.canvasWrap`); add a `CreationPage.module.css` (copy CastleScreen's `.page`/`.canvasWrap`); modify `router.tsx` (route `/castle/character-menu` → CreationPage, REMOVE `/roster/new`); modify `RosterView.tsx` (delete the "+ New Character" button); remove the now-orphaned CastleStub branch for character-menu.

- [ ] Render `'characterMenu'` screen in CreationPage's screen switch. On `'exit'` terminal → `navigate('/castle')`. On commit (after addCharacter) → the reducer returns to characterMenu (no navigate). Wrap `CreationCanvas` in `<main className={page}><div className={canvasWrap}>…</div></main>` (copy CastleScreen.module.css's `.page`/`.canvasWrap`). 
- [ ] `router.tsx`: `/castle/character-menu` → `<CreationPage />` (lazy); delete the `/roster/new` route. Ensure `/castle/:stub` no longer catches `character-menu` (explicit route ordering) — or keep CastleStub for the other stubs only.
- [ ] `RosterView.tsx`: remove the "+ New Character" button/link.
- [ ] Update/trim any tests referencing `/roster/new` or the removed button. Build clean (tsc) + full viewer suite green. Commit.

---

## Task E6: Browser verification + wrap-up

- [ ] Start the dev server (`pnpm dev:viewer` or the project's run command) and verify in a browser: MASTER OPTIONS (`/castle`) → Character Menu → the CHARACTER MENU renders as a centered EGA screen with black-framed windows (no ring sprites) + the 6 options; CREATE PC → the name screen appears in the SAME chrome; arrow keys + Enter drive it; a full create returns to the menu; EXIT returns to MASTER OPTIONS. Capture a screenshot. If anything's off, iterate.
- [ ] Update `TODO.md` (#019): Stage E complete; note any deferred items (REVIEW/DELETE/RENAME/PORTRAIT menu actions are stubs; real WPORT portrait pixels still TODO). Commit.

---

## Self-review notes (parent only)
- E1 (chrome RE) is the gating unknown — front-loaded. Everything visual depends on the correct fill+frame tiles.
- "One continuous screen": the reducer owns the screen state incl. `'characterMenu'`; the page just renders the current screen + the persistent chrome. No new route per creation step.
- Deletions (E5): `/roster/new`, RosterView "+New" — confirmed by user. Grep for `/roster/new` references before deleting.
- Browser verify (E6) is REQUIRED — canvas rendering can't be checked in jsdom; the ring-sprite bug proves snapshot-hashes alone didn't catch the visual problem (the golden was computed from the buggy output). E6 must visually confirm against the reference screenshots.
