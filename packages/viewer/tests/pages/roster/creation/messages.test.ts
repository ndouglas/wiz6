// packages/viewer/tests/pages/roster/creation/messages.test.ts
//
// Tests for the wpcmk creation msg.dbs string wiring.
// Authoritative spec: docs/re/wpcmk-screens.md §3
//
// For real-data assertions we load msg.json directly from disk using the same
// worktree-aware pattern as assets.test.ts (parse the .git file to find the
// main checkout root, then read extracted/messages/msg.json).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { MessageDbSchema } from '@wiz6/data';
import type { MessageDb } from '@wiz6/data';

import {
  MSG,
  RACE_NAME_BASE,
  CLASS_NAME_BASE,
  SEX_NAME_BASE,
  SKILL_CAT_BASE,
  SPELL_NAME_BASE,
  creationString,
  raceName,
  className,
  sexName,
  spellName,
} from '../../../../src/pages/roster/creation/messages.js';

// ---------------------------------------------------------------------------
// Load real msg.json from disk via worktree-aware path resolution
// ---------------------------------------------------------------------------

function findMainCheckoutRoot(): string {
  const testDir = dirname(fileURLToPath(import.meta.url));
  // From messages.test.ts: tests/pages/roster/creation/ → 4 levels up to
  // packages/viewer/, then 2 more to the worktree root.
  const worktreeRoot = resolve(testDir, '../../../../../..');
  const gitFilePath = join(worktreeRoot, '.git');
  let gitContent: string;
  try {
    gitContent = readFileSync(gitFilePath, 'utf-8');
  } catch {
    // Already the main checkout
    return worktreeRoot;
  }
  // "gitdir: /path/to/.git/worktrees/branch-name\n"
  const match = /gitdir:\s*(.+)/.exec(gitContent);
  if (!match) return worktreeRoot;
  const gitDir = match[1]!.trim();
  const dotGitDir = gitDir.replace(/\/worktrees\/[^/]+$/, '');
  return resolve(dotGitDir, '..');
}

const MAIN_ROOT = findMainCheckoutRoot();
const MSG_JSON = join(MAIN_ROOT, 'extracted', 'messages', 'msg.json');

function loadMsgDb(): MessageDb {
  const json: unknown = JSON.parse(readFileSync(MSG_JSON, 'utf-8'));
  return MessageDbSchema.parse(json);
}

// ---------------------------------------------------------------------------
// MSG constant table — ids match §3 exactly
// ---------------------------------------------------------------------------

describe('MSG id constants (§3 authoritative)', () => {
  it('namePrompt is 0x044c', () => { expect(MSG.namePrompt).toBe(0x044c); });
  it('dupNameError is 0x044e', () => { expect(MSG.dupNameError).toBe(0x044e); });
  it('confirmPrompt is 0x044f', () => { expect(MSG.confirmPrompt).toBe(0x044f); });
  it('racePrompt is 0x0450', () => { expect(MSG.racePrompt).toBe(0x0450); });
  it('sexPrompt is 0x0451', () => { expect(MSG.sexPrompt).toBe(0x0451); });
  it('classPrompt is 0x0452', () => { expect(MSG.classPrompt).toBe(0x0452); });
  it('bonusLabel is 0x0453', () => { expect(MSG.bonusLabel).toBe(0x0453); });
  it('bonusAdjust is 0x0454', () => { expect(MSG.bonusAdjust).toBe(0x0454); });
  it('bonusSelect is 0x0455', () => { expect(MSG.bonusSelect).toBe(0x0455); });
  it('personality is 0x0457', () => { expect(MSG.personality).toBe(0x0457); });
  it('portraitReview is 0x0458', () => { expect(MSG.portraitReview).toBe(0x0458); });
  it('portraitSelect is 0x0459', () => { expect(MSG.portraitSelect).toBe(0x0459); });
  it('confirmOptions is 0x045a', () => { expect(MSG.confirmOptions).toBe(0x045a); });
  it('raceTitle is 0x045c', () => { expect(MSG.raceTitle).toBe(0x045c); });
  it('sexTitle is 0x045d', () => { expect(MSG.sexTitle).toBe(0x045d); });
  it('classTitle is 0x045e', () => { expect(MSG.classTitle).toBe(0x045e); });
  it('bonusTitle is 0x0460', () => { expect(MSG.bonusTitle).toBe(0x0460); });
  it('skillPoints is 0x159a', () => { expect(MSG.skillPoints).toBe(0x159a); });
  it('spellsTitle is 0x02bc', () => { expect(MSG.spellsTitle).toBe(0x02bc); });
  it('cost is 0x0f75', () => { expect(MSG.cost).toBe(0x0f75); });
});

// ---------------------------------------------------------------------------
// Dynamic base constants
// ---------------------------------------------------------------------------

describe('dynamic base constants', () => {
  it('RACE_NAME_BASE is 0x64', () => { expect(RACE_NAME_BASE).toBe(0x64); });
  it('CLASS_NAME_BASE is 0x78', () => { expect(CLASS_NAME_BASE).toBe(0x78); });
  it('SEX_NAME_BASE is 0x8c', () => { expect(SEX_NAME_BASE).toBe(0x8c); });
  it('SKILL_CAT_BASE is 0x0258', () => { expect(SKILL_CAT_BASE).toBe(0x0258); });
  it('SPELL_NAME_BASE is 0x0fa0', () => { expect(SPELL_NAME_BASE).toBe(0x0fa0); });
});

// ---------------------------------------------------------------------------
// creationString + convenience helpers against real msg.json
// ---------------------------------------------------------------------------

describe('creationString — real msg.json lookups', () => {
  let db: MessageDb;
  try {
    db = loadMsgDb();
  } catch {
    // If the extracted file doesn't exist (CI without assets), skip
    describe.skip('real msg.json not available', () => {});
    // Satisfy type checker — these tests won't run
    db = null as unknown as MessageDb;
  }

  it('confirmPrompt → "SAVE THIS CHARACTER?"', () => {
    expect(creationString(db, MSG.confirmPrompt)).toBe('SAVE THIS CHARACTER?');
  });

  it('namePrompt → "CHARACTER NAME >"', () => {
    expect(creationString(db, MSG.namePrompt)).toBe('CHARACTER NAME >');
  });

  it('dupNameError → "* CHARACTER ALREADY EXISTS *"', () => {
    expect(creationString(db, MSG.dupNameError)).toBe('* CHARACTER ALREADY EXISTS *');
  });

  it('racePrompt → "SELECT CHARACTER RACE"', () => {
    expect(creationString(db, MSG.racePrompt)).toBe('SELECT CHARACTER RACE');
  });

  it('sexPrompt → "SELECT CHARACTER SEX"', () => {
    expect(creationString(db, MSG.sexPrompt)).toBe('SELECT CHARACTER SEX');
  });

  it('classPrompt → "SELECT CHARACTER PROFESSION"', () => {
    expect(creationString(db, MSG.classPrompt)).toBe('SELECT CHARACTER PROFESSION');
  });

  it('bonusTitle → "ASSIGN ABILITY SCORE BONUS"', () => {
    expect(creationString(db, MSG.bonusTitle)).toBe('ASSIGN ABILITY SCORE BONUS');
  });

  it('confirmOptions → "YES"', () => {
    expect(creationString(db, MSG.confirmOptions)).toBe('YES');
  });

  it('skillPoints → "SKILL POINTS"', () => {
    expect(creationString(db, MSG.skillPoints)).toBe('SKILL POINTS');
  });

  it('spellsTitle → "      SPELLS      "', () => {
    expect(creationString(db, MSG.spellsTitle)).toBe('      SPELLS      ');
  });

  it('cost → "COST"', () => {
    expect(creationString(db, MSG.cost)).toBe('COST');
  });

  it('missing id returns empty string', () => {
    expect(creationString(db, 0xffff)).toBe('');
  });
});

describe('sexName — real msg.json', () => {
  let db: MessageDb;
  try {
    db = loadMsgDb();
  } catch {
    db = null as unknown as MessageDb;
  }

  it('sexName(db, 0) === "MALE"', () => {
    expect(sexName(db, 0)).toBe('MALE');
  });

  it('sexName(db, 1) === "FEMALE"', () => {
    expect(sexName(db, 1)).toBe('FEMALE');
  });
});

describe('raceName — real msg.json', () => {
  let db: MessageDb;
  try {
    db = loadMsgDb();
  } catch {
    db = null as unknown as MessageDb;
  }

  it('raceName(db, 0) === "HUMAN"', () => {
    expect(raceName(db, 0)).toBe('HUMAN');
  });

  it('raceName(db, 1) === "ELF"', () => {
    expect(raceName(db, 1)).toBe('ELF');
  });
});

describe('className — real msg.json', () => {
  let db: MessageDb;
  try {
    db = loadMsgDb();
  } catch {
    db = null as unknown as MessageDb;
  }

  it('className(db, 0) === "FIGHTER"', () => {
    expect(className(db, 0)).toBe('FIGHTER');
  });

  it('className(db, 1) === "MAGE"', () => {
    expect(className(db, 1)).toBe('MAGE');
  });
});

describe('spellName — real msg.json', () => {
  let db: MessageDb;
  try {
    db = loadMsgDb();
  } catch {
    db = null as unknown as MessageDb;
  }

  it('spellName(db, 0) === "ENERGY BLAST"', () => {
    expect(spellName(db, 0)).toBe('ENERGY BLAST');
  });

  it('spellName(db, 1) === "BLINDING FLASH"', () => {
    expect(spellName(db, 1)).toBe('BLINDING FLASH');
  });
});
