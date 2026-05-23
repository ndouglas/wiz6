import { useEffect, useState } from 'react';
import { RECommentary } from '../components/RECommentary.js';
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
  compression: 'raw' | 'huffman';
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
        35 `.snd` files extracted from <code>original/sound??.snd</code>. Format is a 2-byte
        tree-size header + Huffman tree + 2-byte decoded-length prefix + MSB-first bitstream.
        Decoded samples are 8-bit unsigned PCM at a single engine-derived rate (~10 kHz). See{' '}
        <code>docs/re/snd-format.md</code>.
      </p>
      <RECommentary
        label="About the .snd format"
        intro="One of the more memorable debugging moments from this project — the decoder produced statistically-plausible output that sounded like white noise, because two bytes of misalignment cascaded through every Huffman tree walk."
        cardIds={['snd-format-bug-distribution']}
      />
      <table className={styles.table}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Source</th>
            <th>Compression</th>
            <th>Samples</th>
            <th>Duration</th>
            <th>Playback</th>
          </tr>
        </thead>
        <tbody>
          {metas.map((m) => (
            <tr key={m.id}>
              <td className={styles.id}>{m.id}</td>
              <td className={styles.mono}>{m.sourceFile}</td>
              <td>{m.compression}</td>
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
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
