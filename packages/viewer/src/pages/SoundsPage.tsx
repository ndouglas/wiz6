import { useEffect, useState } from 'react';
import styles from './SoundsPage.module.css';

const SOUND_IDS = [
  '00', '02', '03', '04', '05', '06', '07', '08',
  '10', '11', '12', '13', '14', '15', '16', '17',
  '20', '21', '22', '23', '24', '25', '26', '27', '28', '29',
  '30', '31', '32', '33', '34', '35', '36', '37', '38',
];

interface SoundMeta {
  id: string;
  sourceFile: string;
  compression: 'raw' | 'huffman' | 'unknown';
  rateDivisor: number | null;
  sampleCount: number;
  sampleRateHz: number;
}

export function SoundsPage() {
  const [metas, setMetas] = useState<SoundMeta[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      SOUND_IDS.map(async (id): Promise<SoundMeta | null> => {
        try {
          const res = await fetch(`/sounds/sound${id}.json`);
          if (!res.ok) return null;
          return (await res.json()) as SoundMeta;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setMetas(results.filter((m): m is SoundMeta => m !== null));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.page}>
      <h1>Sounds</h1>
      <p className={styles.lede}>
        35 `.snd` files extracted from <code>original/sound??.snd</code>. Format is a 4-byte
        header + Huffman tree + bitstream of indices that map through a log-attenuation LUT to
        amplitude values. See <code>docs/re/snd-format.md</code>. Each row shows the decoded
        metadata; both columns play the same data — <strong>LUT</strong> applies the engine&apos;s
        log-attenuation table (linear PCM amplitude — what you should hear),{' '}
        <strong>raw</strong> plays the sample bytes directly (what we tried first; sounds like
        noise because the bytes are log-quantized loudness indices, not waveform amplitudes).
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Source</th>
            <th>Compression</th>
            <th>Rate</th>
            <th>Samples</th>
            <th>Duration</th>
            <th>LUT (linear)</th>
            <th>Raw bytes</th>
          </tr>
        </thead>
        <tbody>
          {metas.map((m) => (
            <tr key={m.id}>
              <td className={styles.id}>{m.id}</td>
              <td className={styles.mono}>{m.sourceFile}</td>
              <td className={m.compression === 'unknown' ? styles.warn : undefined}>
                {m.compression}
              </td>
              <td className={styles.mono}>
                {m.sampleRateHz} Hz{' '}
                <span className={styles.dim}>
                  ({m.rateDivisor === null ? 'default' : `div ${m.rateDivisor}`})
                </span>
              </td>
              <td className={styles.num}>{m.sampleCount.toLocaleString()}</td>
              <td className={styles.num}>{(m.sampleCount / m.sampleRateHz).toFixed(2)}s</td>
              <td>
                <audio
                  controls
                  src={`/sounds/${m.id}.wav`}
                  preload="none"
                  className={styles.audio}
                />
              </td>
              <td>
                <audio
                  controls
                  src={`/sounds/${m.id}.raw.wav`}
                  preload="none"
                  className={styles.audio}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.note}>
        4 files (sound28, 30, 32, 35) are flagged <strong>unknown</strong>: their headers have
        tree_size=0 but rate_word values that aren&apos;t plausible PIT divisors (21183, 25469,
        12605, 32896). The format spec wrongly called them &quot;raw PCM&quot;; their actual
        encoding is TBD. Both columns play their raw bytes since LUT-mapping doesn&apos;t apply.
      </p>
    </main>
  );
}
