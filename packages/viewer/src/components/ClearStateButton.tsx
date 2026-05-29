/**
 * Floating debug button that wipes wiz6:* localStorage keys and reloads.
 *
 * Useful when stale state from prior testing produces "impossible" UI
 * (party at the 6-member cap so ADD bounces, DISMISS visible with no
 * apparent party because members exist in storage, etc.). Confirms before
 * wiping so a stray click doesn't blow away a real roster.
 *
 * Only the project's own keys are cleared — no other origin data is touched.
 */
export function ClearStateButton() {
  function clearAll(): void {
    if (typeof window === 'undefined') return;
    const ok = window.confirm(
      'Clear all wiz6 local data?\n\n' +
        'This wipes:\n' +
        '  • your roster of created characters\n' +
        '  • the currently-loaded active party\n' +
        '  • house-rules toggles and mute setting\n\n' +
        'The page will reload. This cannot be undone.',
    );
    if (!ok) return;
    const keysToClear: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('wiz6:')) keysToClear.push(key);
    }
    for (const key of keysToClear) window.localStorage.removeItem(key);
    window.location.reload();
  }

  return (
    <button
      type="button"
      aria-label="Clear local data"
      title="Debug: wipe wiz6 localStorage (roster, active party, settings) and reload"
      onClick={clearAll}
      style={{
        position: 'fixed',
        bottom: 'var(--space-3, 12px)',
        right: 'calc(var(--space-3, 12px) + 168px)',
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
      CLEAR
    </button>
  );
}
