import { useCallback, useEffect, useState } from 'react';
import { SOUND_TABLE, slotPlaybackRateHz, slotIsAliased, type SoundTableSlot } from '@wiz6/data';
import { RECommentary } from '../components/RECommentary.js';
import { loadSnd, playSnd, installAudioUnlockListener } from '../lib/audio.js';
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

/** Look up the engine sound-table entry for a given file ID. Handles both
 *  "13" and "sound13" forms — the extractor emits `id: "sound13"`. */
function slotForId(id: string): SoundTableSlot | undefined {
  const digits = id.replace(/\D+/g, '');
  if (!digits) return undefined;
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n)) return undefined;
  return SOUND_TABLE.find((s) => s.n === n);
}

export function SoundsPage() {
  const [metas, setMetas] = useState<SoundMeta[]>([]);

  useEffect(() => installAudioUnlockListener(), []);

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

  const playAtEngineRate = useCallback(async (id: string) => {
    // `id` from JSON is "sound04" or similar — strip the prefix to get just
    // the digits, then build the URL with the bare digit form the files use.
    const digits = id.replace(/\D+/g, '');
    if (!digits) return;
    const slotN = parseInt(digits, 10);
    const snd = await loadSnd(`/sounds/sound${digits}.snd`, { slotN });
    if (snd) playSnd(snd);
  }, []);

  return (
    <main className={styles.page}>
      <h1>Sounds</h1>
      <p className={styles.lede}>
        35 <code>.snd</code> files extracted from <code>original/sound??.snd</code>. Format is a 2-byte
        tree-size header + Huffman tree + 2-byte decoded-length prefix + MSB-first bitstream.
        Decoded samples are 8-bit unsigned PCM. The default Playback column plays at the global
        sample rate (~10026 Hz); the engine plays each slot at its own rate, derived from the
        runtime sound-table&apos;s <code>duration</code> field (PIT counter divisor) — captured live
        from a running game state via the DOSBox-X MCP. Try the &quot;engine rate&quot; button to hear
        the difference, most noticeable on slots 5, 13, 11, 12.
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
            <th>Duration (default)</th>
            <th>Engine rate</th>
            <th>Playback</th>
          </tr>
        </thead>
        <tbody>
          {metas.map((m) => {
            const slot = slotForId(m.id);
            const inTable = slot !== undefined;
            const engineRate = inTable ? Math.round(slotPlaybackRateHz(slot.n)) : null;
            const aliased = inTable && slotIsAliased(slot.n);
            const engineDur = inTable && engineRate ? m.sampleCount / engineRate : null;
            return (
              <tr key={m.id}>
                <td className={styles.id}>
                  {m.id}
                  {aliased && (
                    <span className={styles.aliasTag} title={`Engine redirects slot ${slot.n} → slot ${slot.alias_id}`}>
                      → {slot.alias_id}
                    </span>
                  )}
                </td>
                <td className={styles.mono}>{m.sourceFile}</td>
                <td>{m.compression}</td>
                <td className={styles.num}>{m.sampleCount.toLocaleString()}</td>
                <td className={styles.num}>
                  {(m.sampleCount / m.sampleRateHz).toFixed(2)}s
                  {engineDur !== null && Math.abs(engineDur - m.sampleCount / m.sampleRateHz) > 0.05 && (
                    <div className={styles.dim}>engine: {engineDur.toFixed(2)}s</div>
                  )}
                </td>
                <td className={styles.num}>
                  {engineRate !== null ? `${engineRate.toLocaleString()} Hz` : <span className={styles.dim}>—</span>}
                </td>
                <td>
                  <div className={styles.playCell}>
                    <audio
                      controls
                      src={`/sounds/${m.id}.wav`}
                      preload="none"
                      className={styles.audio}
                    />
                    {inTable && (
                      <button
                        type="button"
                        className={styles.engineBtn}
                        onClick={() => playAtEngineRate(m.id)}
                        title={`Play at engine rate ${engineRate} Hz (slot duration=0x${slot.duration.toString(16)})`}
                      >
                        ▶ engine rate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={styles.note}>
        Engine rates come from <code>SOUND_TABLE</code> in <code>@wiz6/data/sound-table.ts</code>, a
        snapshot of <code>DGROUP 0x3344</code> captured via the DOSBox-X MCP server. Slots 15+ are
        not in the engine's table — they're files that ship with the game but get loaded via
        different code paths. The orange <code>→ N</code> tag on a slot means the engine redirects
        it to another slot's buffer via the <code>alias_id</code> field (e.g. slot 9 → slot 8).
      </p>
    </main>
  );
}
