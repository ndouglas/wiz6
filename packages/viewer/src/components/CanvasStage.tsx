/**
 * CanvasStage — the shared centered frame for a game screen's 320x200 canvas.
 *
 * The creation flow centers its canvas via CreationPage's .page/.canvasWrap;
 * the castle screens (CharacterViewPage, AddPartyPage, the PartyMemberPicker
 * pages) historically rendered a bare <main>/<canvas> and so sat left-aligned.
 * This wraps any screen's canvas in the identical centered frame so all screens
 * center consistently. (Parity/e2e read the canvas BUFFER, not its page
 * position, so layout bugs like off-center screens are invisible to them.)
 */
import type { ReactNode } from 'react';
import styles from './CanvasStage.module.css';

export function CanvasStage({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <main className={styles.page} aria-label={label}>
      <div className={styles.canvasWrap}>{children}</div>
    </main>
  );
}
