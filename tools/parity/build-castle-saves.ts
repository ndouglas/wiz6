#!/usr/bin/env node
/**
 * build-castle-saves.ts — back-compat wrapper; delegates to build-saves.ts.
 *
 * Usage (unchanged for existing callers/docs):
 *   pnpm tsx tools/parity/build-castle-saves.ts --slots 1,2,3,4,5,6
 *   pnpm tsx tools/parity/build-castle-saves.ts --slot 6
 *
 * Maps slot N → recipe `castle-N` in the state catalog.
 * Idempotent: skips slots where `tools/dosbox/save/<N>.sav` already exists
 * (pass --force to rebuild).
 *
 * Spec: docs/superpowers/specs/2026-05-30-castle-party-panel-rerender-design.md
 */

import { HelperClient } from '../../packages/mcp/src/dosbox/helper-client.js';
import { resolveCapturesDir } from '../../packages/mcp/src/dosbox/captures-dir.js';
import { findRecipe } from '../dosbox/state-catalog.js';
import { buildRecipe } from '../dosbox/build-saves.js';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DOSBOX_DIR = join(REPO_ROOT, 'tools', 'dosbox');
const SAVE_DIR = join(DOSBOX_DIR, 'save');
const CONF_PATH = join(DOSBOX_DIR, 'wiz6-fast.conf');

// ── CLI parsing ──────────────────────────────────────────────────────────
function parseArgs(): { slots: number[]; force: boolean } {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const slotsIdx = args.indexOf('--slots');
  const slotIdx = args.indexOf('--slot');
  if (slotsIdx >= 0 && args[slotsIdx + 1]) {
    return { slots: args[slotsIdx + 1]!.split(',').map((s) => parseInt(s, 10)), force };
  }
  if (slotIdx >= 0 && args[slotIdx + 1]) {
    return { slots: [parseInt(args[slotIdx + 1]!, 10)], force };
  }
  console.error('usage:');
  console.error('  pnpm tsx tools/parity/build-castle-saves.ts --slots 1,2,3,4,5,6');
  console.error('  pnpm tsx tools/parity/build-castle-saves.ts --slot 6');
  process.exit(2);
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const { slots: targetSlots, force } = parseArgs();

  const capturesDir = resolveCapturesDir(CONF_PATH);
  const client = new HelperClient();

  try {
    for (const slot of targetSlots) {
      if (slot < 1 || slot > 6) {
        console.error(`[build] skipping slot=${slot} (out of range 1..6)`);
        continue;
      }
      const savePath = join(SAVE_DIR, `${slot}.sav`);
      if (!force && existsSync(savePath)) {
        console.log(
          `[build] slot=${slot}: existing .sav — skipping. Pass --force to rebuild.`,
        );
        continue;
      }
      const recipeName = `castle-${slot}`;
      const recipe = findRecipe(recipeName);
      if (!recipe) {
        console.error(`[build] slot=${slot}: recipe "${recipeName}" not found in catalog`);
        process.exit(1);
      }
      await buildRecipe(client, capturesDir, recipe, slot);
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
