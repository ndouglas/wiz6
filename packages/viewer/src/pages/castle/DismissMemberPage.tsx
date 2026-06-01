/**
 * DismissMemberPage — wbase MASTER OPTIONS slot 2 (DISMISS MEMBER).
 *
 * Mounts the shared PartyMemberPicker with title from msg 0x4b3
 * ("DISMISS WHO?"). On commit: dismissMember(slotIdx) + back to /castle.
 * On cancel: back to /castle, no state change.
 *
 * Single-member shortcut: if members.length === 1, the engine bypasses the
 * picker entirely. We mirror this: immediately dismiss slot 0 and navigate.
 *
 * Empty party: bounce to /castle (shouldn't happen normally — slot 2 is
 * hidden by the visibility predicate when partySize < 1).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type MessageDb } from '@wiz6/data';
import { loadMessageDb as defaultLoadMessageDb } from '../../data-loader.js';
import { loadCreationFontSet } from '../roster/creation/ega/assets.js';
import type { FontSet } from '@wiz6/parser';
import { dismissMember, readActiveParty } from '../../lib/active-party-store.js';
import { creationString } from '../roster/creation/messages.js';
import { PartyMemberPicker } from '../../components/PartyMemberPicker.js';

const DISMISS_WHO_MSG_ID = 0x4b3;

export function DismissMemberPage() {
  const navigate = useNavigate();
  const members = useMemo(() => readActiveParty().members, []);
  const [fontSet, setFontSet] = useState<FontSet | null>(null);
  const [db, setDb] = useState<MessageDb | null>(null);

  useEffect(() => {
    if (members.length === 0) {
      navigate('/castle');
      return;
    }
    if (members.length === 1) {
      dismissMember(0);
      navigate('/castle');
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
        if (!cancelled) console.error('[DismissMemberPage] asset load failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (members.length < 2) return null; // bounce in effect above
  if (!fontSet || !db) return <div>Loading…</div>;

  const title = creationString(db, DISMISS_WHO_MSG_ID);
  return (
    <PartyMemberPicker
      title={title}
      members={members}
      fontSet={fontSet}
      onCommit={(slotIdx) => {
        dismissMember(slotIdx);
        navigate('/castle');
      }}
      onCancel={() => navigate('/castle')}
    />
  );
}
