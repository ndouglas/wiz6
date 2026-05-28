import { z } from 'zod';
import { PartyMemberSchema } from './character.js';

/**
 * Active-party member — extends PartyMember with the portraitSlotId field that
 * determines screen Y position on the castle's left side.
 *
 * Engine reference: FUN_0c2c (smallest-free allocator) + FUN_0b0e (blit at
 * X=2, Y=portraitSlotId*9+0x48). See
 * docs/re/findings/wbase-add-party-member.json.
 */
export const ActivePartyMemberSchema = PartyMemberSchema.extend({
  portraitSlotId: z.number().int().min(0).max(5),
});

/**
 * Active party — the 0..6 members currently in the player's party, before save.
 * Persisted at localStorage key `wiz6:active-party` (viewer-side store).
 */
export const ActivePartySchema = z.object({
  schemaVersion: z.literal(1),
  members: z.array(ActivePartyMemberSchema).max(6),
});

export type ActivePartyMember = z.infer<typeof ActivePartyMemberSchema>;
export type ActiveParty = z.infer<typeof ActivePartySchema>;
