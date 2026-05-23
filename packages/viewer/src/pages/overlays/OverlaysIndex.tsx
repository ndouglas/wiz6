import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { OVERLAY_MANIFEST, type NamingPassFindings, type OverlayManifestEntry } from './manifest.js';
import styles from './Overlays.module.css';

interface OverlaySummary {
  manifest: OverlayManifestEntry;
  total?: number;
  renamed?: number;
  remaining?: number;
  error?: string;
}

export function OverlaysIndex() {
  const [summaries, setSummaries] = useState<OverlaySummary[]>(
    OVERLAY_MANIFEST.map((m) => ({ manifest: m })),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        OVERLAY_MANIFEST.map(async (m): Promise<OverlaySummary> => {
          try {
            const res = await fetch(`/docs/findings/${m.findingsFile}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as NamingPassFindings;
            return {
              manifest: m,
              total: data.stats?.total_functions ?? data.renamed_full_list?.length,
              renamed: data.stats?.renamed ?? data.renamed_full_list?.length ?? 0,
              remaining: data.stats?.remaining_FUN_XXXX ?? 0,
            };
          } catch (e) {
            return { manifest: m, error: e instanceof Error ? e.message : String(e) };
          }
        }),
      );
      if (!cancelled) setSummaries(results);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalRenamed = summaries.reduce((acc, s) => acc + (s.renamed ?? 0), 0);
  const totalFunctions = summaries.reduce((acc, s) => acc + (s.total ?? 0), 0);

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>Engine Overlays</h1>
        <p className={styles.subtitle}>
          Function-level reference for every Wiz6 binary that has been through a
          naming pass. Pick an overlay to see its named functions, state-machine
          role, and key discoveries. Each entry links to its canonical RE doc
          and its idempotent Ghidra rename script.
        </p>
        <p className={styles.subtitle}>
          Across {summaries.length} binaries:{' '}
          <strong>{totalRenamed.toLocaleString()}</strong> functions named
          {totalFunctions > 0 && (
            <>
              {' '}
              of <strong>{totalFunctions.toLocaleString()}</strong>
            </>
          )}
          .
        </p>
      </header>

      <div className={styles.cardGrid}>
        {summaries.map((s) => (
          <Link
            key={s.manifest.slug}
            to={`/explore/overlays/${s.manifest.slug}`}
            className={styles.indexCard}
          >
            <div className={styles.indexCardHeader}>
              <h2>{s.manifest.label}</h2>
              {s.error ? (
                <span className={styles.errorBadge}>{s.error}</span>
              ) : s.renamed !== undefined ? (
                <span className={styles.countBadge}>
                  {s.renamed}
                  {s.total ? ` / ${s.total}` : ''} fn
                </span>
              ) : (
                <span className={styles.countBadge}>…</span>
              )}
            </div>
            <p className={styles.indexCardSubtitle}>{s.manifest.subtitle}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
