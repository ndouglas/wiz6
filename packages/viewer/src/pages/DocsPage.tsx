import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { marked } from 'marked';
import styles from './DocsPage.module.css';

interface DocEntry {
  path: string;
  title: string;
  bytes: number;
}

interface DocManifest {
  entries: DocEntry[];
}

/**
 * Split a title on backticks and wrap the odd segments in <code>. Without
 * this, the sidebar shows literal backtick characters around filenames like
 * `titlepag.ega` because the title comes from the markdown H1, which often
 * uses inline-code formatting on filename mentions.
 *
 * Unbalanced backticks (rare; our doc titles control this) produce a trailing
 * <code> with whatever remains, which is harmless visually.
 */
function renderTitleWithBackticks(title: string): React.ReactNode {
  const parts = title.split('`');
  if (parts.length === 1) return title;
  return parts.map((part, i) =>
    i % 2 === 0 ? part : <code key={i} className={styles.entryCode}>{part}</code>,
  );
}

export function DocsPage() {
  const { '*': rawPath } = useParams<{ '*': string }>();
  const docPath = rawPath ?? '';
  const [manifest, setManifest] = useState<DocManifest | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/docs/manifest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((m: DocManifest | null) => {
        if (!cancelled && m) setManifest(m);
      })
      .catch(() => {
        /* swallow */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!docPath) {
      setContent(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setContent(null);
    setError(null);
    fetch(`/docs/${docPath}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        if (text.trimStart().startsWith('<')) {
          throw new Error('got HTML — file may not exist');
        }
        setContent(text);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [docPath]);

  const html = useMemo(() => {
    if (!content) return '';
    return marked.parse(content, { async: false }) as string;
  }, [content]);

  // Group manifest entries by top-level dir for the sidebar. Files at the
  // root of the doc tree go in a group called 're notes' (the docs are now
  // sourced from docs/re/, so the root entries are the main RE notes).
  const grouped = useMemo(() => {
    if (!manifest) return {} as Record<string, DocEntry[]>;
    const out: Record<string, DocEntry[]> = {};
    for (const e of manifest.entries) {
      const slash = e.path.indexOf('/');
      const group = slash > 0 ? e.path.slice(0, slash) : 're notes';
      (out[group] ??= []).push(e);
    }
    return out;
  }, [manifest]);

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar} aria-label="Doc index">
        <h2 className={styles.sidebarHeading}>Docs</h2>
        {!manifest && <p className={styles.dim}>loading…</p>}
        {manifest &&
          Object.keys(grouped)
            .sort()
            .map((group) => (
              <section key={group} className={styles.group}>
                <h3 className={styles.groupHeading}>{group}</h3>
                <ul className={styles.entryList}>
                  {grouped[group]!.map((e) => {
                    const active = e.path === docPath;
                    return (
                      <li key={e.path}>
                        <Link
                          to={`/explore/docs/${e.path}`}
                          className={active ? `${styles.entry} ${styles.entryActive}` : styles.entry}
                        >
                          {renderTitleWithBackticks(e.title)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
      </aside>
      <article className={styles.article}>
        {!docPath && (
          <div className={styles.placeholder}>
            <h1>Wiz6 documentation</h1>
            <p>
              {manifest
                ? `${manifest.entries.length} markdown files. Pick one from the sidebar.`
                : 'Loading manifest…'}
            </p>
          </div>
        )}
        {docPath && error && (
          <div className={styles.error}>
            <p>Failed to load <code>{docPath}</code>: {error}</p>
            <p>
              <Link to="/explore/docs">← back to index</Link>
            </p>
          </div>
        )}
        {docPath && content && (
          <div
            className={styles.markdown}
            // The docs are committed in our own repo; we control the input.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </article>
    </main>
  );
}
