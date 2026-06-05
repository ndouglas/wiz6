/**
 * newgame-oracle.ts — pure helper for the START-NEW-GAME framebuffer oracle.
 *
 * The 5 scripted entry frames use committed engine pixels for the dungeon
 * viewport (MAZE_VIEWPORT, 176×112) because the gate geometry cannot be
 * rendered byte-exact from decoded assets (banked tile atlas). The oracle
 * short-circuits to the committed bytes for exactly those frames.
 *
 * This module is ISOMORPHIC — no node:* imports, safe for browser bundling.
 */

import type { EntryMode } from './entry-sequence.js';

/** The gy values that map to a committed oracle viewport. */
const ORACLE_GYS = new Set<number>([117, 118, 119, 120, 121]);

/**
 * Record mapping gy (as number) to a 176×112 palette-index buffer (Uint8Array).
 * Produced by `loadNewgameViewports()` in the viewer's data-loader.
 */
export type NewgameViewports = Record<number, Uint8Array>;

/**
 * oracleViewportForGy — return the 176×112 index buffer for a scripted frame, or
 * null if gy is not in the committed oracle set or viewports were not loaded.
 *
 * Callers SHOULD pass `session.entryMode` so the oracle is only used during the
 * scripted sequence (entryMode !== 'free'). Returns null in 'free' mode even if
 * gy happens to equal one of the oracle keys (avoids oracle bleed into free-roam
 * after the party wraps around, unlikely but safe).
 *
 * @param viewports  Loaded oracle viewports (or null if not yet loaded).
 * @param gy         Current party gy.
 * @param entryMode  Current entry FSM mode — pass session.entryMode.
 */
export function oracleViewportForGy(
  viewports: NewgameViewports | null,
  gy: number,
  entryMode: EntryMode,
): Uint8Array | null {
  if (entryMode === 'free') return null;
  if (viewports === null) return null;
  if (!ORACLE_GYS.has(gy)) return null;
  return viewports[gy] ?? null;
}
