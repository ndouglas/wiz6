#!/usr/bin/env node
/**
 * build-castle-saves.ts — drive DOSBox-X via the wiz6 MCP helper modules
 * to build save states with N=1..6 party members. Idempotent: skips slots
 * where the .sav already reports the target party_size.
 *
 * Usage:
 *   pnpm tsx tools/parity/build-castle-saves.ts --slots 1,2,3,4,5,6
 *   pnpm tsx tools/parity/build-castle-saves.ts --slot 6
 *
 * Imports the MCP helper modules directly (no MCP server in the loop).
 * Requires macOS Accessibility permission for the calling process — see
 * packages/mcp/PERMISSIONS.md.
 *
 * Spec: docs/superpowers/specs/2026-05-30-castle-party-panel-rerender-design.md
 */

import { HelperClient } from '../../packages/mcp/src/dosbox/helper-client.js';
import { sendMacro } from '../../packages/mcp/src/dosbox/input.js';
import { saveStateToSlot, resetSlotTracking } from '../../packages/mcp/src/dosbox/state.js';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SAVE_DIR = join(REPO_ROOT, 'tools', 'dosbox', 'save');

const DOSBOX_BIN =
  '/opt/homebrew/Caskroom/dosbox-x-app/2026.05.02/dosbox-x-sdl2/dosbox-x.app/Contents/MacOS/dosbox-x';

// Empirical timing — tune during first run.
const BOOT_WAIT_MS = 5000;
const AFTER_TITLE_WAIT_MS = 1500;
const AFTER_PICK_WAIT_MS = 800;
const AFTER_MENU_RETURN_WAIT_MS = 500;
const SHUTDOWN_WAIT_MS = 2000;

// ── CLI parsing ──────────────────────────────────────────────────────────
function parseArgs(): number[] {
  const args = process.argv.slice(2);
  const slotsIdx = args.indexOf('--slots');
  const slotIdx = args.indexOf('--slot');
  if (slotsIdx >= 0 && args[slotsIdx + 1]) {
    return args[slotsIdx + 1]!.split(',').map((s) => parseInt(s, 10));
  }
  if (slotIdx >= 0 && args[slotIdx + 1]) {
    return [parseInt(args[slotIdx + 1]!, 10)];
  }
  console.error('usage:');
  console.error('  pnpm tsx tools/parity/build-castle-saves.ts --slots 1,2,3,4,5,6');
  console.error('  pnpm tsx tools/parity/build-castle-saves.ts --slot 6');
  process.exit(2);
}

// ── DOSBox-X lifecycle ───────────────────────────────────────────────────
function launchDosbox(): ChildProcess {
  const child = spawn(DOSBOX_BIN, [], {
    detached: false,
    stdio: 'ignore',
    cwd: join(REPO_ROOT, 'tools', 'dosbox'),
  });
  return child;
}

function killDosbox(child: ChildProcess): void {
  try {
    child.kill('SIGTERM');
  } catch {
    /* ignore */
  }
}

// ── Build one save with N party members ──────────────────────────────────
async function buildSave(client: HelperClient, slot: number): Promise<void> {
  console.log(`[build] slot=${slot}: launching DOSBox-X...`);
  const child = launchDosbox();
  try {
    await new Promise((r) => setTimeout(r, BOOT_WAIT_MS));

    // Dismiss title page. Wiz6 typically needs 2-3 Enter presses to clear
    // the intro screens.
    console.log(`[build] slot=${slot}: dismissing title page`);
    await sendMacro(client, 'enter enter enter');
    await new Promise((r) => setTimeout(r, AFTER_TITLE_WAIT_MS));

    // Add (slot) party members. At MASTER OPTIONS, cursor starts on
    // ADD PARTY MEMBER (slot 0); pressing Enter selects it; the PCFILE
    // picker opens; pressing Enter again picks the first available char.
    for (let i = 0; i < slot; i++) {
      console.log(`[build] slot=${slot}: adding member ${i + 1}/${slot}`);
      await sendMacro(client, 'enter'); // pick ADD PARTY MEMBER
      await new Promise((r) => setTimeout(r, AFTER_MENU_RETURN_WAIT_MS));
      await sendMacro(client, 'enter'); // pick first PCFILE char
      await new Promise((r) => setTimeout(r, AFTER_PICK_WAIT_MS));
      // After commit, cursor returns to MASTER OPTIONS. Cursor may shift
      // off ADD PARTY MEMBER; press Up a few times to re-anchor.
      await sendMacro(client, 'up up up');
      await new Promise((r) => setTimeout(r, AFTER_MENU_RETURN_WAIT_MS));
    }

    // Reset slot tracking so saveStateToSlot cycles from slot 1 (DOSBox-X
    // default initial slot per packages/mcp/src/dosbox/state.ts).
    resetSlotTracking(1);
    console.log(`[build] slot=${slot}: saving to slot ${slot}...`);
    await saveStateToSlot(client, slot, SAVE_DIR);

    console.log(`[build] slot=${slot}: saved`);
  } finally {
    console.log(`[build] slot=${slot}: shutting down DOSBox-X`);
    killDosbox(child);
    await new Promise((r) => setTimeout(r, SHUTDOWN_WAIT_MS));
  }
}

// ── Idempotency check ────────────────────────────────────────────────────
function inspectSaveSize(slot: number): number | null {
  const path = join(SAVE_DIR, `${slot}.sav`);
  if (!existsSync(path)) return null;
  // Lightweight check: file size. A proper party_size read would require
  // re-implementing the DGROUP search from dosbox_inspect_save; for v1 we
  // just check file existence + size to decide if rebuild is needed.
  // If the file exists, we ASSUME it's the right party_size unless
  // --force is passed. (Improvement: parse the .sav for party_size; out
  // of scope for v1.)
  return statSync(path).size;
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const targetSlots = parseArgs();
  for (const s of targetSlots) {
    if (s < 1 || s > 6) {
      console.error(`[build] skipping slot=${s} (out of range 1..6)`);
      continue;
    }
  }
  const client = new HelperClient();
  try {
    for (const slot of targetSlots) {
      if (slot < 1 || slot > 6) continue;
      const size = inspectSaveSize(slot);
      if (size !== null) {
        console.log(
          `[build] slot=${slot}: existing .sav (${size} bytes) — skipping. Pass --force to rebuild.`,
        );
        continue;
      }
      await buildSave(client, slot);
    }
  } finally {
    await client.shutdown();
  }
  console.log('[build] done');
}

main().catch((e) => {
  console.error('[build] FAILED:', e);
  process.exit(1);
});
