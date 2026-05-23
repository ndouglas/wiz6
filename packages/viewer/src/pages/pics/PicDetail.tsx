import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { WIZ6_DUNGEON } from '@wiz6/data';
import { renderPicDescriptor, concatenatePicSegments } from '@wiz6/parser';
import { PicCanvas } from '../../components/PicCanvas.js';
import { usePic } from '../../lib/hooks/usePic.js';
import styles from './PicsIndex.module.css';

function toHex(b: number): string {
  return b.toString(16).padStart(2, '0');
}

function bytesHex(bs: readonly number[], max = 32): string {
  const slice = bs.slice(0, max).map(toHex).join(' ');
  return bs.length > max ? `${slice} … (+${bs.length - max} more)` : slice;
}

export function PicDetail() {
  const { name } = useParams<{ name: string }>();
  const { data, loading, error } = usePic(name ?? null);

  const decodedBuffer = useMemo(
    () => (data ? concatenatePicSegments(data.segments) : []),
    [data],
  );
  const rendered = useMemo(
    () => (data ? data.descriptors.map((d) => renderPicDescriptor(d, decodedBuffer, WIZ6_DUNGEON)) : []),
    [data, decodedBuffer],
  );

  if (loading) return <p className={styles.detailWrapper}>loading…</p>;
  if (error)
    return (
      <main className={styles.detailWrapper}>
        <Link to="/explore/pics" className={styles.backLink}>
          ← back to pics
        </Link>
        <div className={styles.error}>{error.message}</div>
      </main>
    );
  if (!data) return null;

  return (
    <main className={styles.detailWrapper}>
      <Link to="/explore/pics" className={styles.backLink}>
        ← back to pics
      </Link>
      <h1>{data.id}</h1>
      <p className={styles.summary}>
        {data.segments.length.toLocaleString()} segments · {data.totalBytes.toLocaleString()} bytes
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>encoded</th>
            <th>ops</th>
            <th>decoded len</th>
            <th>decoded bytes (hex)</th>
          </tr>
        </thead>
        <tbody>
          {data.segments.map((seg) => (
            <tr key={seg.segmentIndex}>
              <td>{seg.segmentIndex}</td>
              <td>
                @{seg.encodedOffset.toLocaleString()} · {seg.encodedLength}B
              </td>
              <td>
                {seg.ops
                  .map((o) =>
                    o.type === 'lit'
                      ? `L${o.bytes.length}`
                      : `R${o.count}×${toHex(o.fillByte)}`,
                  )
                  .join(' ')}
              </td>
              <td>{seg.decodedBytes.length}</td>
              <td className={styles.decodedHex}>{bytesHex(seg.decodedBytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 style={{ marginTop: 'var(--space-5)' }}>Sprites ({data.descriptors.length})</h2>
      <div className={styles.gallery}>
        {data.descriptors.map((d, i) => {
          const r = rendered[i];
          if (!r) return null;
          return (
            <div key={d.index} className={styles.galleryItem}>
              <PicCanvas width={r.width} height={r.height} rgba={r.rgba} scale={2} />
              <div className={styles.galleryLabel}>
                #{d.index} · {r.width}×{r.height}px
              </div>
            </div>
          );
        })}
      </div>
      <h2 style={{ marginTop: 'var(--space-5)' }}>Descriptors ({data.descriptors.length})</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>pos</th>
            <th>W × H (cells)</th>
            <th>W × H (px)</th>
            <th>populated cells</th>
            <th>mask (hex)</th>
          </tr>
        </thead>
        <tbody>
          {data.descriptors.map((d) => {
            const cellCount = d.width * d.height;
            let populated = 0;
            for (let i = 0; i < cellCount; i++) {
              const byte = d.mask[i >> 3] ?? 0;
              if ((byte >> (i & 7)) & 1) populated++;
            }
            const maskHex = d.mask.map((b) => b.toString(16).padStart(2, '0')).join(' ');
            return (
              <tr key={d.index}>
                <td>{d.index}</td>
                <td>0x{d.pos.toString(16).padStart(4, '0')}</td>
                <td>{d.width} × {d.height}</td>
                <td>{d.width * 8} × {d.height * 8}</td>
                <td>{populated} / {cellCount}</td>
                <td className={styles.decodedHex}>{maskHex}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
