import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PicSchema, WIZ6_DUNGEON } from '@wiz6/data';
import { renderPicDescriptor, concatenatePicSegments } from '@wiz6/parser';
import { PicCanvas } from '../../components/PicCanvas.js';
import styles from './PicsIndex.module.css';

const PIC_NAMES = [
  'credits',
  ...Array.from({ length: 59 }, (_, i) => `mon${i.toString().padStart(2, '0')}`),
];

interface Summary {
  id: string;
  segmentCount: number;
  descriptorCount: number;
  totalBytes: number;
  thumbnail?: { width: number; height: number; rgba: Uint8ClampedArray };
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
            results.push({ id: name, segmentCount: 0, descriptorCount: 0, totalBytes: 0, error: 'not extracted' });
            continue;
          }
          const pic = PicSchema.parse(JSON.parse(text));
          const decoded = concatenatePicSegments(pic.segments);
          const firstDesc = pic.descriptors[0];
          const summary: Summary = {
            id: name,
            segmentCount: pic.segments.length,
            descriptorCount: pic.descriptors.length,
            totalBytes: pic.totalBytes,
          };
          if (firstDesc) {
            summary.thumbnail = renderPicDescriptor(firstDesc, decoded, WIZ6_DUNGEON);
          }
          results.push(summary);
        } catch (err) {
          results.push({
            id: name,
            segmentCount: 0,
            descriptorCount: 0,
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
        Every <code>.pic</code> sprite, rendered as actual EGA pixels.
        Click a card to see all sprite views (descriptors), the segment
        structure, and raw byte data.
      </p>
      <div className={styles.grid}>
        {summaries.map((s) => (
          <Link key={s.id} className={styles.card} to={`/explore/pics/${s.id}`}>
            <div className={styles.cardThumb}>
              {s.thumbnail ? (
                <PicCanvas
                  width={s.thumbnail.width}
                  height={s.thumbnail.height}
                  rgba={s.thumbnail.rgba}
                  scale={Math.max(1, Math.floor(Math.min(96 / s.thumbnail.width, 96 / s.thumbnail.height)))}
                  showTransparencyBg={false}
                />
              ) : (
                <span className={styles.cardMeta}>{s.error ?? 'no sprite'}</span>
              )}
            </div>
            <div className={styles.cardName}>{s.id}</div>
            <div className={styles.cardMeta}>
              {s.descriptorCount} sprite{s.descriptorCount === 1 ? '' : 's'} · {s.totalBytes.toLocaleString()}B
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
