interface KeyboardHelpProps {
  open: boolean;
  onClose: () => void;
}

const ENTRIES: { keys: string; label: string }[] = [
  { keys: '↑ / ↓', label: 'previous / next monster' },
  { keys: '1', label: 'overview tab' },
  { keys: '2', label: 'attacks tab' },
  { keys: '3', label: 'saves & resistances tab' },
  { keys: '/', label: 'focus search' },
  { keys: '?', label: 'this help' },
  { keys: 'Esc', label: 'close help' },
];

export function KeyboardHelp({ open, onClose }: KeyboardHelpProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="keyboard shortcuts"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-strong)',
          padding: 'var(--space-5)',
          borderRadius: 4,
          minWidth: 320,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Keyboard shortcuts</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ENTRIES.map((e) => (
            <li
              key={e.keys}
              style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  minWidth: 80,
                  color: 'var(--color-accent)',
                }}
              >
                {e.keys}
              </span>
              <span>{e.label}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 'var(--space-4)',
            padding: 'var(--space-1) var(--space-3)',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          close
        </button>
      </div>
    </div>
  );
}
