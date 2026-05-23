import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  OVERLAY_MANIFEST,
  type NamingPassFindings,
  type OverlayManifestEntry,
  type RenamedFunctionEntry,
} from './manifest.js';
import styles from './Overlays.module.css';

type SortField = 'addr' | 'name' | 'category';
type SortDir = 'asc' | 'desc';

function parseHexAddr(s: string): number {
  const m = /^0?x?([0-9a-f]+)$/i.exec(s.trim());
  return m ? parseInt(m[1]!, 16) : 0;
}

function compareRows(a: RenamedFunctionEntry, b: RenamedFunctionEntry, field: SortField): number {
  if (field === 'addr') return parseHexAddr(a.addr) - parseHexAddr(b.addr);
  return (a[field] ?? '').localeCompare(b[field] ?? '');
}

export function OverlayDetail() {
  const { slug } = useParams<{ slug: string }>();
  const manifest: OverlayManifestEntry | undefined = useMemo(
    () => OVERLAY_MANIFEST.find((m) => m.slug === slug),
    [slug],
  );

  const [findings, setFindings] = useState<NamingPassFindings | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filter + sort state
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('addr');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  useEffect(() => {
    if (!manifest) return;
    let cancelled = false;
    setFindings(null);
    setError(null);
    fetch(`/docs/re/findings/${manifest.findingsFile}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<NamingPassFindings>;
      })
      .then((data) => {
        if (!cancelled) setFindings(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [manifest]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of findings?.renamed_full_list ?? []) set.add(r.category);
    return Array.from(set).sort();
  }, [findings]);

  const filteredRows = useMemo(() => {
    const all = findings?.renamed_full_list ?? [];
    const needle = search.trim().toLowerCase();
    const filtered = all.filter((r) => {
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (!needle) return true;
      return (
        r.new.toLowerCase().includes(needle) ||
        r.addr.toLowerCase().includes(needle) ||
        r.category.toLowerCase().includes(needle)
      );
    });
    const sorted = [...filtered].sort((a, b) => compareRows(a, b, sortField));
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [findings, search, categoryFilter, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  if (!manifest) {
    return (
      <main className={styles.page}>
        <p>Unknown overlay: <code>{slug}</code>.</p>
        <p>
          <Link to="/explore/overlays">← back to overlays index</Link>
        </p>
      </main>
    );
  }

  const keyDiscoveries: string[] = useMemo(() => {
    if (!findings?.key_discoveries) return [];
    return findings.key_discoveries.map((d) => (typeof d === 'string' ? d : d.text));
  }, [findings]);

  return (
    <main className={styles.page}>
      <p className={styles.crumbs}>
        <Link to="/explore/overlays">← back to overlays</Link>
      </p>

      <header className={styles.detailHeader}>
        <h1>{manifest.label}</h1>
        <p className={styles.subtitle}>{manifest.subtitle}</p>
      </header>

      {error && (
        <div className={styles.error}>
          Failed to load <code>{manifest.findingsFile}</code>: {error}
        </div>
      )}

      {findings && (
        <>
          {findings.stats && (
            <section className={styles.statsRow}>
              <div className={styles.statBox}>
                <div className={styles.statLabel}>Total</div>
                <div className={styles.statValue}>
                  {(findings.stats.total_functions ?? 0).toLocaleString()}
                </div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.statLabel}>Renamed</div>
                <div className={styles.statValue}>
                  {(findings.stats.renamed ?? 0).toLocaleString()}
                </div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.statLabel}>Remaining</div>
                <div className={styles.statValue}>
                  {(findings.stats.remaining_FUN_XXXX ?? 0).toLocaleString()}
                </div>
              </div>
              {findings.stats.categories && (
                <div className={styles.statBox}>
                  <div className={styles.statLabel}>Categories</div>
                  <div className={styles.statValue}>
                    {Object.keys(findings.stats.categories).length}
                  </div>
                </div>
              )}
            </section>
          )}

          {findings.summary && (
            <section className={styles.summarySection}>
              <h2>Summary</h2>
              <p>{findings.summary}</p>
            </section>
          )}

          {keyDiscoveries.length > 0 && (
            <section className={styles.discoveriesSection}>
              <h2>Key discoveries</h2>
              <ol className={styles.discoveriesList}>
                {keyDiscoveries.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ol>
            </section>
          )}

          <section className={styles.functionsSection}>
            <h2>Function index ({filteredRows.length.toLocaleString()})</h2>

            <div className={styles.filterRow}>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, address, or category…"
                className={styles.searchInput}
              />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={styles.categorySelect}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c} ({findings?.stats?.categories?.[c] ?? '?'})
                  </option>
                ))}
              </select>
              {(search || categoryFilter) && (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => {
                    setSearch('');
                    setCategoryFilter('');
                  }}
                >
                  clear
                </button>
              )}
            </div>

            <table className={styles.functionsTable}>
              <thead>
                <tr>
                  <th onClick={() => toggleSort('addr')} className={styles.sortable}>
                    addr {sortField === 'addr' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th onClick={() => toggleSort('name')} className={styles.sortable}>
                    name {sortField === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th onClick={() => toggleSort('category')} className={styles.sortable}>
                    category {sortField === 'category' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={`${r.addr}-${r.new}`}>
                    <td className={styles.addrCell}>{r.addr}</td>
                    <td className={styles.nameCell}>{r.new}</td>
                    <td className={styles.catCell}>{r.category}</td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={3} className={styles.emptyCell}>
                      No functions match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className={styles.linksSection}>
            <h2>See also</h2>
            <ul className={styles.linksList}>
              <li>
                <Link to={`/explore/docs/re/${manifest.docFile}`}>
                  📄 Canonical doc: <code>{manifest.docFile}</code>
                </Link>
              </li>
              <li>
                <a href={`/docs/re/findings/${manifest.findingsFile}`} target="_blank" rel="noreferrer">
                  📦 Raw findings JSON: <code>{manifest.findingsFile}</code>
                </a>
              </li>
              {manifest.applyScript && (
                <li>
                  <span>
                    🛠️ Ghidra replay script: <code>tools/ghidra/scripts/{manifest.applyScript}</code>
                  </span>
                </li>
              )}
            </ul>
          </section>
        </>
      )}

      {!findings && !error && <p className={styles.dim}>loading…</p>}
    </main>
  );
}
