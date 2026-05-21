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
  monsterCount: 253,
  monsters: Array.from({ length: 253 }, (_, i) => {
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
        screen.getByRole('heading', { name: /scenario.*14 XP tables.*3 items.*2 filled.*253 monsters/i }),
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
