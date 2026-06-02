import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CreationState, DraftState } from '../../src/pages/roster/creation/state.js';
import { draftFromEngineDump } from '../../src/pages/roster/creation/lib/draft-from-engine-dump.js';

/** Injection partial = { screen, draft } only (JSON-serializable; no rng). */
export type CreationStatePartial = Partial<CreationState> & { draft?: Partial<DraftState> };

const HERE = dirname(fileURLToPath(import.meta.url));
// e2e/lib → repo root is up 4 (lib → e2e → viewer → packages → root).
const ROOT = join(HERE, '..', '..', '..', '..');
const FIXTURES = join(ROOT, 'tools', 'parity', 'fixtures', 'engine');

/**
 * Build a creation `spellPick` injection partial DATA-DRIVEN from a committed
 * engine fixture's sidecar (`<fixture>.character.json`) — the SAME source the
 * parity test (tools/parity/spell-screen-parity.test.ts `loadSpellDraft`)
 * renders from. This guarantees the e2e injects the exact M-Elf Mage each
 * `creation-spell-*` fixture was captured from, and can't go stale when the
 * fixtures are re-minted (Stage 4d dosbox-pure re-mint).
 *
 * IMPORTANT: each `creation-spell-*` fixture was minted from a SEPARATE,
 * non-deterministic engine roll (attributes / age / SP differ per fixture), so
 * every parity case must inject ITS OWN sidecar — not one shared draft.
 *
 * draftFromEngineDump consumes the `{ draft, bonusPool }` sidecar shape verbatim.
 */
export function spellPickStateFor(fixture: string): CreationStatePartial {
  const sidecar = JSON.parse(
    readFileSync(join(FIXTURES, `${fixture}.character.json`), 'utf-8'),
  );
  return {
    screen: 'spellPick',
    draft: draftFromEngineDump(sidecar),
  };
}

/**
 * The exact M-Elf Mage the `creation-spell-pick` fixture was captured from,
 * sourced DATA-DRIVEN from the committed sidecar (NOT hardcoded). Retained for
 * callers that want the canonical FIRE-grid start state.
 */
export const mageSpellPick: CreationStatePartial = spellPickStateFor('creation-spell-pick');
