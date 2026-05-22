import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './PicsIndex.module.css';

const PIC_NAMES = [
  'credits',
  ...Array.from({ length: 59 }, (_, i) => `mon${i.toString().padStart(2, '0')}`),
];

interface Summary {
  id: string;
  segmentCount: number;
  totalBytes: number;
  error?: string;
}

export function PicsIndex() {
  const [summaries, setSummaries] = useState<Summary[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results: Summary[] = [];
      for (const name of PIC_NAMES) {
        try {
          const res = await fetch(`/pics/${name}.json`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          if (text.trimStart().startsWith('<')) {
            results.push({ id: name, segmentCount: 0, totalBytes: 0, error: 'not extracted' });
            continue;
          }
          const json = JSON.parse(text);
          results.push({
            id: name,
            segmentCount: Array.isArray(json.segments) ? json.segments.length : 0,
            totalBytes: typeof json.totalBytes === 'number' ? json.totalBytes : 0,
          });
        } catch (err) {
          results.push({
            id: name,
            segmentCount: 0,
            totalBytes: 0,
            error: (err as Error).message,
          });
        }
      }
      if (!cancelled) setSummaries(results);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.page}>
      <h1>Pics</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Outer-envelope decoded view of the 59 monster sprite files and{' '}
        <code>credits.pic</code>. Each file decodes into 1-4 segments via the
        LIT/RUN/END opcodes documented in <code>docs/re/pic.md</code>. Pixel
        rendering is Stage B — these views show decoded byte buffers as hex.
      </p>
      <div className={styles.grid}>
        {summaries.map((s) => (
          <Link key={s.id} className={styles.card} to={`/pics/${s.id}`}>
            <div className={styles.cardName}>{s.id}</div>
            <div className={styles.cardMeta}>
              {s.error ? s.error : `${s.segmentCount} segments · ${s.totalBytes.toLocaleString()} bytes`}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
