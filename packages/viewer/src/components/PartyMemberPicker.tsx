/**
 * PartyMemberPicker — shared picker for the active party. Used by
 * DismissMemberPage and ReviewMemberPage. Mirrors wbase_pick_party_member
 * @ wbase.ovr 0x26c7.
 *
 * Engine refs: docs/re/findings/wbase-party-pickers-and-dismiss.json
 * findings picker-input-loop-keymap, picker-grid-layout-and-coordinate-math,
 * picker-highlight-render-on-current-cursor.
 *
 * Cursor model (verified via live DOSBox capture):
 *   A single integer `cursor`:
 *     -1     → EXIT (the cancel word in the banner is highlighted)
 *     0..N-1 → that member is highlighted
 *   Cursor STARTS on EXIT (-1).
 *
 * The picker overlays the live castle scene (gate / fountain / party
 * portraits) — it does NOT render on a black background. We compose the
 * castle frame via composeCastleFrame() and then overlay the picker windows,
 * matching AddPartyPage.
 *
 * Single-member shortcut (engine `party_size < 2` bypass) is NOT handled
 * here — the caller (page) checks `members.length < 2` and bypasses the
 * picker before mounting. This component assumes >= 1 member.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PicSchema,
  WIZ6_MAIN,
  type ActivePartyMember,
  type Font,
  type Font4bpp,
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
  loadPortraitSet,
} from '../data-loader.js';
import { CanvasPresenter } from '../lib/presenter.js';
import { CanvasStage } from './CanvasStage.js';
import { composeCastleFrame } from '../pages/game/castle-frame.js';
import {
  composePartyMemberPickerFrame,
  PICKER_CURSOR_EXIT,
  type PartyMemberPickerView,
} from '../pages/castle/compose-party-member-picker-frame.js';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

/**
 * Pure picker-cursor transition. `cursor` is -1 (EXIT) or 0..n-1; returns the
 * next cursor for the given arrow key. Verified against the engine:
 *   Down: -1 → 0; s → s+2 only if s+2 < n (else clamp, no wrap).
 *   Up:   s >= 2 → s-2; s in {0,1} → -1 (EXIT).
 *   Left: odd s → s-1 (even s or EXIT: no-op).
 *   Right: even s → s+1 only if s+1 < n (odd s or EXIT: no-op).
 */
export function nextCursor(cursor: number, key: string, n: number): number {
  switch (key) {
    case 'ArrowDown':
      if (cursor === PICKER_CURSOR_EXIT) return 0;
      return cursor + 2 < n ? cursor + 2 : cursor;
    case 'ArrowUp':
      if (cursor === PICKER_CURSOR_EXIT) return cursor;
      return cursor >= 2 ? cursor - 2 : PICKER_CURSOR_EXIT;
    case 'ArrowLeft':
      if (cursor === PICKER_CURSOR_EXIT) return cursor;
      return cursor % 2 === 1 ? cursor - 1 : cursor;
    case 'ArrowRight':
      if (cursor === PICKER_CURSOR_EXIT) return cursor;
      if (cursor % 2 === 0 && cursor + 1 < n) return cursor + 1;
      return cursor;
    default:
      return cursor;
  }
}

export interface PartyMemberPickerProps {
  title: string;
  members: ReadonlyArray<ActivePartyMember>;
  fontSet: FontSet;
  onCommit: (slotIndex: number) => void;
  onCancel: () => void;
  /** TEST ONLY: skip canvas mount + async asset loading. */
  skipCanvas?: boolean;
}

export function PartyMemberPicker({
  title,
  members,
  fontSet,
  onCommit,
  onCancel,
  skipCanvas = false,
}: PartyMemberPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cursor, setCursor] = useState(PICKER_CURSOR_EXIT);

  // Castle assets — same as AddPartyPage so we render the underlying scene
  // before overlaying the picker.
  const [mon08Pic, setMon08Pic] = useState<Pic | null>(null);
  const [mon08Decoded, setMon08Decoded] = useState<number[] | null>(null);
  const [dragonscRgba, setDragonscRgba] = useState<Uint8ClampedArray | null>(null);
  const [wfont0, setWfont0] = useState<Font | null>(null);
  const [wfont1, setWfont1] = useState<Font4bpp | null>(null);
  const [wfont3, setWfont3] = useState<Font4bpp | null>(null);
  const [wfont4, setWfont4] = useState<Font4bpp | null>(null);
  const [portraitSets, setPortraitSets] = useState<PortraitSet[]>([]);

  // The menu state the engine had when the picker opened: the main-menu grid
  // stays painted behind the picker. We mirror AddPartyPage's visibleMenuOptions
  // (filter out slot 8) with the cursor on slot 0.
  const visible = useMemo(() => {
    const ctx: MainMenuContext = {
      partySize: members.length,
      pcFileHasUnloadedChars: true,
    };
    return visibleMenuOptions(ctx).filter((opt) => opt.slot !== 8);
  }, [members.length]);

  const handleCommit = useCallback(() => {
    if (cursor === PICKER_CURSOR_EXIT) onCancel();
    else onCommit(cursor);
  }, [cursor, onCommit, onCancel]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      switch (e.key) {
        case 'Escape':
          onCancel();
          break;
        case 'Enter':
          handleCommit();
          break;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
          setCursor((c) => nextCursor(c, e.key, members.length));
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [members.length, handleCommit, onCancel]);

  // Load castle assets (skipped in tests).
  useEffect(() => {
    if (skipCanvas) return;
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
    loadFont4bpp('/fonts/wfont4.json').then((f) => !cancelled && setWfont4(f)).catch(() => {});
    Promise.all([
      loadPortraitSet('/portraits/wport1.json'),
      loadPortraitSet('/portraits/wport2.json'),
      loadPortraitSet('/portraits/wport3.json'),
    ])
      .then((sets) => !cancelled && setPortraitSets(sets))
      .catch((err) => console.warn('failed to load portrait sets', err));

    return () => {
      cancelled = true;
    };
  }, [skipCanvas]);

  // Paint loop: compose the castle frame, overlay picker windows, present.
  // Static (no RAF) — the picker doesn't animate.
  useEffect(() => {
    if (skipCanvas) return;
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
      0,
      wfont1,
      members,
      portraitSets,
      wfont4,
    );

    const view: PartyMemberPickerView = { title, members, cursor };
    for (const win of composePartyMemberPickerFrame(view)) {
      renderTileWindow(win, buf, ENGINE_W, ENGINE_H, fontSet, WIZ6_MAIN);
    }

    presenter.present(buf, ENGINE_W, ENGINE_H);
  }, [
    skipCanvas,
    title,
    members,
    cursor,
    fontSet,
    dragonscRgba,
    mon08Pic,
    mon08Decoded,
    wfont3,
    wfont0,
    wfont1,
    wfont4,
    visible,
    portraitSets,
  ]);

  if (skipCanvas) return <div data-testid="party-member-picker-stub" />;
  return (
    <CanvasStage label="Pick a party member">
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
        aria-label="Pick a party member"
      />
    </CanvasStage>
  );
}
