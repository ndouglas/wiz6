import { useEffect, useMemo, useState } from 'react';
import type { MessageDb } from '@wiz6/data';
import { loadMessageDb } from '../data-loader.js';

interface Props {
  url: string;
}

export function MessageGallery({ url }: Props) {
  const [db, setDb] = useState<MessageDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadMessageDb(url)
      .then((d) => { if (!cancelled) setDb(d); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [url]);

  const filtered = useMemo(() => {
    if (!db) return [] as MessageDb['records'];
    if (!filter) return db.records;
    const needle = filter.toLowerCase();
    return db.records.filter(
      (r) => r.decodedText.toLowerCase().includes(needle) || String(r.index).includes(filter),
    );
  }, [db, filter]);

  if (error) return <p>Failed to load {url}: {error}</p>;
  if (!db) return <p>Loading {url}…</p>;

  return (
    <section>
      <h2>{db.id} ({db.recordCount} records, tree from {db.treeSourceFile})</h2>
      <label>
        Filter:{' '}
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="search decoded text or record #"
          style={{ width: '20em', fontFamily: 'monospace' }}
        />
      </label>{' '}
      <span style={{ color: '#888' }}>showing {filtered.length} / {db.recordCount}</span>
      <table style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85em', marginTop: '0.5em', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #888', textAlign: 'left' }}>
            <th style={{ width: '4em' }}>#</th>
            <th style={{ width: '4em' }}>comp</th>
            <th>decoded text</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.index} style={{ borderBottom: '1px solid #222' }}>
              <td style={{ color: '#888' }}>{r.index}</td>
              <td style={{ color: '#888' }}>{r.compressedBytes}b</td>
              <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {r.decodedText
                  .split('')
                  .map((c, i) =>
                    c.charCodeAt(0) < 32 || c.charCodeAt(0) >= 127
                      ? <span key={i} style={{ color: '#f88' }}>{`\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`}</span>
                      : c,
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
