/**
 * ReviewMemberPage — wbase MASTER OPTIONS slot 1 (REVIEW MEMBER).
 *
 * Mounts the shared PartyMemberPicker with title from msg 0x4b2
 * ("REVIEW WHO?"). On commit: navigate to /castle/review-member/:slotIdx
 * which mounts the CharacterViewPage. On cancel: back to /castle.
 *
 * Single-member shortcut: if members.length === 1, navigate directly to
 * /castle/review-member/0 (engine bypasses the picker).
 *
 * Empty party: bounce to /castle.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WIZ6_MAIN, type MessageDb } from '@wiz6/data';
import { loadMessageDb as defaultLoadMessageDb } from '../../data-loader.js';
import { loadCreationFontSet } from '../roster/creation/ega/assets.js';
import type { FontSet } from '@wiz6/parser';
import { readActiveParty } from '../../lib/active-party-store.js';
import { creationString } from '../roster/creation/messages.js';
import { PartyMemberPicker } from '../../components/PartyMemberPicker.js';

const REVIEW_WHO_MSG_ID = 0x4b2;

export function ReviewMemberPage() {
  const navigate = useNavigate();
  const members = useMemo(() => readActiveParty().members, []);
  const [fontSet, setFontSet] = useState<FontSet | null>(null);
  const [db, setDb] = useState<MessageDb | null>(null);

  useEffect(() => {
    if (members.length === 0) {
      navigate('/castle');
    } else if (members.length === 1) {
      navigate('/castle/review-member/0');
    }
  }, [members.length, navigate]);

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
        if (!cancelled) console.error('[ReviewMemberPage] asset load failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (members.length < 2) return null;
  if (!fontSet || !db) return <div>Loading…</div>;

  const title = creationString(db, REVIEW_WHO_MSG_ID);
  return (
    <PartyMemberPicker
      title={title}
      members={members}
      fontSet={fontSet}
      palette={WIZ6_MAIN}
      onCommit={(slotIdx) => navigate(`/castle/review-member/${slotIdx}`)}
      onCancel={() => navigate('/castle')}
    />
  );
}
