import { useEffect, useState } from 'react';
import { isMuted, setMuted, subscribeMuted } from '../lib/audio.js';

/**
 * Floating mute toggle. The web port doesn't need the original game's
 * GAME CONFIGURATION menu (audio-device pickers, etc.) — Web Audio handles
 * output and the only thing a player needs to control is whether sound
 * plays at all. State is persisted to localStorage at `wiz6:mute`.
 */
export function MuteToggle() {
  const [m, setM] = useState(isMuted());
  useEffect(() => subscribeMuted(setM), []);
  return (
    <button
      type="button"
      aria-label={m ? 'Unmute' : 'Mute'}
      aria-pressed={m}
      title={m ? 'Sound muted — click to unmute' : 'Click to mute sound'}
      onClick={() => setMuted(!m)}
      style={{
        position: 'fixed',
        bottom: 'var(--space-3, 12px)',
        right: 'var(--space-3, 12px)',
        zIndex: 1000,
        padding: '6px 10px',
        borderRadius: 4,
        border: '1px solid var(--color-border, #444)',
        background: 'var(--color-surface, #1a1a1a)',
        color: 'var(--color-text, #ddd)',
        cursor: 'pointer',
        fontSize: 11,
        fontFamily: 'var(--font-mono, monospace)',
        letterSpacing: '0.05em',
      }}
    >
      {m ? 'MUTED' : 'SOUND'}
    </button>
  );
}
