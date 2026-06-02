/**
 * AddPartyPage — top-level component for the wbase ADD PARTY picker.
 *
 * The picker overlays the MASTER OPTIONS castle scene; we render the castle
 * frame (dragonsc + mon08 + menu options with cursor on ADD PARTY MEMBER)
 * and then composite the picker windows on top, matching the engine which
 * keeps the underlying screen visible behind ui_window_create overlays.
 *
 * Owns:
 *  - useState for cursor index + onCancel flag (two-state cursor matching
 *    findings/wpcmk-roster-picker-input.json)
 *  - useEffect for loading castle assets (mon08, dragonsc, fonts, portraits)
 *    + the picker's MessageDb dependency
 *  - Key handling: arrows/Enter/Escape per the spec key table
 *  - On commit: addMember(rosterChar) then navigate('/castle')
 *  - On cancel: navigate('/castle') with no state change
 *
 * Spec: docs/superpowers/specs/2026-05-28-add-party-member-design.md
 */
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PicSchema,
  WIZ6_MAIN,
  type ActivePartyMember,
  type Font,
  type Font4bpp,
  type MessageDb,
  type Pic,
  type PortraitSet,
} from '@wiz6/data';
import {
  concatenatePicSegments,
  renderEgaScreen,
  renderTileWindow,
  visibleMenuOptions,
  type FontSet,
  type MainMenuContext,
} from '@wiz6/parser';
import {
  loadEgaScreen,
  loadFont,
  loadFont4bpp,
  loadMessageDb as defaultLoadMessageDb,
  loadPortraitSet,
} from '../../data-loader.js';
import { loadCreationFontSet } from '../roster/creation/ega/assets.js';
import { CanvasPresenter } from '../../lib/presenter.js';
import { CanvasStage } from '../../components/CanvasStage.js';
import { readRoster } from '../../lib/roster-store.js';
import {
  readActiveParty,
  addMember,
  availableRosterFor,
} from '../../lib/active-party-store.js';
import { composeCastleFrame } from '../game/castle-frame.js';
import { composeAddPartyPickerFrame } from './compose-add-party-picker-frame.js';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

export interface AddPartyPageProps {
  /** TEST ONLY: Skip async asset loading; the page renders a stub div so
   *  tests can drive key handling and store integration without fetch(). */
  skipAssetLoad?: boolean;
}

export function AddPartyPage({ skipAssetLoad = false }: AddPartyPageProps) {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cursorIdx, setCursorIdx] = useState(0);
  const [onCancel, setOnCancel] = useState(false);

  // Snapshot the available roster + existing active members once on mount.
  // The picker is non-reentrant — no other writer mutates these while open.
  const candidates = useMemo(
    () => availableRosterFor(readRoster().characters, readActiveParty()),
    [],
  );
  const activeMembers = useMemo<ActivePartyMember[]>(
    () => readActiveParty().members,
    [],
  );

  // Castle assets — same as CastleScreen so we can render the underlying scene
  // before overlaying the picker.
  const [mon08Pic, setMon08Pic] = useState<Pic | null>(null);
  const [mon08Decoded, setMon08Decoded] = useState<number[] | null>(null);
  const [dragonscRgba, setDragonscRgba] = useState<Uint8ClampedArray | null>(null);
  const [wfont0, setWfont0] = useState<Font | null>(null);
  const [wfont1, setWfont1] = useState<Font4bpp | null>(null);
  const [wfont3, setWfont3] = useState<Font4bpp | null>(null);
  // All three portrait sets [wport1, wport2, wport3] — composeCastleFrame picks
  // the right set per party member by portraitIndex/14, so a single set would
  // leave members with portraits ≥14 blank.
  const [portraitSets, setPortraitSets] = useState<PortraitSet[]>([]);

  // Picker assets — message db + the wpcmk-creation font set for the overlay.
  // (Picker uses wfont0 for the highlight path; bg-fill cells go through
  // wfont3. The creation font set bundles both.)
  const [pickerFontSet, setPickerFontSet] = useState<FontSet | null>(null);
  const [db, setDb] = useState<MessageDb | null>(null);

  // Empty roster (or all already in the active party): bounce immediately.
  useEffect(() => {
    if (candidates.length === 0) navigate('/castle');
  }, [candidates.length, navigate]);

  // Compute the menu state the engine had when the picker opened: cursor on
  // ADD PARTY MEMBER (slot 0). This matches save/1.sav where the user just
  // selected ADD MEMBER and the highlight bar shows on that row.
  const visible = useMemo(() => {
    const ctx: MainMenuContext = {
      partySize: activeMembers.length,
      pcFileHasUnloadedChars: candidates.length > 0,
    };
    return visibleMenuOptions(ctx).filter((opt) => opt.slot !== 8);
  }, [activeMembers.length, candidates.length]);
  const selectedIdx = useMemo(() => {
    const idx = visible.findIndex((opt) => opt.slot === 0);
    return idx >= 0 ? idx : 0;
  }, [visible]);

  useEffect(() => {
    if (skipAssetLoad) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch('/pics/mon08.json');
        if (!res.ok || cancelled) return;
        const text = await res.text();
        if (text.trimStart().startsWith('<')) return;
        const pic = PicSchema.parse(JSON.parse(text));
        if (cancelled) return;
        setMon08Pic(pic);
        setMon08Decoded(concatenatePicSegments(pic.segments));
      } catch {
        /* leave null */
      }
    })();

    loadEgaScreen('/screens/dragonsc.json')
      .then((screen) => {
        if (!cancelled) setDragonscRgba(renderEgaScreen(screen, WIZ6_MAIN).rgba);
      })
      .catch(() => {});

    loadFont('/fonts/wfont0.json').then((f) => !cancelled && setWfont0(f)).catch(() => {});
    loadFont4bpp('/fonts/wfont1.json').then((f) => !cancelled && setWfont1(f)).catch(() => {});
    loadFont4bpp('/fonts/wfont3.json').then((f) => !cancelled && setWfont3(f)).catch(() => {});
    Promise.all([
      loadPortraitSet('/portraits/wport1.json'),
      loadPortraitSet('/portraits/wport2.json'),
      loadPortraitSet('/portraits/wport3.json'),
    ])
      .then((sets) => !cancelled && setPortraitSets(sets))
      .catch((err) => console.warn('failed to load portrait sets', err));

    void (async () => {
      try {
        const [fs, m] = await Promise.all([
          loadCreationFontSet(),
          defaultLoadMessageDb('/messages/msg.json'),
        ]);
        if (!cancelled) {
          setPickerFontSet(fs);
          setDb(m);
        }
      } catch (err: unknown) {
        if (!cancelled) console.error('[AddPartyPage] picker asset load failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [skipAssetLoad]);

  const handleCommit = useCallback(() => {
    if (onCancel || candidates.length === 0) {
      navigate('/castle');
      return;
    }
    const picked = candidates[cursorIdx];
    if (picked) addMember(picked);
    navigate('/castle');
  }, [onCancel, candidates, cursorIdx, navigate]);

  const handleCancel = useCallback(() => {
    navigate('/castle');
  }, [navigate]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      switch (e.key) {
        case 'Escape':
          handleCancel();
          break;
        case 'Enter':
          handleCommit();
          break;
        case 'ArrowUp':
          setOnCancel(true);
          break;
        case 'ArrowDown':
          setOnCancel(false);
          break;
        case 'ArrowLeft':
          if (onCancel) setOnCancel(false);
          else setCursorIdx((c) => Math.max(0, c - 1));
          break;
        case 'ArrowRight':
          if (onCancel) setOnCancel(false);
          else setCursorIdx((c) => Math.min(candidates.length - 1, c + 1));
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, candidates.length, handleCommit, handleCancel]);

  // Paint loop: compose the castle frame, overlay picker windows, putImageData.
  // Static (no RAF) — picker doesn't animate and there's no parity flip while
  // a picker is open in the engine.
  useEffect(() => {
    if (skipAssetLoad) return;
    if (!pickerFontSet || !db) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const presenter = new CanvasPresenter(canvas);

    const buf = composeCastleFrame(
      0, // parity 0 — picker is opened on a single rendered frame
      dragonscRgba,
      mon08Pic,
      mon08Decoded,
      wfont3,
      wfont0,
      visible,
      selectedIdx,
      wfont1,
      activeMembers,
      portraitSets,
    );

    const pickerWindows = composeAddPartyPickerFrame(
      { candidates, cursorIdx, onCancel },
      db,
    );
    for (const win of pickerWindows) {
      renderTileWindow(win, buf, ENGINE_W, ENGINE_H, pickerFontSet, WIZ6_MAIN);
    }

    presenter.present(buf, ENGINE_W, ENGINE_H);
  }, [
    skipAssetLoad,
    pickerFontSet,
    db,
    dragonscRgba,
    mon08Pic,
    mon08Decoded,
    wfont3,
    wfont0,
    wfont1,
    visible,
    selectedIdx,
    activeMembers,
    portraitSets,
    candidates,
    cursorIdx,
    onCancel,
  ]);

  if (skipAssetLoad) return <div data-testid="add-party-stub" />;
  if (!pickerFontSet || !db) return <div>Loading…</div>;

  return (
    <CanvasStage label="Wizardry VI add party member picker">
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
        aria-label="Wizardry VI add party member picker"
      />
    </CanvasStage>
  );
}
