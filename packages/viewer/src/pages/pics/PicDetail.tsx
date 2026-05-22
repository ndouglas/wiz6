import { Link, useParams } from 'react-router-dom';
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

  if (loading) return <p className={styles.detailWrapper}>loading…</p>;
  if (error)
    return (
      <main className={styles.detailWrapper}>
        <Link to="/pics" className={styles.backLink}>
          ← back to pics
        </Link>
        <div className={styles.error}>{error.message}</div>
      </main>
    );
  if (!data) return null;

  return (
    <main className={styles.detailWrapper}>
      <Link to="/pics" className={styles.backLink}>
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
            <th>header</th>
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
                {seg.header ? (
                  <>
                    <span>pos 0x{seg.header.pos.toString(16).padStart(4, '0')}</span>
                    {' · '}
                    <span>{`${seg.header.width} × ${seg.header.height}`}</span>
                  </>
                ) : (
                  <span className={styles.noHeader}>no header</span>
                )}
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
    </main>
  );
}
