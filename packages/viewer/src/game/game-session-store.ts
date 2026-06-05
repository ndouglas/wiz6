import { z } from 'zod';
import { DungeonLevelSchema, MazePartySchema, type DungeonLevel, type MazeParty } from '@wiz6/data';

const KEY = 'wiz6:session';

const GameSessionSchema = z.object({
  schemaVersion: z.literal(1),
  level: DungeonLevelSchema,
  party: MazePartySchema,
});

export type GameSession = z.infer<typeof GameSessionSchema>;

/** Start a new session for the given level; places the party at the entrance. */
export function initGameSession(level: DungeonLevel): void {
  const session: GameSession = {
    schemaVersion: 1,
    level,
    party: { ...level.entrance },
  };
  window.localStorage.setItem(KEY, JSON.stringify(GameSessionSchema.parse(session)));
}

/** Read the current session from localStorage. Returns null on absent or invalid data. */
export function readGameSession(): GameSession | null {
  const raw = window.localStorage.getItem(KEY);
  if (raw === null) return null;
  try {
    return GameSessionSchema.parse(JSON.parse(raw));
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

/** Remove the stored session. */
export function clearGameSession(): void {
  window.localStorage.removeItem(KEY);
}
