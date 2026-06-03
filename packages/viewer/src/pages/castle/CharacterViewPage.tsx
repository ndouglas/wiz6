/**
 * CharacterViewPage — WPCVW state-0x11 character view.
 *
 * Drives the WPCVW EDIT submenu state machine via the pure reducer in
 * character-view-reducer.ts. Reads :slotIdx from the route, renders the
 * 3-window WPCVW layout via composeCharacterViewFrame, layers EDIT
 * sub-screen overlays (submenu / rename / portrait / class picker /
 * profession confirm) on top per the current reducer state, and resolves
 * intent states (commit-rename, commit-portrait, commit-class-change,
 * exit-castle) by performing the appropriate side effect (active-party
 * store write + navigate).
 *
 * Spec: docs/superpowers/specs/2026-05-29-wpcvw-edit-submenu-design.md
 * Plan: docs/superpowers/plans/2026-05-29-wpcvw-edit-submenu.md (Task 12)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  WIZ6_MAIN,
  applyClassChange,
  eligibleClasses,
  equipCandidates,
  applyEquipSelections,
  assayItem,
  skillViewerRows,
  carriedItems,
  bagItems,
  canSwagAdd,
  canSwagRemove,
  canSwagDrop,
  swagAdd,
  swagRemove,
  swagDrop,
  swagItemAddable,
  swagItemDroppable,
  knownSpellsBySchool,
  WichmannHill,
  resolveCarryCapacityMax,
  type ActivePartyMember,
  type MessageDb,
  type PortraitSet,
  type ScenarioDb,
} from '@wiz6/data';
import { renderTileWindow, type FontSet } from '@wiz6/parser';
import {
  loadMessageDb as defaultLoadMessageDb,
  loadPortraitSet as defaultLoadPortraitSet,
  loadScenarioDb as defaultLoadScenarioDb,
} from '../../data-loader.js';
import { buildInventoryItems, scenarioItemName, itemIconGlyph } from './item-display.js';
import { loadCreationFontSet } from '../roster/creation/ega/assets.js';
import { patchFontSetWithPortrait } from '../roster/creation/ega/skill-train-frame.js';
import { readActiveParty, updateActiveMember } from '../../lib/active-party-store.js';
import { getHouseRules } from '../../lib/house-rules-store.js';
import { CanvasPresenter } from '../../lib/presenter.js';
import { CanvasStage } from '../../components/CanvasStage.js';
import { composeCharacterViewFrame } from './compose-character-view-frame.js';
import { composeEditSubmenu } from './compose-edit-submenu.js';
import { composeRenamePrompt } from './compose-rename-prompt.js';
import { composePortraitChange } from './compose-portrait-change.js';
import { composeClassPicker } from './compose-class-picker.js';
import { composeProfessionConfirm } from './compose-profession-confirm.js';
import { composeEquipPicker } from './compose-equip-picker.js';
import { composeInventoryPicker } from './compose-inventory-picker.js';
import { composeAssayDisplay } from './compose-assay-display.js';
import { composeSkillViewer } from './compose-skill-viewer.js';
import { composeSwagBag } from './compose-swag-bag.js';
import { composeSpellbookFrame } from './compose-spellbook.js';
import { skillName } from '../roster/creation/messages.js';
import {
  reduceCharacterView,
  skillTabEntries,
  type CharacterViewState,
  type CharacterViewEvent,
  type EditEnableFlags,
  type EquipInfo,
  type AssayInfo,
  type SkillInfo,
  type SwagInfo,
  type SwagAction,
  type SpellInfo,
} from './character-view-reducer.js';
import type { TileWindow } from '@wiz6/parser';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

// All EDIT-submenu options are enabled in v1; future revisions may gate
// per-action (e.g. profession change only on a particular game flag).
const EDIT_FLAGS: EditEnableFlags = { rename: true, portrait: true, profession: true };

// Camp action-menu entry labels. MUST mirror compose-action-menu's enabledActions
// order so the reducer cursorIdx aligns with the rendered grid. REVIEW appears only
// with 2+ members (engine: party_size<2 disables it); EDIT is the house rule.
function campEntriesFor(includeEdit: boolean, includeReview: boolean): ReadonlyArray<string> {
  const out = ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL'];
  if (includeReview) out.push('REVIEW');
  if (includeEdit) out.push('EDIT');
  out.push('EXIT');
  return out;
}

/**
 * Single ordered scan of a member's inventory for carried items (itemId > 0),
 * producing BOTH the reducer's `carried` (inventory indices) and the picker's
 * `items` ({name}) in the SAME order. The contract the reducer relies on:
 * carried[cursor] is the inventory index of items[cursor].
 */
function scanCarried(
  member: ActivePartyMember,
  scenarioDb: ScenarioDb,
): { carried: number[]; items: { name: string }[] } {
  const carried: number[] = [];
  const items: { name: string }[] = [];
  const inv = member.inventory ?? [];
  // Only the carried region (slots 0..9) — slots 10..21 are the SWAG BAG and
  // must not surface in the ASSAY/USE/DROP carried-item pickers.
  const carriedSlots = Math.min(inv.length, 10);
  for (let i = 0; i < carriedSlots; i++) {
    const slot = inv[i];
    if (slot && slot.itemId > 0) {
      carried.push(i);
      items.push({ name: scenarioItemName(scenarioDb, slot.itemId) });
    }
  }
  return { carried, items };
}

/** SwagInfo for the reducer: the enabled menu actions (+EXIT) and the carried /
 *  bag item index lists in picker order. Derived from the @wiz6/data SWAG
 *  helpers (which read the carried/bag split of the 22-slot inventory). */
function buildSwagInfo(member: ActivePartyMember): SwagInfo {
  const visibleMenu: SwagAction[] = [];
  if (canSwagAdd(member)) visibleMenu.push('ADD');
  if (canSwagRemove(member)) visibleMenu.push('REMOVE');
  if (canSwagDrop(member)) visibleMenu.push('DROP');
  visibleMenu.push('EXIT');
  return {
    visibleMenu,
    carried: carriedItems(member).map((s) => s.idx),
    bag: bagItems(member).map((s) => s.idx),
  };
}

function eventFromKey(e: KeyboardEvent): CharacterViewEvent | null {
  switch (e.key) {
    case 'ArrowUp': return { type: 'ARROW_UP' };
    case 'ArrowDown': return { type: 'ARROW_DOWN' };
    case 'ArrowLeft': return { type: 'ARROW_LEFT' };
    case 'ArrowRight': return { type: 'ARROW_RIGHT' };
    case 'Enter': return { type: 'ENTER' };
    case 'Escape': return { type: 'ESCAPE' };
    case 'Backspace': return { type: 'BACKSPACE' };
    default:
      if (e.key.length === 1) return { type: 'TYPE', key: e.key };
      return null;
  }
}

export function CharacterViewPage() {
  const navigate = useNavigate();
  const { slotIdx: slotIdxParam } = useParams<{ slotIdx: string }>();
  const slotIdx = Number(slotIdxParam);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fontSet, setFontSet] = useState<FontSet | null>(null);
  const [db, setDb] = useState<MessageDb | null>(null);
  const [portraits, setPortraits] = useState<PortraitSet[] | null>(null);
  const [scenarioDb, setScenarioDb] = useState<ScenarioDb | null>(null);

  // House rule read once on mount — toggling via /settings while this page is
  // mounted won't retro-update the action menu, which is acceptable since
  // navigating in or out of the page reloads it.
  const includeEditFromCamp = useMemo(() => getHouseRules().allowEditFromCamp, []);

  const [members, setMembers] = useState<ActivePartyMember[]>(() => readActiveParty().members);

  const validSlot = Number.isFinite(slotIdx) && slotIdx >= 0 && slotIdx < members.length;
  const member = validSlot ? members[slotIdx] ?? null : null;

  const [state, setState] = useState<CharacterViewState>(() => {
    const entries = campEntriesFor(includeEditFromCamp, members.length >= 2);
    return { kind: 'action-menu', cursorIdx: entries.length - 1, campEntries: entries };
  });

  useEffect(() => {
    if (!validSlot) navigate('/castle');
  }, [validSlot, navigate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [fs, m, w1, w2, w3, sc] = await Promise.all([
          loadCreationFontSet(),
          defaultLoadMessageDb('/messages/msg.json'),
          defaultLoadPortraitSet('/portraits/wport1.json'),
          defaultLoadPortraitSet('/portraits/wport2.json'),
          defaultLoadPortraitSet('/portraits/wport3.json'),
          defaultLoadScenarioDb('/scenario/scenario.json'),
        ]);
        if (cancelled) return;
        setFontSet(fs);
        setDb(m);
        setPortraits([w1, w2, w3]);
        setScenarioDb(sc);
      } catch (err: unknown) {
        if (!cancelled) console.error('[CharacterViewPage] asset load failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const ev = eventFromKey(e);
      if (!ev) return;
      e.preventDefault();
      // EQUIP wizard needs candidate info the reducer can't compute purely:
      // the eligible inventory indices for a body slot given the selections so
      // far. Build the closure from the current member + scenarioDb.
      const equipInfo: EquipInfo | undefined =
        member && scenarioDb
          ? { candidatesFor: (slot, sel) => equipCandidates(member, slot, scenarioDb, sel) }
          : undefined;
      // ASSAY picker needs the carried-item inventory indices in picker display
      // order — the reducer can't scan inventory purely. Built from the SAME
      // ordered scan that feeds composeInventoryPicker's items (see scanCarried),
      // so carried[cursor] ↔ items[cursor].
      const assayInfo: AssayInfo | undefined =
        member && scenarioDb ? { carried: scanCarried(member, scenarioDb).carried } : undefined;
      // SKILL viewer: the dynamic tab picker hides PERSONAL unless the member has
      // a personal skill (slots 17..21 level > 0). The reducer can't read skills.
      const skillInfo: SkillInfo | undefined = member
        ? { hasPersonalSkills: (member.skills ?? []).slice(17, 22).some((v) => v > 0) }
        : undefined;
      // SWAG manager: the enabled menu + carried/bag index lists.
      const swagInfo: SwagInfo | undefined = member ? buildSwagInfo(member) : undefined;
      // SPELL viewer: the per-school known-spell counts (for sublist clamping).
      // The reducer can't read the member's known-spell bitset purely.
      const spellInfo: SpellInfo | undefined = member
        ? { countBySchool: knownSpellsBySchool(member).map((l) => l.length) }
        : undefined;
      const next = reduceCharacterView(
        state,
        ev,
        EDIT_FLAGS,
        equipInfo,
        assayInfo,
        skillInfo,
        swagInfo,
        spellInfo,
      );

      // ---- Resolve intent states (side effects) ----------------------------
      if (next.kind === 'exit-castle') {
        navigate('/castle');
        return;
      }
      if (next.kind === 'review-pick') {
        // REVIEW: re-open the "REVIEW WHO?" party-member picker to view another
        // member (engine wpcvw action 10). ReviewMemberPage's picker commits to
        // /castle/review-member/:slotIdx — i.e. this same char-view for the pick.
        navigate('/castle/review-member');
        return;
      }
      if (next.kind === 'commit-rename') {
        updateActiveMember(slotIdx, { name: next.name });
        setMembers(readActiveParty().members);
        setState({ kind: 'edit-submenu', cursorIdx: 0 });
        return;
      }
      if (next.kind === 'commit-portrait') {
        updateActiveMember(slotIdx, { portraitIndex: next.portraitIndex });
        setMembers(readActiveParty().members);
        setState({ kind: 'edit-submenu', cursorIdx: 1 });
        return;
      }
      if (next.kind === 'commit-class-change') {
        const m = members[slotIdx];
        if (m) {
          // Per-call random seed so multiple class changes produce different rolls.
          // The engine uses a deterministic RNG state that survives across sessions;
          // matching that exactly is unnecessary for a QoL-toggled flow. Seeds must
          // be positive nonzero (WichmannHill default range is large).
          const rng = new WichmannHill(
            Math.floor(Math.random() * 30000) + 1,
            Math.floor(Math.random() * 30000) + 1,
            Math.floor(Math.random() * 30000) + 1,
          );
          const changed = applyClassChange(rng, m, next.newClassId);
          updateActiveMember(slotIdx, changed);
          setMembers(readActiveParty().members);
        }
        {
          const entries = campEntriesFor(includeEditFromCamp, members.length >= 2);
          setState({ kind: 'action-menu', cursorIdx: entries.length - 1, campEntries: entries });
        }
        return;
      }
      if (next.kind === 'commit-equip') {
        const m = members[slotIdx];
        if (m && scenarioDb) {
          const updated = applyEquipSelections(m, next.selections, scenarioDb);
          updateActiveMember(slotIdx, updated);
          setMembers(readActiveParty().members);
        }
        // Back to the action menu with the cursor on EXIT (view-open default).
        const entries = campEntriesFor(includeEditFromCamp, members.length >= 2);
        setState({ kind: 'action-menu', cursorIdx: entries.length - 1, campEntries: entries });
        return;
      }

      // ---- SWAG commits: mutate the carried/bag inventory, then re-render the
      //      SWAG menu (cursor on EXIT). The engine beeps + no-ops on a refused
      //      ADD (equipped) / DROP (class-locked); we replicate the no-op
      //      (TODO: wire the reject sound — see #034 Stage 6).
      const returnToSwagMenu = (updatedMember: ActivePartyMember | undefined): void => {
        const info = updatedMember ? buildSwagInfo(updatedMember) : undefined;
        setState({ kind: 'swag-menu', cursor: info ? Math.max(0, info.visibleMenu.length - 1) : 0 });
      };
      if (next.kind === 'commit-swag-add') {
        const m = members[slotIdx];
        let updated = m;
        if (m) {
          const item = (m.inventory ?? [])[next.carriedIdx];
          if (item && swagItemAddable(item)) {
            updated = swagAdd(m, next.carriedIdx) as ActivePartyMember;
            updateActiveMember(slotIdx, updated);
            setMembers(readActiveParty().members);
          }
        }
        returnToSwagMenu(updated);
        return;
      }
      if (next.kind === 'commit-swag-remove') {
        const m = members[slotIdx];
        let updated = m;
        if (m) {
          updated = swagRemove(m, next.bagIdx) as ActivePartyMember;
          updateActiveMember(slotIdx, updated);
          setMembers(readActiveParty().members);
        }
        returnToSwagMenu(updated);
        return;
      }
      if (next.kind === 'commit-swag-drop') {
        const m = members[slotIdx];
        let updated = m;
        if (m) {
          const item = (m.inventory ?? [])[10 + next.bagIdx];
          if (item && swagItemDroppable(item)) {
            updated = swagDrop(m, next.bagIdx) as ActivePartyMember;
            updateActiveMember(slotIdx, updated);
            setMembers(readActiveParty().members);
          }
        }
        returnToSwagMenu(updated);
        return;
      }

      // ---- Presentational re-hydration of list fields ---------------------
      // The reducer is pure — it emits intermediate states with empty lists
      // (campEntries: [], eligible: []) because it cannot read the house rule
      // or compute eligibility from member attributes. The page hydrates
      // those fields here on transition.

      if (next.kind === 'action-menu') {
        const entries = campEntriesFor(includeEditFromCamp, members.length >= 2);
        // Two distinct cases:
        //  - In-menu cursor movement (state was ALREADY action-menu): preserve
        //    the reducer's new cursorIdx — it computed the arrow-key move. Only
        //    re-attach campEntries (the reducer can't read the house rule).
        //  - RETURNING to the menu from a submenu (state was NOT action-menu):
        //    land the cursor on EXIT, matching the engine's view-open default.
        const cursorIdx =
          state.kind === 'action-menu' ? next.cursorIdx : entries.length - 1;
        setState({ ...next, cursorIdx, campEntries: entries });
        return;
      }

      if (next.kind === 'profession-picker') {
        const cur = members[slotIdx];
        const list = cur ? eligibleClasses(cur.attributes) : [];
        setState({ ...next, eligible: list });
        return;
      }

      // Entering the portrait sub-screen from the EDIT submenu: seed
      // previewIdx + originalIdx with the member's current portrait so the
      // initial render shows their actual face and ESC-without-change is a
      // no-op (reducer compares previewIdx === originalIdx).
      if (
        next.kind === 'portrait'
        && state.kind === 'edit-submenu'
        && member
      ) {
        const cur = member.portraitIndex ?? 0;
        setState({ kind: 'portrait', previewIdx: cur, originalIdx: cur });
        return;
      }

      setState(next);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, slotIdx, members, member, navigate, includeEditFromCamp]);

  useEffect(() => {
    if (!validSlot || !fontSet || !db || !portraits || !scenarioDb || !member) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const presenter = new CanvasPresenter(canvas);

    // For the portrait sub-screen, patch wfont2 with the previewed portrait
    // so the rendered face updates live as the user scrolls L/R.
    const portraitToShow =
      state.kind === 'portrait' ? state.previewIdx : (member.portraitIndex ?? 0);
    const fontSetWithPortrait = patchFontSetWithPortrait(fontSet, portraits, portraitToShow);

    // Header age fields (next to the portrait): row 2 = age in years
    // (record age_counter is in game-DAYS → /365), row 3 = the engine's
    // "secondAge" counter, which is 1 for every finalised character (it is
    // not a persisted record field; creation sets it to 1).
    const age = {
      years: Math.floor((member.age ?? 0) / 365),
      second: 1,
    };
    // Carrying capacity: record +0x20/+0x22 are tenths of a pound → /10 for the
    // on-screen value. resolveCarryCapacityMax honors the recomputeCarryCapacity
    // house rule (ON → derive from current STR/VIT; OFF → frozen-at-creation,
    // the engine bug) and recomputes on every read.
    const carryMax = resolveCarryCapacityMax(member, getHouseRules().recomputeCarryCapacity);
    const cc = {
      current: Math.floor((member.encumbranceCurrent ?? 0) / 10),
      max: Math.floor(carryMax / 10),
    };

    const baseWindows = composeCharacterViewFrame({
      members,
      currentSlot: slotIdx,
      // Base action-menu cursor only matters when state is action-menu; when
      // an overlay is up the bottom strip is covered (or its cursor is moot).
      cursorIdx: state.kind === 'action-menu' ? state.cursorIdx : 0,
      db,
      includeEditFromCamp,
      age,
      cc,
      inventory: member ? buildInventoryItems(member, scenarioDb) : [],
    });

    const overlays: TileWindow[] = [];
    if (state.kind === 'edit-submenu') {
      // Replace the bottom-strip action menu with the EDIT submenu.
      baseWindows[1] = composeEditSubmenu({ cursorIdx: state.cursorIdx, db });
    } else if (state.kind === 'rename') {
      overlays.push(composeRenamePrompt({ buffer: state.buffer, db }));
    } else if (state.kind === 'portrait') {
      overlays.push(composePortraitChange({ previewIdx: state.previewIdx, db }));
    } else if (state.kind === 'profession-picker') {
      overlays.push(
        composeClassPicker({
          cursorIdx: state.cursorIdx,
          eligibleClasses: state.eligible,
          db,
        }),
      );
    } else if (state.kind === 'profession-confirm') {
      overlays.push(composeProfessionConfirm({ cursorYes: state.cursorYes }));
    } else if (state.kind === 'equip-wizard' && member) {
      // EQUIP wizard: repaint the inventory rows with per-item markers (✓
      // equipped / ▸ candidate / box cursor) + the slot prompt bar (replacing
      // the action-menu strip). The cursor starts on NONE; it cycles onto the
      // candidates with up/down. RE: wpcvw-equip-ux-correction.json.
      const candidateIdxs = equipCandidates(member, state.slot, scenarioDb, state.selections);
      const candidateSet = new Set(candidateIdxs);
      const equippedSet = new Set(state.selections.filter((x): x is number => x != null));
      const cursorInvIdx =
        state.cursor < candidateIdxs.length ? candidateIdxs[state.cursor] : null;
      const inv = member.inventory ?? [];
      const rows: { name: string; state: 'equipped' | 'candidate' | 'normal'; cursored: boolean }[] = [];
      // Carried region only (slots 0..9), in display order — aligned with the
      // composeMainPanel inventory list.
      for (let i = 0; i < Math.min(inv.length, 10); i++) {
        const it = inv[i];
        if (!it || it.itemId <= 0) continue;
        const rowState = equippedSet.has(i) ? 'equipped' : candidateSet.has(i) ? 'candidate' : 'normal';
        rows.push({
          name: scenarioItemName(scenarioDb, it.itemId),
          state: rowState,
          cursored: i === cursorInvIdx,
        });
      }
      overlays.push(
        ...composeEquipPicker({
          db,
          bodySlot: state.slot,
          rows,
          cursorOnNone: state.cursor >= candidateIdxs.length,
        }),
      );
    } else if (state.kind === 'assay-picker' && member) {
      // ASSAY picker: overlay the carried-item picker (prompt bar replaces the
      // action-menu strip + row-cursor highlight) on the char sheet. Items come
      // from the SAME ordered scan as the reducer's `carried` (scanCarried), so
      // the cursor lines up with what the reducer translates on ENTER.
      const { items } = scanCarried(member, scenarioDb);
      overlays.push(
        ...composeInventoryPicker({
          prompt: 'ASSAY WHICH ITEM?',
          items,
          cursor: state.cursor,
        }),
      );
    } else if (state.kind === 'assay-display' && member) {
      // ASSAY inspect popup: read-only stat block for the picked inventory item,
      // over the char sheet, with a "PRESS ↵ TO EXIT" strip replacing the menu.
      const item = (member.inventory ?? [])[state.itemIdx];
      if (item) {
        overlays.push(
          ...composeAssayDisplay({
            descriptor: assayItem(item.itemId, member, scenarioDb),
          }),
        );
      }
    } else if (state.kind === 'skill-viewer' && member) {
      // Read-only SKILL viewer: the skill panel (right half) + the dynamic
      // category-tab picker strip, over the char sheet. Rows from skillViewerRows
      // (visible iff class-can-train OR level>0); names via the message DB.
      const hasPersonalSkills = (member.skills ?? []).slice(17, 22).some((v) => v > 0);
      const rows = skillViewerRows(member, state.category).map((r) => ({
        slot: r.slot,
        name: skillName(db, r.slot) || r.name,
        level: r.level,
      }));
      overlays.push(
        ...composeSkillViewer({
          category: state.category,
          rows,
          // Skill-points (+0x1a8) is not yet surfaced on ActivePartyMember; it is
          // 0 for the stock party. TODO #032 Stage 3: add the schema field.
          skillPoints: 0,
          tabEntries: skillTabEntries(state.category, hasPersonalSkills),
          cursor: state.cursor,
          db,
        }),
      );
    } else if (state.kind === 'swag-menu' && member) {
      // SWAG BAG manager: the popup (bag list) + the dynamic ADD/REMOVE/DROP/EXIT
      // menu strip. Bag items resolve name + icon via the scenario DB.
      const bag = bagItems(member).map((s) => ({
        name: scenarioItemName(scenarioDb, s.item.itemId),
        icon: itemIconGlyph(s.item.spriteIdx),
      }));
      overlays.push(
        ...composeSwagBag({
          bagItems: bag,
          menu: [
            { label: 'ADD', enabled: canSwagAdd(member) },
            { label: 'REMOVE', enabled: canSwagRemove(member) },
            { label: 'DROP', enabled: canSwagDrop(member) },
            { label: 'EXIT', enabled: true },
          ],
          cursor: state.cursor,
        }),
      );
    } else if (state.kind === 'swag-add-picker' && member) {
      // ADD: pick a CARRIED item (same scan/order as the reducer's swag.carried).
      const items = carriedItems(member).map((s) => ({ name: scenarioItemName(scenarioDb, s.item.itemId) }));
      overlays.push(
        ...composeInventoryPicker({ prompt: 'PUT WHICH ITEM IN SWAG BAG?', items, cursor: state.cursor }),
      );
    } else if ((state.kind === 'swag-remove-picker' || state.kind === 'swag-drop-picker') && member) {
      // REMOVE / DROP: pick a BAG item (same order as the reducer's swag.bag).
      const items = bagItems(member).map((s) => ({ name: scenarioItemName(scenarioDb, s.item.itemId) }));
      const prompt = state.kind === 'swag-remove-picker' ? 'REMOVE WHICH ITEM?' : 'DROP WHICH ITEM?';
      overlays.push(...composeInventoryPicker({ prompt, items, cursor: state.cursor }));
    }

    // SPELL viewer (read-only): a FULL-SCREEN frame, not an overlay — the
    // spellbook composer paints its own char-sheet main panel + bottom prompt
    // bar + spell panel, so it REPLACES the base char-view windows entirely
    // (same as the creation spell picker). Pixel-gated by Stage 2's parity test.
    const spellWindows =
      (state.kind === 'spell-grid' || state.kind === 'spell-sublist') && member
        ? composeSpellbookFrame({
            member,
            db,
            school: state.school,
            mode: state.kind === 'spell-sublist' ? 'sublist' : 'grid',
            spellIdx: state.kind === 'spell-sublist' ? state.spellIdx : 0,
            inventory: buildInventoryItems(member, scenarioDb),
            cc,
            age,
          })
        : null;

    const windows = spellWindows ?? [...baseWindows, ...overlays];
    const buf = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
    buf.fill(0);
    for (const w of windows) {
      renderTileWindow(w, buf, ENGINE_W, ENGINE_H, fontSetWithPortrait, WIZ6_MAIN);
    }
    presenter.present(buf, ENGINE_W, ENGINE_H);
  }, [validSlot, fontSet, db, portraits, scenarioDb, members, slotIdx, state, member]);

  if (!validSlot) return null;
  if (!fontSet || !db || !portraits || !scenarioDb) return <div>Loading…</div>;

  return (
    <CanvasStage label="Wizardry VI character view">
      <canvas
        ref={canvasRef}
        width={ENGINE_W}
        height={ENGINE_H}
        style={{
          width: ENGINE_W * SCALE,
          height: ENGINE_H * SCALE,
          imageRendering: 'pixelated',
          background: '#000',
        }}
        aria-label="Wizardry VI character view"
      />
    </CanvasStage>
  );
}
