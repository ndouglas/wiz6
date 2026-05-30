/**
 * Window layer — locate the DOSBox-X window and bring it to the front. All
 * operations go through the Swift helper.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import type { HelperClient } from './helper-client.js';

/** App-name substring the helper matches (case-insensitive). */
export const DOSBOX_APP_NAME = 'dosbox-x';

/**
 * Run `body` with the DOSBox-X window focused, and LEAVE it frontmost.
 *
 * We deliberately do NOT restore the previously-frontmost app. The driving
 * tools (send_input / screenshot / save_state) require DOSBox to stay frontmost:
 * macOS delivers synthetic key events only to the frontmost window, and
 * restoring focus to the prior app (e.g. the editor) after each call both
 *   (a) drops guest keys the emulator hasn't finished processing, and
 *   (b) causes a visible DOSBox<->editor focus flicker.
 * Leaving DOSBox frontmost keeps driving reliable; the user clicks back to
 * their own app when finished. `focusWindow` force-frontmosts via the
 * Accessibility API (see Window.swift), so this is reliable even when another
 * app currently holds focus.
 *
 * Throws an actionable error if DOSBox-X isn't running or its window isn't findable.
 */
export async function withFocusedDosbox<T>(
  client: HelperClient,
  body: () => Promise<T>,
): Promise<T> {
  const fw = await client.send({ op: 'findWindow', appName: DOSBOX_APP_NAME });
  if (!fw.ok || fw.windowId === undefined) {
    throw new Error(
      `DOSBox-X not running or window not visible — call dosbox_launch first, or un-minimize the window.`,
    );
  }
  const focus = await client.send({ op: 'focusWindow', windowId: fw.windowId });
  if (!focus.ok) throw new Error(`withFocusedDosbox: focusWindow failed: ${focus.error ?? '?'}`);
  return await body();
}
