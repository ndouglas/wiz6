import { z } from 'zod';

const U8 = z.number().int().min(0).max(255);
const U16 = z.number().int().min(0).max(0xffff);
const U32 = z.number().int().min(0).max(0xffffffff);

export const PcfileHeaderSchema = z.object({
  recordSize: U16,
  slotCount: U16,
  headerSize: U32,
  status: z.array(U8).length(16),
});

/**
 * One pcfile slot. Decodes a small set of high-confidence fields per
 * `docs/re/pcfile-dbs.md` and `docs/re/findings/character-level-field.json`;
 * the full 432-byte raw record is preserved as `raw` so callers can recover
 * any field we haven't decoded yet.
 *
 * Field offsets (record-relative, verified by wpcvw.ovr ASM traces):
 * - name       @ +0x00, 8 bytes ASCII null-terminated
 * - xp         @ +0x08, u32 LE
 * - hpCurrent  @ +0x18, u16 LE  (fn-party-row-render: abs 0x4400)
 * - hpMax      @ +0x1A, u16 LE  (fn-party-row-render: abs 0x4402)
 * - spCurrent  @ +0x1C, u16 LE  (fn-party-row-render: abs 0x4404)
 * - spMax      @ +0x1E, u16 LE  (fn-party-row-render: abs 0x4406)
 * - gold       @ +0x22, u16 LE  (medium confidence)
 * - level      @ +0x24, u16 LE  (stats panel image 0x117b: push [bx+0x440c])
 * - levelSecondary @ +0x26, u16 LE (medium confidence)
 */
export const PcfileSlotSchema = z.object({
  slot: U8,
  populated: z.boolean(),
  name: z.string().nullable(),
  xp: U32,
  hpCurrent: U16,
  hpMax: U16,
  spCurrent: U16,
  spMax: U16,
  gold: U16,
  level: U16,
  levelSecondary: U16,
  raw: z.array(U8).length(432),
});

export const DecodedPcfileSchema = z.object({
  header: PcfileHeaderSchema,
  slots: z.array(PcfileSlotSchema).length(16),
});

export type PcfileHeader = z.infer<typeof PcfileHeaderSchema>;
export type PcfileSlot = z.infer<typeof PcfileSlotSchema>;
export type DecodedPcfile = z.infer<typeof DecodedPcfileSchema>;
