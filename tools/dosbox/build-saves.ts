#!/usr/bin/env node
/**
 * build-saves.ts — on-demand builder for the DOSBox save-state library.
 * Launches DOSBox-X under the fast (un-throttled) config, drives a named
 * recipe from the state catalog, and saves the result to a numbered slot.
 *
 * Usage:
 *   pnpm tsx tools/dosbox/build-saves.ts --list
 *   pnpm tsx tools/dosbox/build-saves.ts <name> [--slot N] [--force]
 *   pnpm tsx tools/dosbox/build-saves.ts --all [--force]
 *
 * Requires macOS Accessibility permission for the calling process.
 * See packages/mcp/PERMISSIONS.md.
 *
 * Spec: docs/superpowers/specs/2026-05-31-dosbox-save-state-library-design.md
 */

import { HelperClient } from '../../packages/mcp/src/dosbox/helper-client.js';
import { sendMacro } from '../../packages/mcp/src/dosbox/input.js';
import { saveStateToSlot, resetSlotTracking } from '../../packages/mcp/src/dosbox/state.js';
import { captureScreenshot } from '../../packages/mcp/src/dosbox/screenshot.js';
import { waitForStableFrame } from '../../packages/mcp/src/dosbox/stable-frame.js';
import { resolveCapturesDir } from '../../packages/mcp/src/dosbox/captures-dir.js';
import { findRecipe, STATE_CATALOG, type SaveStateRecipe } from './state-catalog.js';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DOSBOX_DIR = join(REPO_ROOT, 'tools', 'dosbox');
const SAVE_DIR = join(DOSBOX_DIR, 'save');
const CONF_PATH = join(DOSBOX_DIR, 'wiz6-fast.conf');

const DOSBOX_BIN =
  '/opt/homebrew/Caskroom/dosbox-x-app/2026.05.02/dosbox-x-sdl2/dosbox-x.app/Contents/MacOS/dosbox-x';

// Empirical timing constants — tune if transitions mis-fire.
const BOOT_WAIT_MS = 5000;
const SHUTDOWN_WAIT_MS = 2000;
const TITLE_DISMISS = 'enter enter enter';
const AFTER_TITLE_WAIT_MS = 1500;

// ── DOSBox-X lifecycle ────────────────────────────────────────────────────

function launchFast(): ChildProcess {
  return spawn(DOSBOX_BIN, ['-conf', 'wiz6-fast.conf'], {
    detached: false,
    stdio: 'ignore',
    cwd: DOSBOX_DIR,
  });
}

function killDosbox(child: ChildProcess): void {
  try {
    child.kill('SIGTERM');
  } catch {
    /* ignore */
  }
}

// ── Core recipe driver ────────────────────────────────────────────────────

export async function buildRecipe(
  client: HelperClient,
  capturesDir: string,
  recipe: SaveStateRecipe,
  slot: number,
): Promise<void> {
  console.log(`[build] ${recipe.name} → slot ${slot}: launching DOSBox-X (fast config)...`);
  const child = launchFast();
  try {
    // Wait for DOSBox to boot and reach the title screen.
    await new Promise((r) => setTimeout(r, BOOT_WAIT_MS));

    // Dismiss title page (typically 2-3 Enter presses to clear intro screens).
    console.log(`[build] ${recipe.name}: dismissing title page`);
    await sendMacro(client, TITLE_DISMISS);
    await new Promise((r) => setTimeout(r, AFTER_TITLE_WAIT_MS));

    // Settle-poll helper: captures until N consecutive frames are byte-identical.
    // Best-effort settle between steps: static transitions settle in well under
    // a second; animated screens (blinking name-input cursor, etc.) never freeze,
    // so cap the wait at 2.5s and proceed (the transition is done by then).
    const settle = (): Promise<Buffer> =>
      waitForStableFrame(() => captureScreenshot(client, capturesDir), {
        stableCount: 3,
        timeoutMs: 2500,
        onTimeout: 'return',
      });

    // Wait for the title dismiss to land and the main menu to stabilize.
    await settle();

    // Drive each recipe step with a stable-frame settle between them.
    for (let i = 0; i < recipe.steps.length; i++) {
      const step = recipe.steps[i]!;
      console.log(`[build] ${recipe.name}: step ${i + 1}/${recipe.steps.length}: ${step}`);
      await sendMacro(client, step);
      await settle();
    }

    // Optional extra settle after the final step (recipe-specific).
    if (recipe.settleMs && recipe.settleMs > 0) {
      await new Promise((r) => setTimeout(r, recipe.settleMs));
    }

    // Reset slot tracking then save.
    resetSlotTracking(1);
    console.log(`[build] ${recipe.name}: saving to slot ${slot}...`);
    await saveStateToSlot(client, slot, SAVE_DIR);

    console.log(`[build] ${recipe.name} → slot ${slot}: saved (${join(SAVE_DIR, `${slot}.sav`)})`);
  } finally {
    console.log(`[build] ${recipe.name}: shutting down DOSBox-X`);
    killDosbox(child);
    await new Promise((r) => setTimeout(r, SHUTDOWN_WAIT_MS));
  }
}

// ── Idempotency check ─────────────────────────────────────────────────────

function saveExists(slot: number): boolean {
  return existsSync(join(SAVE_DIR, `${slot}.sav`));
}

// ── CLI parsing ───────────────────────────────────────────────────────────

function printUsage(): void {
  console.error('usage:');
  console.error('  pnpm tsx tools/dosbox/build-saves.ts --list');
  console.error('  pnpm tsx tools/dosbox/build-saves.ts <name> [--slot N] [--force]');
  console.error('  pnpm tsx tools/dosbox/build-saves.ts --all [--force]');
  console.error('');
  console.error('available recipes:');
  for (const r of STATE_CATALOG) {
    console.error(`  ${r.name.padEnd(22)} ${r.description.slice(0, 60)}`);
  }
}

interface ParsedArgs {
  mode: 'list' | 'all' | 'single';
  name?: string;
  slot: number;
  force: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  const force = args.includes('--force');

  if (args.includes('--list')) {
    return { mode: 'list', slot: 1, force };
  }

  if (args.includes('--all')) {
    return { mode: 'all', slot: 1, force };
  }

  // Find the positional name (first non-flag arg).
  const name = args.find((a) => !a.startsWith('--'));
  if (!name) {
    printUsage();
    process.exit(1);
  }

  // Validate name early so --list works without hitting the catalog.
  const recipe = findRecipe(name);
  if (!recipe) {
    console.error(`[build] unknown recipe: "${name}"`);
    printUsage();
    process.exit(1);
  }

  const slotIdx = args.indexOf('--slot');
  const slot = slotIdx >= 0 && args[slotIdx + 1] ? parseInt(args[slotIdx + 1]!, 10) : 1;
  if (isNaN(slot) || slot < 1 || slot > 10) {
    console.error(`[build] --slot must be an integer 1..10, got: ${args[slotIdx + 1]}`);
    process.exit(1);
  }

  return { mode: 'single', name, slot, force };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const parsed = parseArgs();

  // --list: print catalog without launching DOSBox.
  if (parsed.mode === 'list') {
    console.log(`DOSBox save-state catalog (${STATE_CATALOG.length} recipes):`);
    console.log('');
    for (const r of STATE_CATALOG) {
      console.log(`  ${r.name}`);
      console.log(`    ${r.description}`);
      console.log(`    steps: ${r.steps.length}`);
      console.log('');
    }
    return;
  }

  const capturesDir = resolveCapturesDir(CONF_PATH);
  const client = new HelperClient();

  try {
    if (parsed.mode === 'all') {
      if (STATE_CATALOG.length > 10) {
        console.warn(
          `[build] WARNING: catalog has ${STATE_CATALOG.length} entries but only slots 1–10 are MCP-loadable. ` +
            `Entries beyond slot 10 will be assigned out-of-range slot numbers.`,
        );
      }
      let slot = 1;
      for (const recipe of STATE_CATALOG) {
        if (!parsed.force && saveExists(slot)) {
          console.log(
            `[build] slot=${slot} (${recipe.name}): existing .sav — skipping. Pass --force to rebuild.`,
          );
          slot++;
          continue;
        }
        await buildRecipe(client, capturesDir, recipe, slot);
        slot++;
      }
    } else {
      // mode === 'single'
      const recipe = findRecipe(parsed.name!)!;
      if (!parsed.force && saveExists(parsed.slot)) {
        console.log(
          `[build] slot=${parsed.slot} (${recipe.name}): existing .sav — skipping. Pass --force to rebuild.`,
        );
      } else {
        await buildRecipe(client, capturesDir, recipe, parsed.slot);
      }
    }
  } finally {
    await client.shutdown();
  }

  console.log('[build] done');
}

// Only run main() when this file is the direct entry point (not when imported
// as a module by build-castle-saves.ts or other wrappers).
const isEntryPoint = process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isEntryPoint) {
  main().catch((e) => {
    console.error('[build] FAILED:', e);
    process.exit(1);
  });
}
