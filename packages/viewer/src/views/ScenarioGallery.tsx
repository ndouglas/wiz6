import { useEffect, useMemo, useState } from 'react';
import type { ScenarioDb } from '@wiz6/data';
import { loadScenarioDb } from '../data-loader.js';

interface Props {
  url: string;
}

function fmtByte(b: number): string {
  return b.toString(16).padStart(2, '0');
}

export function ScenarioGallery({ url }: Props) {
  const [db, setDb] = useState<ScenarioDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadScenarioDb(url)
      .then((d) => { if (!cancelled) setDb(d); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [url]);

  const visibleItems = useMemo(() => {
    if (!db) return [];
    let filtered = db.items;
    if (hideEmpty) filtered = filtered.filter((it) => !it.empty);
    if (search) {
      const q = search.toUpperCase();
      filtered = filtered.filter(
        (it) =>
          it.name1.toUpperCase().includes(q) ||
          it.name2.toUpperCase().includes(q) ||
          String(it.index) === q,
      );
    }
    return filtered;
  }, [db, hideEmpty, search]);

  if (error) return <p>Failed to load {url}: {error}</p>;
  if (!db) return <p>Loading {url}…</p>;

  const nonEmptyItems = db.items.filter((it) => !it.empty).length;

  return (
    <section>
      <h2>
        {db.id} — {db.xpTables.length} XP tables, {db.itemCount} item slots ({nonEmptyItems} filled)
        , {db.unknownTail.length}-byte tail
      </h2>

      <h3 style={{ marginTop: '1em' }}>XP-per-level by character class</h3>
      <table
        style={{
          fontFamily: 'monospace',
          fontSize: '0.78em',
          borderCollapse: 'collapse',
        }}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid #888', textAlign: 'right' }}>
            <th style={{ textAlign: 'left' }}>class</th>
            {Array.from({ length: 16 }, (_, i) => (
              <th key={i} style={{ paddingLeft: '0.5em' }}>L{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {db.xpTables.map((t) => (
            <tr key={t.classIndex} style={{ borderBottom: '1px solid #222', textAlign: 'right' }}>
              <td style={{ textAlign: 'left', color: '#888' }}>#{t.classIndex}</td>
              {t.levels.map((v, i) => (
                <td key={i} style={{ paddingLeft: '0.5em' }}>{v.toLocaleString()}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: '1.5em' }}>Items (74-byte records, raw stat bytes shown)</h3>
      <div style={{ marginBottom: '0.5em', fontSize: '0.9em' }}>
        <label style={{ marginRight: '1em' }}>
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={() => setHideEmpty(!hideEmpty)}
          />{' '}
          hide empty slots
        </label>
        <label>
          search:{' '}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="DAGGER / 42"
            style={{ width: '12em', fontFamily: 'monospace' }}
          />
        </label>
        <span style={{ marginLeft: '1em', color: '#888' }}>
          showing {visibleItems.length} / {db.itemCount}
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
            <th style={{ width: '12em' }}>name1</th>
            <th style={{ width: '12em' }}>name2</th>
            <th>bytes (hex)</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((it) => (
            <tr key={it.index} style={{ borderBottom: '1px solid #222' }}>
              <td style={{ color: it.empty ? '#444' : '#888', verticalAlign: 'top' }}>
                {it.index}
              </td>
              <td style={{ verticalAlign: 'top' }}>{it.name1}</td>
              <td style={{ verticalAlign: 'top', color: '#888' }}>{it.name2}</td>
              <td style={{ whiteSpace: 'pre' }}>
                {it.bytes.map((b, i) => {
                  const isZero = b === 0;
                  const sep = (i + 1) % 16 === 0 ? '\n' : ' ';
                  return (
                    <span key={i} style={{ color: isZero ? '#444' : '#ddd' }}>
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
