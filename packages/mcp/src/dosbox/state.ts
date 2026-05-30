/**
 * State layer — save/load DOSBox-X state to/from a specific slot. Uses
 * DOSBox-X's built-in key chords:
 *   - Ctrl+F4: cycle through save-state slots (one slot advance per press).
 *   - Ctrl+F5: save state to current slot.
 *   - Ctrl+F6: load state from current slot.
 *
 * NOTE: These chords are the stock DOSBox-X defaults. If they differ on a
 * given user's DOSBox-X build, the user can rebind them via the Mapper Editor
 * and update SAVE_KEY / LOAD_KEY / CYCLE_KEY in this file. See PERMISSIONS.md.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { withFocusedDosbox } from './window.js';
import { sendKey } from './input.js';
import type { HelperClient } from './helper-client.js';

const MIN_SLOT = 0;
const MAX_SLOT = 9;

const CYCLE_KEY = 'Ctrl+F4';
const SAVE_KEY = 'Ctrl+F5';
const LOAD_KEY = 'Ctrl+F6';

export interface StateOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

function validateSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < MIN_SLOT || slot > MAX_SLOT) {
    throw new Error(`saveStateToSlot/loadStateFromSlot: slot must be integer ${MIN_SLOT}..${MAX_SLOT}, got ${slot}`);
  }
}

async function cycleToSlot(client: HelperClient, slot: number): Promise<void> {
  for (let i = 0; i <= slot; i++) {
    await sendKey(client, CYCLE_KEY);
    await new Promise((r) => setTimeout(r, 30));
  }
}

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
      `DOSBox-X did not save state to slot ${slot} (expected ${savePath} mtime to advance). The save chord ${SAVE_KEY} may differ on this DOSBox-X version — check the Mapper Editor.`,
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
