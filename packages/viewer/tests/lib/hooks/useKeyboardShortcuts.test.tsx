import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useKeyboardShortcuts } from '../../../src/lib/hooks/useKeyboardShortcuts.js';

function HookProbe({ handlers }: { handlers: Record<string, () => void> }) {
  useKeyboardShortcuts(handlers);
  return <div data-testid="probe" />;
}

describe('useKeyboardShortcuts', () => {
  it('calls handler for matching key', () => {
    const fn = vi.fn();
    render(<HookProbe handlers={{ a: fn }} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not fire when target is an input', () => {
    const fn = vi.fn();
    render(
      <>
        <input data-testid="input" />
        <HookProbe handlers={{ a: fn }} />
      </>,
    );
    const input = document.querySelector('[data-testid="input"]') as HTMLInputElement;
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(fn).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount', () => {
    const fn = vi.fn();
    const { unmount } = render(<HookProbe handlers={{ a: fn }} />);
    unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(fn).not.toHaveBeenCalled();
  });

  it('multiple keys can map to different handlers', () => {
    const fnA = vi.fn();
    const fnB = vi.fn();
    render(<HookProbe handlers={{ a: fnA, b: fnB }} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    expect(fnA).toHaveBeenCalled();
    expect(fnB).toHaveBeenCalled();
  });
});
