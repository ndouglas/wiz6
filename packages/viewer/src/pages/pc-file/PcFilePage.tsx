import { useState, useCallback } from 'react';
import { readPresets, addPreset, deletePreset, copyCharactersToPcFile } from '../../lib/presets-store.js';
import { readRoster } from '../../lib/roster-store.js';
import type { Character } from '@wiz6/data';
import styles from './PcFilePage.module.css';

export function PcFilePage() {
  const [presets, setPresets] = useState(() => readPresets());
  const [pcFile, setPcFile] = useState<Character[]>(() => readRoster().characters);
  const [namingPreset, setNamingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setPresets(readPresets());
    setPcFile(readRoster().characters);
  }, []);

  const copy = useCallback(
    (chars: Character[]) => {
      const withIds = chars.map((c) => ({ ...c, id: crypto.randomUUID() }));
      const res = copyCharactersToPcFile(withIds);
      const msgs: string[] = [];
      if (res.added.length) msgs.push(`Added: ${res.added.join(', ')}`);
      if (res.skippedDuplicate.length) msgs.push(`Skipped (already in PC File): ${res.skippedDuplicate.join(', ')}`);
      if (res.skippedFull.length) msgs.push(`Skipped (PC File full): ${res.skippedFull.join(', ')}`);
      setNotice(msgs.length ? msgs.join(' · ') : null);
      refresh();
    },
    [refresh],
  );

  const saveAsPreset = useCallback(() => {
    addPreset(presetName.trim() || 'Untitled', pcFile);
    setNamingPreset(false);
    setPresetName('');
    refresh();
  }, [presetName, pcFile, refresh]);

  return (
    <div className={styles.page}>
      <section className={styles.presets} aria-label="Presets">
        <h2>Presets</h2>
        {presets.map((p) => (
          <div key={p.id} className={styles.preset}>
            <h3>
              {p.name}
              {p.readOnly ? ' (read-only)' : ''}
              {' '}
              <button aria-label={`copy all from ${p.name}`} onClick={() => copy(p.characters)}>
                copy all →
              </button>
              {!p.readOnly && (
                <button
                  aria-label={`delete ${p.name}`}
                  onClick={() => {
                    deletePreset(p.id);
                    refresh();
                  }}
                >
                  delete
                </button>
              )}
            </h3>
            <ul>
              {p.characters.map((c) => (
                <li key={c.id}>
                  {c.name}{' '}
                  <button aria-label={`copy ${c.name}`} onClick={() => copy([c])}>
                    copy →
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className={styles.pcfile} role="region" aria-label="PC File">
        <h2>PC File</h2>
        {notice && (
          <p className={styles.note} role="status">
            {notice}
          </p>
        )}
        <ul>
          {pcFile.map((c) => (
            <li key={c.id}>{c.name}</li>
          ))}
        </ul>
        <button aria-label="Save as preset" onClick={() => setNamingPreset(true)}>
          Save as preset
        </button>
        {namingPreset && (
          <div>
            <label>
              Preset name{' '}
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                aria-label="Preset name"
              />
            </label>
            <button onClick={saveAsPreset}>Create</button>
            <button onClick={() => setNamingPreset(false)}>Cancel</button>
          </div>
        )}
        <p className={styles.note}>
          To add these to your party, use the castle&apos;s ADD PARTY MEMBER — it reads this PC
          File, exactly like the original game.
        </p>
      </section>
    </div>
  );
}
