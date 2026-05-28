/**
 * AddPartyPage — top-level component for the wbase ADD PARTY picker.
 *
 * Owns:
 *  - useState for cursor index + onCancel flag (two-state cursor matching
 *    findings/wpcmk-roster-picker-input.json)
 *  - useEffect for loading fonts + MessageDb
 *  - Key handling: arrows/Enter/Escape per the spec's key table
 *  - On commit: addMember(rosterChar) then navigate('/castle')
 *  - On cancel: navigate('/castle') with no state change
 *
 * Spec: docs/superpowers/specs/2026-05-28-add-party-member-design.md
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WIZ6_MAIN, type MessageDb } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import { loadCreationFontSet } from '../roster/creation/ega/assets.js';
import { loadMessageDb as defaultLoadMessageDb } from '../../data-loader.js';
import { readRoster } from '../../lib/roster-store.js';
import {
  readActiveParty,
  addMember,
  availableRosterFor,
} from '../../lib/active-party-store.js';
import { CreationCanvas } from '../roster/creation/ega/CreationCanvas.js';
import { composeAddPartyPickerFrame } from './compose-add-party-picker-frame.js';

export interface AddPartyPageProps {
  /** TEST ONLY: Skip async asset loading; the page renders a stub div so
   *  tests can drive key handling and store integration without fetch(). */
  skipAssetLoad?: boolean;
}

export function AddPartyPage({ skipAssetLoad = false }: AddPartyPageProps) {
  const navigate = useNavigate();
  const [fontSet, setFontSet] = useState<FontSet | null>(null);
  const [db, setDb] = useState<MessageDb | null>(null);
  const [cursorIdx, setCursorIdx] = useState(0);
  const [onCancel, setOnCancel] = useState(false);

  // Snapshot the available roster once on mount. The picker is non-reentrant
  // (no other writer of the active party while it's open), so a stable
  // snapshot avoids re-computation on every render.
  const candidates = useMemo(() => {
    return availableRosterFor(readRoster().characters, readActiveParty());
  }, []);

  // Empty roster (or all already in the active party): bounce immediately.
  useEffect(() => {
    if (candidates.length === 0) navigate('/castle');
  }, [candidates.length, navigate]);

  useEffect(() => {
    if (skipAssetLoad) return;
    let cancelled = false;
    void (async () => {
      try {
        const [fs, m] = await Promise.all([
          loadCreationFontSet(),
          defaultLoadMessageDb('/messages/msg.json'),
        ]);
        if (!cancelled) {
          setFontSet(fs);
          setDb(m);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('[AddPartyPage] asset load failed:', err);
        }
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

  if (skipAssetLoad) return <div data-testid="add-party-stub" />;
  if (!fontSet || !db) return <div>Loading…</div>;

  const windows = composeAddPartyPickerFrame(
    { candidates, cursorIdx, onCancel },
    db,
  );

  return <CreationCanvas windows={windows} fontSet={fontSet} palette={WIZ6_MAIN} />;
}
