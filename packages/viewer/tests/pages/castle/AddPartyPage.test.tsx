/**
 * AddPartyPage component test — covers key handling and store integration.
 * Uses skipAssetLoad to avoid fetch() in vitest.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { writeRoster } from '../../../src/lib/roster-store.js';
import { readActiveParty } from '../../../src/lib/active-party-store.js';
import type { Character } from '@wiz6/data';

const ID = (i: number): string =>
  `00000000-0000-0000-0000-${i.toString().padStart(12, '0')}`;

function makeChar(id: string, name: string): Character {
  return {
    id,
    name,
    race: 0,
    class: 0,
    sex: 0,
    level: 1,
    xp: 0,
    gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: { str: 12, int: 12, pie: 12, vit: 12, dex: 12, spd: 12, per: 50, kar: 50 },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills: new Array(30).fill(0),
    savedOldLevel: 0,
    reaction: 0,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

async function renderPage() {
  const { AddPartyPage } = await import('../../../src/pages/castle/AddPartyPage.js');
  return render(
    <MemoryRouter initialEntries={['/castle/add-party']}>
      <Routes>
        <Route path="/castle/add-party" element={<AddPartyPage skipAssetLoad />} />
        <Route path="/castle" element={<div data-testid="castle">CASTLE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AddPartyPage', () => {
  it('Escape returns to /castle without adding', async () => {
    writeRoster({ schemaVersion: 1, characters: [makeChar(ID(1), 'NATHAN')] });
    await renderPage();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.getByTestId('castle')).toBeTruthy());
    expect(readActiveParty().members).toEqual([]);
  });

  it('Enter on a candidate adds them and returns to /castle', async () => {
    writeRoster({ schemaVersion: 1, characters: [makeChar(ID(1), 'NATHAN')] });
    await renderPage();
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('castle')).toBeTruthy());
    const p = readActiveParty();
    expect(p.members).toHaveLength(1);
    expect(p.members[0]!.id).toBe(ID(1));
    expect(p.members[0]!.portraitSlotId).toBe(0);
  });

  it('ArrowUp moves to CANCEL; Enter then returns without adding', async () => {
    writeRoster({ schemaVersion: 1, characters: [makeChar(ID(1), 'NATHAN')] });
    await renderPage();
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(screen.getByTestId('castle')).toBeTruthy());
    expect(readActiveParty().members).toEqual([]);
  });

  it('returns to /castle immediately when roster is empty', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByTestId('castle')).toBeTruthy());
  });
});
