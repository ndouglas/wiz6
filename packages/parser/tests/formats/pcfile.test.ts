import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '../../src/formats/pcfile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PCFILE = readFileSync(join(HERE, '..', '..', '..', '..', 'original', 'pcfile.dbs'));

describe('decodePcfile', () => {
  it('decodes the header from the real file', () => {
    const { header } = decodePcfile(new Uint8Array(PCFILE));
    expect(header.recordSize).toBe(0x1B0);
    expect(header.slotCount).toBe(16);
    expect(header.headerSize).toBe(24);
    expect(header.status.slice(0, 6)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(header.status.slice(6)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('decodes the 6 populated slots with their canonical names', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const populated = slots.filter((s) => s.populated);
    expect(populated.length).toBe(6);
    expect(populated.map((s) => s.name)).toEqual([
      'THESUS', 'TEMPEST', 'LYSANDR', 'NOBAL', 'TREON', 'PENTAG',
    ]);
  });

  it('decodes THESUS xp = 0, ageCounter = 6590, level = 1, hpCurrent = 8, spCurrent = 126', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    // XP is at record +0x0c (abs BSS 0x43f4/0x43f6). All stock chars start at 0 XP.
    // The prior value 6590 was ageCounter at +0x08 (BSS 0x43f0/0x43f2) — a game-day
    // age counter. 6590 days ≈ 18 years (÷365). See docs/re/findings/character-xp-field.json.
    expect(thesus.xp).toBe(0);
    expect(thesus.ageCounter).toBe(6590);
    // Level is at record +0x24 (abs BSS 0x440c). All stock chars start at level 1.
    expect(thesus.level).toBe(1);
    expect(thesus.hpCurrent).toBe(8);
    expect(thesus.hpMax).toBe(8);
    expect(thesus.spCurrent).toBe(126);
    expect(thesus.spMax).toBe(126);
    // Gold at +0x14 (abs 0x43fc/0x43fe) is 0 for all stock chars.
    // CORRECTED from prior +0x22 u16 which was a misidentified field.
    expect(thesus.gold).toBe(0);
  });

  it('decodes THESUS race=0(Human), class=0(Fighter), attributes STR=18', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    // Race at +0x19d (abs 0x4585). Stats panel: mov al,[bx+0x4585]; add ax,0x64 -> msg lookup.
    expect(thesus.race).toBe(0);    // Human
    // Class at +0x19f (abs 0x4587). Stats panel: mov al,[bx+0x4587]; add ax,0x78 -> msg lookup.
    expect(thesus.class).toBe(0);   // Fighter
    // Attributes at +0x12c..+0x133 (abs 0x4514..0x451b).
    // Stats panel loop: [bx+0x4514+i] for i=0..7 with msgs STR/INT/PIE/VIT/DEX/SPD/PER/KAR.
    expect(thesus.str).toBe(18);
    expect(thesus.int).toBe(8);
    expect(thesus.pie).toBe(8);
    expect(thesus.vit).toBe(12);
    expect(thesus.dex).toBe(10);
    expect(thesus.spd).toBe(9);
  });

  it('decodes THESUS conditions = all zeros (no afflictions)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    // conditions[10] at +0x122 (abs 0x450a). All stock chars have no active conditions.
    // conditions[2]=dead, conditions[3]=paralyzed/stone (portrait overrides).
    // wpcvw file+0x05c6: priority loop iterates all 10 bytes from abs 0x450a.
    expect(thesus.conditions).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(thesus.conditions[2]).toBe(0); // dead = false
    expect(thesus.conditions[3]).toBe(0); // paralyzed = false
  });

  it('decodes THESUS skills (Fighter: 30 bytes, skill[1]=10, skill[8]=2)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    // skills[30] at +0x134..+0x151 (abs 0x451c..0x4539). Cap = 50.
    // EXTENDED from 14 to 30: prior 'derived_stats_block' was skill continuation.
    // skill_roll_check (wpcvw file+0xa4c1): cmp [bx+0x451c], 0x32.
    expect(thesus.skills.length).toBe(30);
    expect(thesus.skills[1]).toBe(10); // weapon skill (fighter primary, slot 1=Axe per martydill)
    expect(thesus.skills[8]).toBe(2);  // secondary skill (Bow per martydill)
    expect(thesus.skills.every((v) => v <= 50)).toBe(true); // cap check
  });

  it('decodes LYSANDR skills: skill[15]=10 (Skulduggery, Thief)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const lysandr = slots.find((s) => s.name === 'LYSANDR')!;
    // Thief: Skulduggery at slot 15 per martydill SKILL_INDEX_MAP. Confirms 30-byte extent.
    expect(lysandr.skills.length).toBe(30);
    expect(lysandr.skills[15]).toBe(10); // Skulduggery
  });

  it('decodes NOBAL skills: skill[26]=7 (Theology, Priest)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const nobal = slots.find((s) => s.name === 'NOBAL')!;
    // Priest: Theology at slot 26 per martydill SKILL_INDEX_MAP.
    expect(nobal.skills.length).toBe(30);
    expect(nobal.skills[26]).toBe(7); // Theology
  });

  it('decodes TREON skills: skill[28]=10 (Thaumaturgy, Mage)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const treon = slots.find((s) => s.name === 'TREON')!;
    // Mage: Thaumaturgy at slot 28 per martydill SKILL_INDEX_MAP.
    expect(treon.skills.length).toBe(30);
    expect(treon.skills[28]).toBe(10); // Thaumaturgy
  });

  it('decodes encumbranceCurrent and encumbranceMax for all stock chars', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const populated = slots.filter((s) => s.populated);
    const names = populated.map((s) => s.name);
    expect(names).toEqual(['THESUS', 'TEMPEST', 'LYSANDR', 'NOBAL', 'TREON', 'PENTAG']);
    // encumbranceCurrent: current load in tenths of a pound. martydill cross-ref.
    expect(populated[0]!.encumbranceCurrent).toBe(295); // THESUS (STR=18)
    expect(populated[1]!.encumbranceCurrent).toBe(295); // TEMPEST
    expect(populated[2]!.encumbranceCurrent).toBe(225); // LYSANDR
    // encumbranceMax: max capacity in tenths of a pound. Scales with STR.
    expect(populated[0]!.encumbranceMax).toBe(2700); // THESUS (270 lbs)
    expect(populated[3]!.encumbranceMax).toBe(1035); // NOBAL
    // All max > current (not over-encumbered)
    for (const s of populated) {
      expect(s.encumbranceCurrent).toBeGreaterThan(0);
      expect(s.encumbranceMax).toBeGreaterThan(s.encumbranceCurrent);
    }
  });

  it('decodes mks = 0 for all stock chars (no kills before game start)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const populated = slots.filter((s) => s.populated);
    // mks (Monster Kill Statistic) at +0x10. Manual p. 23: kill counter.
    for (const s of populated) {
      expect(s.mks).toBe(0);
    }
  });

  it('decodes bodyAc = [0,0,10,10,10,10,10] for all stock chars (unarmored base)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const populated = slots.filter((s) => s.populated);
    // bodyAc[7] at +0x161. Manual p. 25: AC sub-components.
    // Stock chars unarmored: first 2 bytes 0, remaining 5 = 10 (base AC).
    for (const s of populated) {
      expect(s.bodyAc).toHaveLength(7);
      // Bytes 2-6 should all be 10 (base unarmored AC)
      expect(s.bodyAc.slice(2)).toEqual([10, 10, 10, 10, 10]);
    }
  });

  it('decodes inventoryCountPage2 = 0 for all stock chars (page-1 only)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const populated = slots.filter((s) => s.populated);
    // inventoryCountPage2 at +0x1ad. martydill cross-ref. 0 = no page-2 items.
    for (const s of populated) {
      expect(s.inventoryCountPage2).toBe(0);
    }
  });

  it('decodes THESUS savedOldLevel=0 (never changed class)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    // savedOldLevel at +0x1af (abs 0x4597). Stock chars never changed class.
    expect(thesus.savedOldLevel).toBe(0);
  });

  it('decodes THESUS reaction=20 (stock Fighter starting reaction)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    // reaction at +0x168 (abs 0x4550). Range 0..100.
    // wmnpc.ovr file+0x671d: reads, adjusts via combat delta/10, clamps to 100, writes.
    expect(thesus.reaction).toBe(20);
  });

  it('decodes school mana for TREON (Mage: Fire=3, Mental=3)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const treon = slots.find((s) => s.name === 'TREON')!;
    // schoolManaCur at +0x28+i*4, schoolManaMax at +0x2a+i*4 (i=0..5).
    // Stats panel loop (file+0x0e55+0x4c): bx=slot*0x1b0+i*4; push [bx+0x4410]; push [bx+0x4412].
    // Schools: [0]=Fire [1]=Water [2]=Air [3]=Earth [4]=Mental [5]=Divine.
    expect(treon.schoolManaCur).toEqual([3, 0, 0, 0, 3, 0]); // Fire + Mental
    expect(treon.schoolManaMax).toEqual([3, 0, 0, 0, 3, 0]);
  });

  it('decodes school mana for NOBAL (Priest: Mental=5, Divine=4)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const nobal = slots.find((s) => s.name === 'NOBAL')!;
    expect(nobal.schoolManaCur).toEqual([0, 0, 0, 0, 5, 4]); // Mental + Divine
    expect(nobal.schoolManaMax).toEqual([0, 0, 0, 0, 5, 4]);
  });

  it('decodes school mana for Fighters as all zeros', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    expect(thesus.schoolManaCur).toEqual([0, 0, 0, 0, 0, 0]);
    expect(thesus.schoolManaMax).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('decodes all 6 stock characters with correct race and class', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const populated = slots.filter((s) => s.populated);
    expect(populated.map((s) => s.race)).toEqual([0, 10, 8, 1, 7, 3]);
    // 0=Human(THESUS), 10=Mook(TEMPEST), 8=Felpurr(LYSANDR),
    // 1=Elf(NOBAL), 7=Dracon(TREON), 3=Gnome(PENTAG)
    expect(populated.map((s) => s.class)).toEqual([0, 0, 3, 2, 1, 1]);
    // 0=Fighter, 0=Fighter, 3=Thief, 2=Priest, 1=Mage, 1=Mage
  });

  it('empty slots have populated=false, name=null, and an all-zero raw', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const empty = slots.filter((s) => !s.populated);
    expect(empty.length).toBe(10);
    for (const s of empty) {
      expect(s.name).toBeNull();
      expect(s.raw.every((b) => b === 0)).toBe(true);
    }
  });

  it('decodes THESUS inventory: 5 items starting with LONGSWORD (id=8), slots 5..21 empty', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    // Inventory at +0x40 (abs 0x4428). 22 slots x 8 bytes.
    // Slot layout: [0-1]=item_id(u16), [2]=weight(cached), [3]=0, [4]=equip_slot(cached),
    //              [5]=sprite_idx(cached), [6]=quantity, [7]=flags.
    // 100% cross-verified: weight/equip_slot/sprite_idx match scenario.dbs exactly.
    expect(thesus.inventory.length).toBe(22);
    // Slot 0: LONGSWORD (id=8), weight=50, equip_slot=0 (1H weapon), sprite=1
    expect(thesus.inventory[0]).toMatchObject({ itemId: 8, weight: 50, equipSlot: 0, spriteIdx: 1, quantity: 0, flags: 0 });
    // Slot 1: LEATHER CUIRASS (id=135), weight=140, equip_slot=7 (body), sprite=41
    expect(thesus.inventory[1]).toMatchObject({ itemId: 135, weight: 140, equipSlot: 7, spriteIdx: 41, quantity: 0, flags: 0 });
    // Slot 2: FUR LEGGING (id=132), weight=50, equip_slot=8 (legs), sprite=44
    expect(thesus.inventory[2]).toMatchObject({ itemId: 132, weight: 50, equipSlot: 8, spriteIdx: 44, quantity: 0, flags: 0 });
    // Slot 3: SANDALS (id=130), weight=15, equip_slot=10 (feet), sprite=46
    expect(thesus.inventory[3]).toMatchObject({ itemId: 130, weight: 15, equipSlot: 10, spriteIdx: 46, quantity: 0, flags: 0 });
    // Slot 4: BUCKLER SHIELD (id=141), weight=40, equip_slot=11 (shield), sprite=38
    expect(thesus.inventory[4]).toMatchObject({ itemId: 141, weight: 40, equipSlot: 11, spriteIdx: 38, quantity: 0, flags: 0 });
    // Slots 5..21: empty (item_id=0, all fields 0)
    for (let i = 5; i < 22; i++) {
      expect(thesus.inventory[i]!.itemId).toBe(0);
    }
  });

  it('decodes LYSANDR inventory: DIRK with quantity=9, flags=0x04 (thrown/stackable)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const lysandr = slots.find((s) => s.name === 'LYSANDR')!;
    // DIRK (id=27): thrown weapon. equip_slot=2 (thrown), sprite=0, qty=9, flags=0x04.
    expect(lysandr.inventory[4]).toMatchObject({ itemId: 27, weight: 10, equipSlot: 2, spriteIdx: 0, quantity: 9, flags: 0x04 });
  });

  it('decodes NOBAL inventory: QUARTERSTAFF with flags=0x08 (2-handed), LT.HEAL x3 with flags=0x04', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const nobal = slots.find((s) => s.name === 'NOBAL')!;
    // QUARTERSTAFF (id=24): 2-handed pole. equip_slot=1 (2H staff), flags=0x08.
    expect(nobal.inventory[0]).toMatchObject({ itemId: 24, weight: 45, equipSlot: 1, spriteIdx: 10, quantity: 0, flags: 0x08 });
    // LT.HEAL scroll (id=316): consumable. equip_slot=12, qty=3, flags=0x04.
    expect(nobal.inventory[4]).toMatchObject({ itemId: 316, weight: 2, equipSlot: 12, spriteIdx: 32, quantity: 3, flags: 0x04 });
  });

  it('decodes all stock chars with equipment array all 0xFF (nothing pre-equipped)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const populated = slots.filter((s) => s.populated);
    for (const s of populated) {
      // Equipment at +0x110 (abs 0x44f8). 8 bytes: each = inv index (0..21) or 0xFF=empty.
      // All stock chars have not equipped anything on file load.
      expect(s.equipment).toHaveLength(8);
      expect(s.equipment.every((b) => b === 0xFF)).toBe(true);
    }
  });

  it('decodes THESUS npcRaceReaction: all 31 entries = 20 (base reaction, no prior encounters)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    // npcRaceReaction at +0x169..+0x187 (abs 0x4551..0x456f). 31 bytes.
    // Initialized to base reaction score; each entry updated independently by wmnpc.ovr.
    expect(thesus.npcRaceReaction).toHaveLength(31);
    expect(thesus.npcRaceReaction.every((v) => v === 20)).toBe(true);
    expect(thesus.reaction).toBe(20); // base reaction matches
  });

  it('decodes PENTAG npcRaceReaction: all 31 entries = 40 (Gnome Mage higher base reaction)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const pentag = slots.find((s) => s.name === 'PENTAG')!;
    expect(pentag.npcRaceReaction).toHaveLength(31);
    expect(pentag.npcRaceReaction.every((v) => v === 40)).toBe(true);
    expect(pentag.reaction).toBe(40);
  });

  it('decodes spellSlotsKnown: fighters all-zero, casters have nonzero entries', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    const nobal = slots.find((s) => s.name === 'NOBAL')!;
    const treon = slots.find((s) => s.name === 'TREON')!;
    const pentag = slots.find((s) => s.name === 'PENTAG')!;
    // spellSlotsKnown at +0x188..+0x19b (abs 0x4570). 20 bytes.
    // Fighters = all zero. Casters have sparse nonzero values.
    expect(thesus.spellSlotsKnown).toHaveLength(20);
    expect(thesus.spellSlotsKnown.every((v) => v === 0)).toBe(true);
    // Casters have some nonzero entries
    expect(nobal.spellSlotsKnown.some((v) => v !== 0)).toBe(true);
    expect(treon.spellSlotsKnown.some((v) => v !== 0)).toBe(true);
    expect(pentag.spellSlotsKnown.some((v) => v !== 0)).toBe(true);
    // Verify specific known values
    expect(treon.spellSlotsKnown[0]).toBe(1);   // Fire school
    expect(treon.spellSlotsKnown[6]).toBe(1);   // Mental school
    expect(nobal.spellSlotsKnown[6]).toBe(4);   // Divine school cur
    expect(nobal.spellSlotsKnown[8]).toBe(1);
    expect(pentag.spellSlotsKnown[1]).toBe(2);  // Water school
    expect(pentag.spellSlotsKnown[4]).toBe(32); // Earth school
  });

  it('decodes derivedAc = 10 for all stock characters (base AC, no bonuses at level 1)', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const populated = slots.filter((s) => s.populated);
    // derivedAc at +0x160 (abs 0x4548). Base 10 for all stock (no SPD>16, no Faerie, no Monk/Ninja).
    // wpcvw file+0x8d32: mov byte [bx+0x4548], 0xa
    for (const s of populated) {
      expect(s.derivedAc).toBe(10);
    }
  });

  it('decodes schoolRankThresholds: Fighters have [0,8,4,8,...], school[0]=0 always', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const thesus = slots.find((s) => s.name === 'THESUS')!;
    const nobal = slots.find((s) => s.name === 'NOBAL')!;
    // schoolRankThresholds at +0x152..+0x15f (abs 0x453a). 14 bytes.
    // Initialized by wpcmk creation init at file+0x3e51.
    // School 0 always 0; school 1 always 8 for non-caster classes.
    expect(thesus.schoolRankThresholds).toHaveLength(14);
    expect(thesus.schoolRankThresholds[0]).toBe(0);   // school 0 always 0
    expect(thesus.schoolRankThresholds[1]).toBe(8);   // school 1 = 8 for Fighter
    expect(nobal.schoolRankThresholds[0]).toBe(0);    // school 0 always 0
    expect(thesus.schoolRankThresholds).toEqual([0, 8, 4, 8, 4, 8, 8, 8, 8, 28, 8, 48, 4, 0]);
  });

  it('decodes portraitIndex: distinct values for each stock character', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const populated = slots.filter((s) => s.populated);
    // portraitIndex at +0x1ab (abs 0x4593). 14 portraits (0..13).
    const portraits = populated.map((s) => s.portraitIndex);
    expect(portraits).toEqual([10, 8, 13, 10, 9, 7]);
    // THESUS=10, TEMPEST=8, LYSANDR=13, NOBAL=10, TREON=9, PENTAG=7
    // All values in valid portrait range
    expect(portraits.every((v) => v >= 0 && v <= 13)).toBe(true);
  });

  it('decodes inventoryCount = 5 for all stock characters', () => {
    const { slots } = decodePcfile(new Uint8Array(PCFILE));
    const populated = slots.filter((s) => s.populated);
    // inventoryCount at +0x1ac (abs 0x4594). Count of items in the inventory grid.
    for (const s of populated) {
      expect(s.inventoryCount).toBe(5);
    }
  });

  it('throws on truncated input', () => {
    expect(() => decodePcfile(new Uint8Array([0xb0, 0x01]))).toThrow();
  });

  it('throws on wrong record_size in header', () => {
    const bytes = new Uint8Array(PCFILE);
    bytes[0] = 0xFF; // corrupt record_size
    expect(() => decodePcfile(bytes)).toThrow();
  });
});
