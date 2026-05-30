import { useState } from 'react';
import { readPresets } from '../../lib/presets-store.js';
import { readRoster } from '../../lib/roster-store.js';
import styles from './PcFilePage.module.css';

export function PcFilePage() {
  const [presets] = useState(() => readPresets());
  const [pcFile] = useState(() => readRoster().characters);

  return (
    <div className={styles.page}>
      <section className={styles.presets}>
        <h2>Presets</h2>
        {presets.map((p) => (
          <div key={p.id} className={styles.preset}>
            <h3>{p.name}{p.readOnly ? ' (read-only)' : ''}</h3>
            <ul>{p.characters.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
          </div>
        ))}
      </section>
      <section className={styles.pcfile}>
        <h2>PC File</h2>
        <ul>{pcFile.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
        <p className={styles.note}>
          To add these to your party, use the castle&apos;s ADD PARTY MEMBER — it reads this PC
          File, exactly like the original game.
        </p>
      </section>
    </div>
  );
}
