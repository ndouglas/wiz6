import { z } from 'zod';
import { DungeonLevelSchema, MazePartySchema, type DungeonLevel, type MazeParty } from '@wiz6/data';

const KEY = 'wiz6:session';

const GameSessionSchema = z.object({
  schemaVersion: z.literal(2),
  level: DungeonLevelSchema,
  party: MazePartySchema,
  entryMode: z.enum(['narration', 'gate-walk', 'free']),
  stepsRemaining: z.number().int().nonnegative(),
});

export type GameSession = z.infer<typeof GameSessionSchema>;

/** Start a new session for the given level.
 *
 * If the level has a scriptedEntry, places the party at the scripted start
 * position and seeds entryMode:'narration' + stepsRemaining from the config.
 *
 * If no scriptedEntry (back-compat), places the party at the entrance and
 * seeds entryMode:'free' + stepsRemaining:0.
 */
export function initGameSession(level: DungeonLevel): void {
  const { scriptedEntry } = level;
  const session: GameSession = scriptedEntry
    ? {
        schemaVersion: 2,
        level,
        party: { ...scriptedEntry.start },
        entryMode: 'narration',
        stepsRemaining: scriptedEntry.steps,
      }
    : {
        schemaVersion: 2,
        level,
        party: { ...level.entrance },
        entryMode: 'free',
        stepsRemaining: 0,
      };
  window.localStorage.setItem(KEY, JSON.stringify(GameSessionSchema.parse(session)));
}

/** Read the current session from localStorage. Returns null on absent, invalid,
 *  or stale (schemaVersion !== 2) data. */
export function readGameSession(): GameSession | null {
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    // Discard stored blobs from old schema versions cleanly.
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as Record<string, unknown>).schemaVersion !== 2
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
