import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Character } from '@wiz6/data';
import { readRoster } from '../../lib/roster-store.js';
import { seedRosterIfEmpty } from '../../lib/gallery.js';
import { RosterCharacterCard } from './RosterCharacterCard.js';
import styles from './RosterView.module.css';

export function RosterView() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedRosterIfEmpty();
      } catch (e) {
        console.warn('[RosterView] gallery seed failed', e);
      }
      if (cancelled) return;
      setCharacters(readRoster().characters);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Roster</h1>
      <p className={styles.lede}>
        Your characters live in this browser's storage. Pre-seeded from the curated
        <Link to="#"> gallery</Link> on first visit.
      </p>
      {!loaded ? (
        <p>Loading…</p>
      ) : characters.length === 0 ? (
        <p>No characters yet.</p>
      ) : (
        <ul className={styles.grid}>
          {characters.map((c) => (
            <li key={c.id}>
              <RosterCharacterCard character={c} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
