/**
 * Window layer — locate the DOSBox-X window, bring it to front, and restore
 * prior focus around an operation. All operations go through the Swift helper.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import type { HelperClient } from './helper-client.js';

/** App-name substring the helper matches (case-insensitive). */
export const DOSBOX_APP_NAME = 'dosbox-x';

/**
 * Run `body` with the DOSBox-X window focused. On entry: capture the current
 * frontmost app, find the DOSBox-X window, focus it. On exit (success or
 * error): restore the prior frontmost app.
 *
 * Throws an actionable error if DOSBox-X isn't running or its window isn't
 * findable.
 */
export async function withFocusedDosbox<T>(
  client: HelperClient,
  body: () => Promise<T>,
): Promise<T> {
  const fm = await client.send({ op: 'getFrontmost' });
  if (!fm.ok) throw new Error(`withFocusedDosbox: getFrontmost failed: ${fm.error ?? '?'}`);
  const priorBundle = fm.bundleId;
  const fw = await client.send({ op: 'findWindow', appName: DOSBOX_APP_NAME });
  if (!fw.ok || fw.windowId === undefined) {
    throw new Error(
      `DOSBox-X not running or window not visible — call dosbox_launch first, or un-minimize the window.`,
    );
  }
  const focus = await client.send({ op: 'focusWindow', windowId: fw.windowId });
  if (!focus.ok) throw new Error(`withFocusedDosbox: focusWindow failed: ${focus.error ?? '?'}`);
  try {
    return await body();
  } finally {
    if (priorBundle !== undefined) {
      // Best-effort restore; don't mask body errors.
      await client.send({ op: 'restoreFrontmost', bundleId: priorBundle }).catch(() => {});
    }
  }
}
