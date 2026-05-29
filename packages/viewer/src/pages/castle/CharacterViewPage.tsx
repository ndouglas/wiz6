/**
 * CharacterViewPage — WPCVW state-0x11 character view (scaffold).
 *
 * Reads :slotIdx from the route, renders the 3-window WPCVW layout via
 * composeCharacterViewFrame, handles EXIT (Enter on cursor=11 OR Escape)
 * → navigate to /castle.
 *
 * Scaffold limits: cursor is locked on EXIT (idx 11). Arrow keys don't move
 * the cursor since no other action is wired up. Future action ports will
 * unlock cursor movement.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WIZ6_MAIN, type ActivePartyMember, type MessageDb } from '@wiz6/data';
import {
  renderTileWindow,
  type FontSet,
} from '@wiz6/parser';
import { loadMessageDb as defaultLoadMessageDb } from '../../data-loader.js';
import { loadCreationFontSet } from '../roster/creation/ega/assets.js';
import { readActiveParty } from '../../lib/active-party-store.js';
import { CanvasPresenter } from '../../lib/presenter.js';
import { composeCharacterViewFrame } from './compose-character-view-frame.js';

const ENGINE_W = 320;
const ENGINE_H = 200;
const SCALE = 3;

// In the camp-mask-enabled action subset (6 entries: EQUIP/SPELL/ASSAY/SWAG/
// SKILL/EXIT), EXIT is at packed index 5. See compose-action-menu.ts.
const CURSOR_EXIT = 5;

export function CharacterViewPage() {
  const navigate = useNavigate();
  const { slotIdx: slotIdxParam } = useParams<{ slotIdx: string }>();
  const slotIdx = Number(slotIdxParam);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fontSet, setFontSet] = useState<FontSet | null>(null);
  const [db, setDb] = useState<MessageDb | null>(null);

  const members = useMemo<ActivePartyMember[]>(() => readActiveParty().members, []);
  const validSlot = Number.isFinite(slotIdx) && slotIdx >= 0 && slotIdx < members.length;

  // Bounce on invalid slot.
  useEffect(() => {
    if (!validSlot) navigate('/castle');
  }, [validSlot, navigate]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [fs, m] = await Promise.all([
          loadCreationFontSet(),
          defaultLoadMessageDb('/messages/msg.json'),
        ]);
        if (cancelled) return;
        setFontSet(fs);
        setDb(m);
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
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        navigate('/castle');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  // Paint loop — static; no animations in the scaffold.
  useEffect(() => {
    if (!validSlot || !fontSet || !db) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const presenter = new CanvasPresenter(canvas);
    const windows = composeCharacterViewFrame({
      members,
      currentSlot: slotIdx,
      cursorIdx: CURSOR_EXIT,
      db,
    });
    const buf = new Uint8ClampedArray(ENGINE_W * ENGINE_H * 4);
    buf.fill(0);
    for (const w of windows) {
      renderTileWindow(w, buf, ENGINE_W, ENGINE_H, fontSet, WIZ6_MAIN);
    }
    presenter.present(buf, ENGINE_W, ENGINE_H);
  }, [validSlot, fontSet, db, members, slotIdx]);

  if (!validSlot) return null;
  if (!fontSet || !db) return <div>Loading…</div>;

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
