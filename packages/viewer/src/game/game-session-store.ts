import { z } from 'zod';
import { DungeonLevelSchema, MazePartySchema, type DungeonLevel, type MazeParty } from '@wiz6/data';

const KEY = 'wiz6:session';

const SCHEMA_VERSION = 5;

const GameSessionSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  level: DungeonLevelSchema,
  party: MazePartySchema,
  // The 8-beat auto-push cutscene FSM (see entry-sequence.ts):
  //   door-open → title → approach1 → gate1-open → walk → approach2 → gate2-open → free.
  entryMode: z.enum([
    'door-open',
    'title',
    'approach1',
    'gate1-open',
    'walk',
    'approach2',
    'gate2-open',
    'free',
  ]),
  // Animation frame index for the door-open / gate1-open / gate2-open viewport
  // animations (0 for non-animation modes). Defaults to 0 for back-compat.
  animFrame: z.number().int().nonnegative().default(0),
  // Ticks elapsed in the current non-animation HOLD beat (title/approach1/walk/
  // approach2); 0 in animation modes. The cutscene timer (tickEntry) accumulates it.
  holdTicks: z.number().int().nonnegative().default(0),
  // Maze turn counter — incremented once per maze action (step/rotate/OPEN);
  // drives the per-turn status tick (#089). Default 0.
  turnCounter: z.number().int().nonnegative().default(0),
});

export type GameSession = z.infer<typeof GameSessionSchema>;

/** Start a new session for the given level.
 *
 * If the level has a scriptedEntry, places the party at the scripted start
 * position (gy=117) and seeds entryMode:'door-open' (the castle doors slide apart
 * first) + animFrame:0 + holdTicks:0. The cutscene then auto-pushes on a timer.
 *
 * If no scriptedEntry (back-compat), places the party at the entrance and
 * seeds entryMode:'free'.
 */
export function initGameSession(level: DungeonLevel): void {
  const { scriptedEntry } = level;
  const session: GameSession = scriptedEntry
    ? {
        schemaVersion: SCHEMA_VERSION,
        level,
        party: { ...scriptedEntry.start },
        entryMode: 'door-open',
        animFrame: 0,
        holdTicks: 0,
        turnCounter: 0,
      }
    : {
        schemaVersion: SCHEMA_VERSION,
        level,
        party: { ...level.entrance },
        entryMode: 'free',
        animFrame: 0,
        holdTicks: 0,
        turnCounter: 0,
      };
  window.localStorage.setItem(KEY, JSON.stringify(GameSessionSchema.parse(session)));
}

/** Read the current session from localStorage. Returns null on absent, invalid,
 *  or stale (schemaVersion !== current) data. */
export function readGameSession(): GameSession | null {
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // Discard stored blobs from old schema versions cleanly.
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as Record<string, unknown>).schemaVersion !== SCHEMA_VERSION
    ) {
      console.warn('[game-session-store] stale schemaVersion, discarding session');
      return null;
    }
    return GameSessionSchema.parse(parsed);
  } catch (e) {
    console.warn('[game-session-store] data invalid, returning null', e);
    return null;
  }
}

/** Merge a partial party update into the stored session and persist. No-op if no session. */
export function updateParty(partial: Partial<MazeParty>): void {
  const session = readGameSession();
  if (session === null) return;
  const updated: GameSession = {
    ...session,
    party: { ...session.party, ...partial },
  };
  window.localStorage.setItem(KEY, JSON.stringify(GameSessionSchema.parse(updated)));
}

/** Merge a partial session update and persist. No-op if no session. */
export function updateSession(partial: Partial<Omit<GameSession, 'schemaVersion' | 'level'>>): void {
  const session = readGameSession();
  if (session === null) return;
  const updated: GameSession = { ...session, ...partial };
  window.localStorage.setItem(KEY, JSON.stringify(GameSessionSchema.parse(updated)));
}

/** Remove the stored session. */
export function clearGameSession(): void {
  window.localStorage.removeItem(KEY);
}
