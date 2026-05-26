import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { CharacterSchema, type Character } from '@wiz6/data';
import { readRoster, addCharacter } from '../../lib/roster-store.js';
import { seedRosterIfEmpty, getGalleryOriginIds } from '../../lib/gallery.js';
import { RosterCharacterCard } from './RosterCharacterCard.js';
import styles from './RosterView.module.css';

const CharacterEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  character: CharacterSchema,
});

function newUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function downloadCharacter(c: Character): void {
  const envelope = { schemaVersion: 1 as const, character: c };
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${c.name.replace(/[^A-Za-z0-9_-]/g, '_')}.wiz6char.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function readFileAsText(file: File): Promise<string> {
  // file.text() is cleaner but FileReader works in all environments including jsdom.
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function uploadCharacter(file: File): Promise<void> {
  const text = await readFileAsText(file);
  const parsed = JSON.parse(text);
  const env = CharacterEnvelopeSchema.parse(parsed);
  // New UUID on import — never collide with the source visitor's roster.
  addCharacter({ ...env.character, id: newUuid() });
}

export function RosterView() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [galleryIds, setGalleryIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function refresh(): void {
    setCharacters(readRoster().characters);
    setGalleryIds(new Set(getGalleryOriginIds()));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await seedRosterIfEmpty();
      } catch (e) {
        console.warn('[RosterView] gallery seed failed', e);
      }
      if (cancelled) return;
      refresh();
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      await uploadCharacter(file);
      refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      // Reset so the same file can be re-uploaded if needed.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Roster</h1>
      <p className={styles.lede}>
        Your characters live in this browser's storage. Pre-seeded from the curated
        <Link to="#"> gallery</Link> on first visit.
      </p>

      <div className={styles.actions}>
        <Link to="/roster/new" className={styles.uploadLabel}>
          + New Character
        </Link>
        <label className={styles.uploadLabel}>
          Upload character
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={onUpload}
            aria-label="Upload character"
          />
        </label>
        {uploadError ? <p role="alert" className={styles.error}>Upload failed: {uploadError}</p> : null}
      </div>

      {!loaded ? (
        <p>Loading…</p>
      ) : characters.length === 0 ? (
        <p>No characters yet.</p>
      ) : (
        <ul className={styles.grid}>
          {characters.map((c) => (
            <li key={c.id}>
              <RosterCharacterCard
                character={c}
                fromGallery={galleryIds.has(c.id)}
                onDownload={() => downloadCharacter(c)}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
