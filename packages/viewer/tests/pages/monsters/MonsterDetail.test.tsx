import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MonsterDetail } from '../../../src/pages/monsters/MonsterDetail.js';
import { FIXTURE_SCENARIO_DB } from '../../fixtures/scenario-fixture.js';

const WRAITH = FIXTURE_SCENARIO_DB.monsters[3]!;
const RAT = FIXTURE_SCENARIO_DB.monsters[0]!;

// A minimal valid PicSchema-conforming JSON for mon21.json. One descriptor,
// one populated 1×1 cell, padded with a 32-byte all-zero atlas.
const MON21_PIC = {
  id: 'mon21',
  sourceFile: 'mon21.pic',
  segments: [
    {
      segmentIndex: 0,
      encodedOffset: 0,
      encodedLength: 24 + 24 + 32 + 1,
      ops: [
        {
          type: 'lit',
          bytes: [
            // Descriptor 0: pos=0x18 (after the two 24-byte descriptor slots),
            // W=1, H=1, mask[0]=0x01 (one populated cell).
            0x18, 0x00, 1, 1, 0x01,
            ...Array(19).fill(0),
            // Terminator descriptor (all zeros).
            ...Array(24).fill(0),
            // Atlas: 32-byte all-zero cell = all pixels black.
            ...Array(32).fill(0),
          ],
        },
      ],
      decodedBytes: [
        0x18, 0x00, 1, 1, 0x01,
        ...Array(19).fill(0),
        ...Array(24).fill(0),
        ...Array(32).fill(0),
      ],
    },
  ],
  descriptors: [
    {
      index: 0,
      pos: 0x18,
      width: 1,
      height: 1,
      mask: [0x01, ...Array(19).fill(0)],
    },
  ],
  totalBytes: 81,
};

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/pics/mon21.json')) {
        return new Response(JSON.stringify(MON21_PIC), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }),
  );
}

function LocationProbe() {
  const loc = useLocation();
  return <p data-testid="location">{loc.search || '(empty)'}</p>;
}

function renderDetail(initial = '/monsters/wraith') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <MonsterDetail monster={WRAITH} allMonsters={FIXTURE_SCENARIO_DB.monsters} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function renderRatDetail() {
  return render(
    <MemoryRouter initialEntries={['/monsters/rat']}>
      <MonsterDetail monster={RAT} allMonsters={FIXTURE_SCENARIO_DB.monsters} />
    </MemoryRouter>,
  );
}

describe('MonsterDetail', () => {
  beforeEach(() => {
    stubFetch();
  });

  it('shows monster name as h2', () => {
    renderDetail();
    expect(screen.getByRole('heading', { level: 2, name: /wraith/i })).toBeInTheDocument();
  });

  it('shows all four name slots in the header', () => {
    renderDetail();
    expect(screen.getByText('WRAITHS')).toBeInTheDocument();
    expect(screen.getByText('SPIRIT')).toBeInTheDocument();
    expect(screen.getByText('SPIRITS')).toBeInTheDocument();
  });

  it.each([
    ['Overview', 'overview'],
    ['Attacks', 'attacks'],
    ['Saves & Resistances', 'saves'],
  ])('renders the %s tab button', (label) => {
    renderDetail();
    expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
  });

  it('defaults to Overview when ?tab is not set', () => {
    renderDetail('/monsters/wraith');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reads active tab from ?tab=', () => {
    renderDetail('/monsters/wraith?tab=saves');
    expect(screen.getByRole('tab', { name: 'Saves & Resistances' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('clicking a tab updates the URL', () => {
    renderDetail();
    fireEvent.click(screen.getByRole('tab', { name: 'Attacks' }));
    expect(screen.getByTestId('location')).toHaveTextContent('tab=attacks');
  });

  it('renders a placeholder body for each tab', () => {
    renderDetail('/monsters/wraith?tab=attacks');
    expect(screen.getByTestId('tab-attacks')).toBeInTheDocument();
  });

  it('Copy raw bytes hex button puts hex on the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDetail();
    const btn = screen.getByRole('button', { name: /copy raw bytes hex/i });
    fireEvent.click(btn);
    // WRAITH's statBytes in the fixture is all zeros → 158 bytes of "00"
    expect(writeText).toHaveBeenCalledWith(Array(158).fill('00').join(' '));
  });

  it('Copy as JSON button puts the monster JSON on the clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDetail();
    const btn = screen.getByRole('button', { name: /copy as json/i });
    fireEvent.click(btn);
    const arg = writeText.mock.calls[0]![0]!;
    expect(arg).toMatch(/"nameIdSingular": "WRAITH"/);
  });

  it('does not display a sprite when picId is 0', () => {
    // WRAITH fixture has picId = 0 (default), so no sprite.
    renderDetail();
    expect(screen.queryByTestId('monster-sprite')).not.toBeInTheDocument();
  });

  it('fetches and displays the sprite when picId > 0', async () => {
    // RAT fixture has picId = 21 — fetches /pics/mon21.json.
    renderRatDetail();
    await waitFor(() => {
      expect(screen.getByTestId('monster-sprite')).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith('/pics/mon21.json');
  });
});
