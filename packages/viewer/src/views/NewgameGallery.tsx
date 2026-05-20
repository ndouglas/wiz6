import { useEffect, useMemo, useState } from 'react';
import type { NewgameDb } from '@wiz6/data';
import { loadNewgameDb } from '../data-loader.js';

interface Props {
  url: string;
}

function fmtByte(b: number): string {
  return b.toString(16).padStart(2, '0');
}

export function NewgameGallery({ url }: Props) {
  const [db, setDb] = useState<NewgameDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadNewgameDb(url)
      .then((d) => { if (!cancelled) setDb(d); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [url]);

  const visible = useMemo(() => {
    if (!db) return [];
    let filtered = db.records;
    if (hideEmpty) filtered = filtered.filter((r) => !r.empty);
    if (filter) {
      const n = parseInt(filter, 10);
      if (!isNaN(n)) filtered = filtered.filter((r) => r.index === n);
    }
    return filtered;
  }, [db, hideEmpty, filter]);

  if (error) return <p>Failed to load {url}: {error}</p>;
  if (!db) return <p>Loading {url}…</p>;

  const nonEmptyCount = db.records.filter((r) => !r.empty).length;

  return (
    <section>
      <h2>
        {db.id} — {db.recordCount} × 64-byte records ({nonEmptyCount} non-empty)
      </h2>
      <div style={{ marginBottom: '0.5em', fontSize: '0.9em' }}>
        <label style={{ marginRight: '1em' }}>
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={() => setHideEmpty(!hideEmpty)}
          />{' '}
          hide empty records
        </label>
        <label>
          jump to record:{' '}
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="0..778"
            style={{ width: '6em', fontFamily: 'monospace' }}
          />
        </label>
        <span style={{ marginLeft: '1em', color: '#888' }}>
          showing {visible.length} / {db.recordCount}
        </span>
      </div>
      <table
        style={{
          width: '100%',
          fontFamily: 'monospace',
          fontSize: '0.78em',
          borderCollapse: 'collapse',
        }}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid #888', textAlign: 'left' }}>
            <th style={{ width: '4em' }}>#</th>
            <th>bytes (hex)</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.index} style={{ borderBottom: '1px solid #222' }}>
              <td style={{ color: r.empty ? '#444' : '#888', verticalAlign: 'top' }}>
                {r.index}
                {r.empty && <span style={{ color: '#666' }}> (empty)</span>}
              </td>
              <td style={{ whiteSpace: 'pre' }}>
                {r.bytes
                  .map((b, i) => {
                    const isZero = b === 0;
                    const sep = (i + 1) % 16 === 0 ? '\n' : ' ';
                    return (
                      <span
                        key={i}
                        style={{ color: isZero ? '#444' : '#ddd' }}
                      >
                        {fmtByte(b)}{sep}
                      </span>
                    );
                  })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
