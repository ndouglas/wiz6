import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { NewCharacterPage } from '../../../src/pages/roster/NewCharacterPage.js';
import { resetToDefaults } from '../../../src/lib/house-rules-store.js';
import { readRoster } from '../../../src/lib/roster-store.js';

beforeEach(() => {
  window.localStorage.clear();
  resetToDefaults();
});

function clickNext() {
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
}

describe('Mage with spell picker integration', () => {
  it('creates an Elf Mage with 2 starter spells', () => {
    render(
      <MemoryRouter initialEntries={['/roster/new']}>
        <Routes>
          <Route path="/roster/new" element={<NewCharacterPage />} />
          <Route path="/roster" element={<div>roster page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // Step 1: Name
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'TREON' } });
    clickNext();

    // Step 2: Race — Elf (index 1): str=7, int=10, pie=10, vit=7, dex=9, spd=9
    fireEvent.click(screen.getByRole('button', { name: /elf/i }));
    clickNext();

    // Step 3: Bonus roll — pinned to max (28) by house rule default
    clickNext();

    // Step 4: Class — Mage (index 1, requires IQ≥12).
    // Button accessible name is "Mage IQ≥12" so /mage/i matches uniquely.
    // VALIDATORS[3] is (d) => d.classIdx !== null, so this step passes immediately on selection.
    fireEvent.click(screen.getByRole('button', { name: /mage/i }));
    clickNext();

    // Step 5: Attributes — spend all 28 bonus points.
    // + buttons are ordered: [STR+, IQ+, PIE+, VIT+, DEX+, SPD+].
    // Dump into IQ first (index 1): Elf IQ=10, cap 18 → can add 8.
    // Then distribute remaining 20 points round-robin across available stats.
    for (let spent = 0; spent < 28; spent++) {
      const plusButtons = screen.getAllByRole('button', { name: /\+/ });
      // Prefer IQ (index 1) while it has room; otherwise fall back to first available
      const iqPlus = plusButtons[1];
      const target =
        iqPlus && !(iqPlus as HTMLButtonElement).disabled
          ? iqPlus
          : plusButtons.find((b) => !(b as HTMLButtonElement).disabled);
      if (!target) break;
      fireEvent.click(target);
    }
    clickNext();

    // Step 6: Skills — dump all 10 into first available slot
    for (let i = 0; i < 10; i++) {
      const btn = screen.getAllByRole('button', { name: /\+/ })[0]!;
      if ((btn as HTMLButtonElement).disabled) break;
      fireEvent.click(btn);
    }
    clickNext();

    // Step 7: Spells — Mage needs 2 picks from the Mage book.
    // Spell buttons have names like "Fire Lv 1 #0", "Water Lv 2 #5", etc.
    expect(screen.getByText(/0 of 2 spells picked/i)).toBeInTheDocument();
    const spellButtons = screen.getAllByRole('button', { name: /Fire|Water|Air|Earth|Mental|Divine/ });
    fireEvent.click(spellButtons[0]!);
    fireEvent.click(spellButtons[1]!);
    expect(screen.getByText(/2 of 2 spells picked/i)).toBeInTheDocument();
    clickNext();

    // Step 8: Karma — auto-rolled on mount; isKarmaValid checks karmaRolled flag
    clickNext();

    // Step 9: Review — Create character
    fireEvent.click(screen.getByRole('button', { name: /create character/i }));

    // Assert: roster now has 1 character
    const roster = readRoster();
    expect(roster.characters.length).toBe(1);
    expect(roster.characters[0]!.name).toBe('TREON');
    expect(roster.characters[0]!.class).toBe(1); // Mage
    expect(roster.characters[0]!.race).toBe(1);  // Elf
  });
});
