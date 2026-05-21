import { useEffect } from 'react';

type Handler = (event: KeyboardEvent) => void;
type Handlers = Record<string, Handler>;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useKeyboardShortcuts(handlers: Handlers): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditable(e.target) && e.key !== 'Escape') return;
      const fn = handlers[e.key];
      if (fn) {
        fn(e);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers]);
}
