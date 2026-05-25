import { Link } from 'react-router-dom';

/**
 * Floating link to the /settings page (house rules + QoL toggles). Mirrors
 * the styling of MuteToggle and sits next to it in the bottom-right corner.
 */
export function SettingsLink() {
  return (
    <Link
      to="/settings"
      aria-label="House rules"
      title="House rules — engine fidelity + QoL toggles"
      style={{
        position: 'fixed',
        bottom: 'var(--space-3, 12px)',
        right: 'calc(var(--space-3, 12px) + 84px)',
        zIndex: 1000,
        padding: '6px 10px',
        borderRadius: 4,
        border: '1px solid var(--color-border, #444)',
        background: 'var(--color-surface, #1a1a1a)',
        color: 'var(--color-text, #ddd)',
        textDecoration: 'none',
        fontSize: 11,
        fontFamily: 'var(--font-mono, monospace)',
        letterSpacing: '0.05em',
      }}
    >
      RULES
    </Link>
  );
}
