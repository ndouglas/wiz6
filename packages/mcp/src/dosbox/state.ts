/**
 * State layer — save/load DOSBox-X state to/from a specific slot.
 *
 * DOSBox-X is driven via a custom SDL2 mapper file
 * (tools/dosbox/mapper-wiz6.map, wired in via `mapperfile_sdl2`) that rebinds
 * the save-state actions to BARE single keys — no F12 host-key chord. Synthetic
 * held-modifier chords proved unreliable on macOS (they intermittently drop the
 * action); single unmodified keypresses are reliable. The bindings:
 *
 *   - F5 : save state to active slot   (hand_savestate)
 *   - F6 : load state from active slot (hand_loadstate)
 *   - F8 : cycle to next slot          (hand_nextslot)
 *   - F7 : cycle to previous slot      (hand_prevslot)
 *
 * Direct-slot selection does NOT exist — navigate to the target slot via the
 * cycle keys, then save/load. NOTE: DOSBox-X must be the frontmost window for
 * synthetic key events to reach it (macOS focus-stealing prevention); the
 * caller must ensure focus before driving.
 *
 * DOSBox-X starts on **slot 1** (1-indexed; default from `saveslot = 1` in
 * the [dosbox] config section) and prints `Active save slot: 1 [Empty]` at
 * startup. Slots wrap from 10 back to 1.
 *
 * Slot-pointer tracking: we keep a module-level `currentSlot` so subsequent
 * saveStateToSlot/loadStateFromSlot calls cycle the minimum number of steps
 * (the old "cycle N+1 times" loop assumed slot 0 and was wrong on the second
 * call). The pointer can desync if the user touches the DOSBox-X menu — call
 * `resetSlotTracking()` after `dosbox_launch` (or any user-initiated slot
 * change) to re-anchor.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { withFocusedDosbox } from './window.js';
import { sendKey } from './input.js';
import type { HelperClient } from './helper-client.js';

const MIN_SLOT = 1;
const MAX_SLOT = 10;

const NEXT_SLOT_KEY = 'F8';
const PREV_SLOT_KEY = 'F7';
const SAVE_KEY = 'F5';
const LOAD_KEY = 'F6';

const SLOT_COUNT = MAX_SLOT - MIN_SLOT + 1;

/**
 * Module-level tracking of DOSBox-X's active save slot. Matches the emulator's
 * 1-indexed numbering and its startup default of slot 1.
 */
let currentSlot = MIN_SLOT;

/**
 * Re-anchor the tracked slot. Call after `dosbox_launch` (which re-reads
 * `saveslot=` from config and resets to that slot) or after any operation
 * that may have moved the slot outside our control.
 */
export function resetSlotTracking(slot: number = MIN_SLOT): void {
  if (!Number.isInteger(slot) || slot < MIN_SLOT || slot > MAX_SLOT) {
    throw new Error(`resetSlotTracking: slot must be integer ${MIN_SLOT}..${MAX_SLOT}, got ${slot}`);
  }
  currentSlot = slot;
}

/** Currently-tracked slot. Exposed for tests/diagnostics. */
export function getTrackedSlot(): number {
  return currentSlot;
}

export interface StateOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

function validateSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < MIN_SLOT || slot > MAX_SLOT) {
    throw new Error(`saveStateToSlot/loadStateFromSlot: slot must be integer ${MIN_SLOT}..${MAX_SLOT}, got ${slot}`);
  }
}

/**
 * Cycle from `currentSlot` to `targetSlot` using the minimum number of
 * presses, choosing the shorter direction around the 10-slot ring. On
 * success, `currentSlot` is updated to `targetSlot`.
 */
async function cycleToSlot(client: HelperClient, targetSlot: number): Promise<void> {
  if (targetSlot === currentSlot) return;
  // Forward and backward distances around the 10-slot ring.
  const forward = (targetSlot - currentSlot + SLOT_COUNT) % SLOT_COUNT;
  const backward = (currentSlot - targetSlot + SLOT_COUNT) % SLOT_COUNT;
  const useForward = forward <= backward;
  const steps = useForward ? forward : backward;
  const key = useForward ? NEXT_SLOT_KEY : PREV_SLOT_KEY;
  for (let i = 0; i < steps; i++) {
    await sendKey(client, key);
    await new Promise((r) => setTimeout(r, 30));
  }
  currentSlot = targetSlot;
}

/**
 * Save DOSBox-X state to a numbered slot file (`{saveDir}/{slot}.sav`).
 *
 * The save file numbering on disk matches DOSBox-X's slot numbers (1..10).
 * Waits for the file's mtime to advance before returning; throws an actionable
 * error on timeout.
 */
export async function saveStateToSlot(
  client: HelperClient,
  slot: number,
  saveDir: string,
  opts: StateOptions = {},
): Promise<void> {
  validateSlot(slot);
  const pollIntervalMs = opts.pollIntervalMs ?? 50;
  const timeoutMs = opts.timeoutMs ?? 2000;
  const savePath = join(saveDir, `${slot}.sav`);
  const sinceMs = existsSync(savePath) ? statSync(savePath).mtimeMs : 0;
  await withFocusedDosbox(client, async () => {
    await cycleToSlot(client, slot);
    await sendKey(client, SAVE_KEY);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (existsSync(savePath) && statSync(savePath).mtimeMs > sinceMs) return;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(
      `DOSBox-X did not save state to slot ${slot} (expected ${savePath} mtime to advance). ` +
        `The save chord ${SAVE_KEY} may differ on this DOSBox-X version — check the Capture menu ` +
        `(Capture → Save state) for the actual binding.`,
    );
  });
}

export async function loadStateFromSlot(
  client: HelperClient,
  slot: number,
): Promise<void> {
  validateSlot(slot);
  await withFocusedDosbox(client, async () => {
    await cycleToSlot(client, slot);
    await sendKey(client, LOAD_KEY);
  });
}
