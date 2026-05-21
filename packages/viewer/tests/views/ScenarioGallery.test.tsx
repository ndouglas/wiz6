import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ScenarioGallery } from '../../src/views/ScenarioGallery.js';

const baseItemFields = {
  price: 0,
  hitBonus: 0,
  damageDiceCount: 0,
  damageDiceSides: 0,
  spellOrSongId: 0,
  weight: 0,
  classMask: 0,
  equipSlot: 0,
};

const baseMonsterFields = {
  xpOnKill: 0,
  attack1DiceCount: 0,
  attack1DiceSides: 0,
  attack1SpecialChance: 0,
  attack2DiceCount: 0,
  attack2DiceSides: 0,
  attack2SpecialChance: 0,
  attack3DiceCount: 0,
  attack3DiceSides: 0,
  attack3SpecialChance: 0,
  groupDiceCount: 0,
  groupDiceSides: 0,
  hpDiceCount: 0,
  hpDiceSides: 0,
  monsterClass: 0,
  monsterSubClass: 0,
  saveTable: [0, 0, 0, 0, 0],
  effectChanceTable: [0, 0, 0, 0, 0],
  monsterLevel: 0,
  monsterLevelMax: 0,
  familyId: [0, 0, 0, 0],
  creatureKind: 0,
  monsterSex: 0,
  moveStat: 0,
  spriteGroup: 0,
  monsterAC: 0,
  attributeSaves: [0, 0, 0, 0],
  goldStat: 0,
  specialAttackElement: 0,
  monsterBehaviorClass: 0,
  attack1Extra: [0, 0],
  attack2Extra: [0, 0],
  attack3Extra: [0, 0],
  attack1PoisonChance: 0,
  attack1DrainChance: 0,
  attack1StunChance: 0,
  attack2PoisonChance: 0,
  attack2DrainChance: 0,
  attack2StunChance: 0,
  attack3PoisonChance: 0,
  attack3DrainChance: 0,
  attack3StunChance: 0,
  attack1HpDrainChance: 0,
  attack1AgeChance: 0,
  attack1DecapitateChance: 0,
  attack2HpDrainChance: 0,
  attack2AgeChance: 0,
  attack2DecapitateChance: 0,
  attack3HpDrainChance: 0,
  attack3AgeChance: 0,
  attack3DecapitateChance: 0,
  attack1Style: 0,
  attack1DamageBonus: 0,
  attack2Style: 0,
  attack2DamageBonus: 0,
  attack3Style: 0,
  attack3DamageBonus: 0,
  attack1PoisonStrength: 0,
  attack2PoisonStrength: 0,
  attack3PoisonStrength: 0,
  extendedSaves: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  combatSpriteId: 0,
  combatSpriteAlt: 0,
  secondarySpriteId: 0,
  magicResistChance: 0,
  combatTraitId: 0,
  auxSave103: 0,
  spellPowerChance: 0,
  auxSave106: 0,
  flyEvadeChance: 0,
};

const emptyMonster = (i: number) => ({
  index: i,
  nameIdSingular: '',
  nameIdPlural: '',
  nameUnidSingular: '',
  nameUnidPlural: '',
  statBytes: Array(158).fill(0),
  empty: true,
  ...baseMonsterFields,
});

const validDb = {
  id: 'scenario',
  sourceFile: 'scenario.dbs',
  xpTables: Array.from({ length: 14 }, (_, i) => ({
    classIndex: i,
    levels: Array.from({ length: 16 }, (_, j) => 1000 * (j + 1) * (i + 1)),
  })),
  itemCount: 3,
  items: [
    { index: 0, name1: 'BROKEN ITEM', name2: '', bytes: Array(74).fill(0), empty: false, ...baseItemFields },
    { index: 1, name1: 'DAGGER', name2: 'DAGGERS', bytes: Array(74).fill(0).map((_, i) => i === 0 ? 0x44 : 0), empty: false, ...baseItemFields, price: 15, damageDiceCount: 1, damageDiceSides: 4, weight: 10, classMask: 0x3fff },
    { index: 2, name1: '', name2: '', bytes: Array(74).fill(0), empty: true, ...baseItemFields },
  ],
  unknownPreMonster: [],
  monsterCount: 250,
  monsters: Array.from({ length: 250 }, (_, i) => {
    if (i === 0) {
      return {
        index: 0,
        nameIdSingular: 'GIANT RAT',
        nameIdPlural: 'GIANT RATS',
        nameUnidSingular: 'RAT',
        nameUnidPlural: 'RATS',
        statBytes: Array(158).fill(0).map((_, j) => j === 0 ? 0xc2 : j === 1 ? 0x01 : 0),
        empty: false,
        ...baseMonsterFields,
        xpOnKill: 450,
        attack1DiceCount: 2,
        attack1DiceSides: 2,
        groupDiceCount: 1,
        groupDiceSides: 2,
        hpDiceCount: 2,
        hpDiceSides: 4,
      };
    }
    return emptyMonster(i);
  }),
  questDataCount: 3,
  questData: Array.from({ length: 3 }, (_, i) => ({
    index: i,
    names: ['', '', '', ''],
    rawBytes: Array(222).fill(0),
    empty: true,
  })),
  unknownTail: [0xab, 0xcd],
};

describe('ScenarioGallery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders heading with table counts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    render(<ScenarioGallery url="/scenario/scenario.json" />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /scenario.*14 XP tables.*3 items.*2 filled.*250 monsters/i }),
      ).toBeInTheDocument();
    });
  });

  it('renders all 14 XP tables', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    const { container } = render(<ScenarioGallery url="/scenario/scenario.json" />);
    await waitFor(() => {
      expect(screen.getByText(/XP-per-level by character class/i)).toBeInTheDocument();
    });
    const xpRows = container.querySelectorAll('table:first-of-type tbody tr');
    expect(xpRows.length).toBe(14);
  });

  it('hides empty item slots by default', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    const { container } = render(<ScenarioGallery url="/scenario/scenario.json" />);
    await waitFor(() => {
      expect(screen.getByText(/DAGGER/)).toBeInTheDocument();
    });
    const itemTable = container.querySelectorAll('table')[1];
    const rows = itemTable!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
  });

  it('filters items by search query', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(validDb), { status: 200 })));
    const { container } = render(<ScenarioGallery url="/scenario/scenario.json" />);
    await waitFor(() => {
      expect(screen.getByText(/DAGGER/)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText(/DAGGER \/ 42/i), { target: { value: 'dagger' } });
    await waitFor(() => {
      const itemTable = container.querySelectorAll('table')[1];
      const rows = itemTable!.querySelectorAll('tbody tr');
      expect(rows.length).toBe(1);
    });
  });

  it('shows error on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    render(<ScenarioGallery url="/scenario/missing.json" />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
