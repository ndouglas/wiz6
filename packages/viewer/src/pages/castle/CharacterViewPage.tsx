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
import { buildInventoryItems, scenarioItemName } from './item-display.js';
import { loadCreationFontSet } from '../roster/creation/ega/assets.js';
import { patchFontSetWithPortrait } from '../roster/creation/ega/skill-train-frame.js';
import { readActiveParty, updateActiveMember } from '../../lib/active-party-store.js';
import { getHouseRules } from '../../lib/house-rules-store.js';
import { CanvasPresenter } from '../../lib/presenter.js';
import { composeCharacterViewFrame } from './compose-character-view-frame.js';
import { composeEditSubmenu } from './compose-edit-submenu.js';
import { composeRenamePrompt } from './compose-rename-prompt.js';
import { composePortraitChange } from './compose-portrait-change.js';
import { composeClassPicker } from './compose-class-picker.js';
import { composeProfessionConfirm } from './compose-profession-confirm.js';
import { composeEquipPicker } from './compose-equip-picker.js';
import {
  reduceCharacterView,
  type CharacterViewState,
  type CharacterViewEvent,
  type EditEnableFlags,
  type EquipInfo,
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
      const next = reduceCharacterView(state, ev, EDIT_FLAGS, equipInfo);

      // ---- Resolve intent states (side effects) ----------------------------
      if (next.kind === 'exit-castle') {
        navigate('/castle');
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
      // EQUIP wizard: overlay the candidate-row highlight + slot prompt bar on
      // top of the character sheet (the prompt bar REPLACES the action-menu
      // strip, like the EDIT submenu). Candidates resolved to display names so
      // the mounted render mirrors renderEquipSlot0 (cursor 0, selection NONE
      // on slot entry).
      const candidateIdxs = equipCandidates(member, state.slot, scenarioDb, state.selections);
      const candidates = candidateIdxs.map((i) => ({
        name: scenarioItemName(scenarioDb, (member.inventory ?? [])[i]?.itemId ?? 0),
      }));
      overlays.push(
        ...composeEquipPicker({
          db,
          bodySlot: state.slot,
          candidates,
          cursor: state.cursor,
          // Committed selection is independent of the row-cursor. In this
          // wizard a slot's selection isn't committed until ENTER (which then
          // advances to the next slot), so while a slot is on screen nothing is
          // yet committed → the prompt tail always shows NONE. This matches the
          // committed `equip-slot0` fixture (cursor 0 on LONGSWORD, prompt NONE).
          // (Only that slot-0 initial frame is pixel-pinned; see report note.)
          selection: null,
        }),
      );
    }

    const windows = [...baseWindows, ...overlays];
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
    <main>
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
    </main>
  );
}
