import { useEffect, useMemo, useState } from 'react';
import type { MessageDb } from '@wiz6/data';
import { loadMessageDb } from '../data-loader.js';

type View = 'indexed' | 'records';

interface Props {
  url: string;
}

function escapeText(s: string): React.ReactNode[] {
  return s.split('').map((c, i) =>
    c.charCodeAt(0) < 32 || c.charCodeAt(0) >= 127 ? (
      <span key={i} style={{ color: '#f88' }}>{`\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`}</span>
    ) : (
      c
    ),
  );
}

export function MessageGallery({ url }: Props) {
  const [db, setDb] = useState<MessageDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [view, setView] = useState<View>('indexed');

  useEffect(() => {
    let cancelled = false;
    loadMessageDb(url)
      .then((d) => { if (!cancelled) setDb(d); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [url]);

  const filteredIndexed = useMemo(() => {
    if (!db) return db?.indexedMessages ?? [];
    if (!filter) return db.indexedMessages;
    const needle = filter.toLowerCase();
    return db.indexedMessages.filter(
      (m) =>
        m.decodedText.toLowerCase().includes(needle) ||
        String(m.index).includes(filter),
    );
  }, [db, filter]);

  const filteredRecords = useMemo(() => {
    if (!db) return db?.records ?? [];
    if (!filter) return db.records;
    const needle = filter.toLowerCase();
    return db.records.filter(
      (r) =>
        r.decodedText.toLowerCase().includes(needle) ||
        String(r.index).includes(filter),
    );
  }, [db, filter]);

  if (error) return <p>Failed to load {url}: {error}</p>;
  if (!db) return <p>Loading {url}…</p>;

  return (
    <section>
      <h2>
        {db.id} — {db.indexedCount} indexed messages from {db.indexSourceFile}, {db.recordCount} raw records from {db.sourceFile}, tree from {db.treeSourceFile}
      </h2>
      <div style={{ marginBottom: '0.5em' }}>
        <label style={{ marginRight: '1em' }}>
          <input
            type="radio"
            name={`mg-view-${url}`}
            checked={view === 'indexed'}
            onChange={() => setView('indexed')}
          />{' '}
          Indexed messages (via msg.hdr)
        </label>
        <label>
          <input
            type="radio"
            name={`mg-view-${url}`}
            checked={view === 'records'}
            onChange={() => setView('records')}
          />{' '}
          Raw msg.dbs records
        </label>
      </div>
      <label>
        Filter:{' '}
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="search decoded text or #"
          style={{ width: '20em', fontFamily: 'monospace' }}
        />
      </label>{' '}
      <span style={{ color: '#888' }}>
        showing {view === 'indexed' ? filteredIndexed.length : filteredRecords.length} /{' '}
        {view === 'indexed' ? db.indexedCount : db.recordCount}
      </span>
      {view === 'indexed' ? (
        <table style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85em', marginTop: '0.5em', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #888', textAlign: 'left' }}>
              <th style={{ width: '4em' }}>#</th>
              <th style={{ width: '4em' }}>sec</th>
              <th style={{ width: '5em' }}>byteOff</th>
              <th style={{ width: '5em' }}>charOff</th>
              <th style={{ width: '5em' }}>raw</th>
              <th>decoded text</th>
            </tr>
          </thead>
          <tbody>
            {filteredIndexed.map((m) => (
              <tr key={m.index} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ color: '#888' }}>{m.index}</td>
                <td style={{ color: '#888' }}>{m.sectionIndex}</td>
                <td style={{ color: '#888' }}>{m.byteOffset}</td>
                <td style={{ color: '#888' }}>{m.charOffset}</td>
                <td style={{ color: '#888' }}>{m.raw}</td>
                <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {escapeText(m.decodedText)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85em', marginTop: '0.5em', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #888', textAlign: 'left' }}>
              <th style={{ width: '4em' }}>#</th>
              <th style={{ width: '4em' }}>comp</th>
              <th>decoded text</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.map((r) => (
              <tr key={r.index} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ color: '#888' }}>{r.index}</td>
                <td style={{ color: '#888' }}>{r.compressedBytes}b</td>
                <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {escapeText(r.decodedText)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
