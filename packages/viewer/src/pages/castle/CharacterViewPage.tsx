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
  WichmannHill,
  type ActivePartyMember,
  type MessageDb,
  type PortraitSet,
} from '@wiz6/data';
import { renderTileWindow, type FontSet } from '@wiz6/parser';
import {
  loadMessageDb as defaultLoadMessageDb,
  loadPortraitSet as defaultLoadPortraitSet,
} from '../../data-loader.js';
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
import {
  reduceCharacterView,
  type CharacterViewState,
  type CharacterViewEvent,
  type EditEnableFlags,
} from './character-view-reducer.js';
import type { TileWindow } from '@wiz6/parser';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

// Camp action menu entry sets — base (engine-faithful) vs editPlus (house rule).
// Task 13 will thread this through composeCharacterViewFrame; for Task 12 the
// list lives here so the reducer can drive cursor navigation correctly.
const CAMP_ENTRIES_BASE: ReadonlyArray<string> = ['EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EXIT'];
const CAMP_ENTRIES_WITH_EDIT: ReadonlyArray<string> = [
  'EQUIP', 'SPELL', 'ASSAY', 'SWAG', 'SKILL', 'EDIT', 'EXIT',
];

// All EDIT-submenu options are enabled in v1; future revisions may gate
// per-action (e.g. profession change only on a particular game flag).
const EDIT_FLAGS: EditEnableFlags = { rename: true, portrait: true, profession: true };

function campEntriesFor(includeEdit: boolean): ReadonlyArray<string> {
  return includeEdit ? CAMP_ENTRIES_WITH_EDIT : CAMP_ENTRIES_BASE;
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

  // House rule read once on mount — toggling via /settings while this page is
  // mounted won't retro-update the action menu, which is acceptable since
  // navigating in or out of the page reloads it.
  const includeEditFromCamp = useMemo(() => getHouseRules().allowEditFromCamp, []);

  const [members, setMembers] = useState<ActivePartyMember[]>(() => readActiveParty().members);

  const validSlot = Number.isFinite(slotIdx) && slotIdx >= 0 && slotIdx < members.length;
  const member = validSlot ? members[slotIdx] ?? null : null;

  const [state, setState] = useState<CharacterViewState>(() => ({
    kind: 'action-menu',
    cursorIdx: 0,
    campEntries: campEntriesFor(includeEditFromCamp),
  }));

  useEffect(() => {
    if (!validSlot) navigate('/castle');
  }, [validSlot, navigate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [fs, m, w1, w2, w3] = await Promise.all([
          loadCreationFontSet(),
          defaultLoadMessageDb('/messages/msg.json'),
          defaultLoadPortraitSet('/portraits/wport1.json'),
          defaultLoadPortraitSet('/portraits/wport2.json'),
          defaultLoadPortraitSet('/portraits/wport3.json'),
        ]);
        if (cancelled) return;
        setFontSet(fs);
        setDb(m);
        setPortraits([w1, w2, w3]);
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
      const next = reduceCharacterView(state, ev, EDIT_FLAGS);

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
        setState({
          kind: 'action-menu',
          cursorIdx: 0,
          campEntries: campEntriesFor(includeEditFromCamp),
        });
        return;
      }

      // ---- Presentational re-hydration of list fields ---------------------
      // The reducer is pure — it emits intermediate states with empty lists
      // (campEntries: [], eligible: []) because it cannot read the house rule
      // or compute eligibility from member attributes. The page hydrates
      // those fields here on transition.

      if (next.kind === 'action-menu') {
        setState({
          ...next,
          campEntries: campEntriesFor(includeEditFromCamp),
        });
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
    if (!validSlot || !fontSet || !db || !portraits || !member) return;
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

    const baseWindows = composeCharacterViewFrame({
      members,
      currentSlot: slotIdx,
      // Base action-menu cursor only matters when state is action-menu; when
      // an overlay is up the bottom strip is covered (or its cursor is moot).
      cursorIdx: state.kind === 'action-menu' ? state.cursorIdx : 0,
      db,
      includeEditFromCamp,
    });

    const overlays: TileWindow[] = [];
    if (state.kind === 'edit-submenu') {
      overlays.push(composeEditSubmenu({ cursorIdx: state.cursorIdx, db }));
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
    }

    const windows = [...baseWindows, ...overlays];
    const buf = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
    buf.fill(0);
    for (const w of windows) {
      renderTileWindow(w, buf, ENGINE_W, ENGINE_H, fontSetWithPortrait, WIZ6_MAIN);
    }
    presenter.present(buf, ENGINE_W, ENGINE_H);
  }, [validSlot, fontSet, db, portraits, members, slotIdx, state, member]);

  if (!validSlot) return null;
  if (!fontSet || !db || !portraits) return <div>Loading…</div>;

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
