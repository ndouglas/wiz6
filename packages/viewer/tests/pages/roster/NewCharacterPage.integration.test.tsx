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

describe('Fighter happy-path integration', () => {
  it('creates a Human Fighter and adds to roster', () => {
    render(
      <MemoryRouter initialEntries={['/roster/new']}>
        <Routes>
          <Route path="/roster/new" element={<NewCharacterPage />} />
          <Route path="/roster" element={<div>roster page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // Step 1: Name
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), { target: { value: 'THESUS' } });
    clickNext();

    // Step 2: Race — use Human (index 0)
    // NOTE: Fighter requires STR≥12. Human base STR=9. The wizard's class-pick
    // step validator (VALIDATORS[3]) was originally `isClassValid` which checks
    // that requirements are ALREADY met via computeTotalAttributes (base + bonusDistribution).
    // With bonusDistribution=0 at class-pick time, Human STR=9 < 12 → validator false →
    // Next disabled. This is a validator design bug (see bug-finding note below).
    // VALIDATORS[3] was fixed to `(d) => d.classIdx !== null` to unblock the flow.
    fireEvent.click(screen.getByRole('button', { name: /human/i }));
    clickNext();

    // Step 3: Bonus roll — pinned to max (28) by house rule default
    clickNext();

    // Step 4: Class — pick Fighter (index 0, requires STR≥12)
    fireEvent.click(screen.getByRole('button', { name: /fighter/i }));
    clickNext();

    // Step 5: Attributes — spend all 28 bonus points.
    // + buttons are ordered: [STR+, IQ+, PIE+, VIT+, DEX+, SPD+].
    // Human base: STR=9 (cap 18, can add 9). Remaining 19 distributed across IQ/PIE/VIT/DEX/SPD.
    // Each stat is capped at 18. Dump into each slot in round-robin until all 28 spent.
    for (let spent = 0; spent < 28; spent++) {
      const plusButtons = screen.getAllByRole('button', { name: /\+/ });
      const available = plusButtons.find((b) => !(b as HTMLButtonElement).disabled);
      if (!available) break;
      fireEvent.click(available);
    }
    clickNext();

    // Step 6: Skills — dump all 10 into first available slot
    for (let i = 0; i < 10; i++) {
      const btn = screen.getAllByRole('button', { name: /\+/ })[0]!;
      if ((btn as HTMLButtonElement).disabled) break;
      fireEvent.click(btn);
    }
    clickNext();

    // Step 7: Spells — Fighter is a non-caster, isSpellsValid returns true immediately
    clickNext();

    // Step 8: Karma — auto-rolled on mount via useEffect; isKarmaValid checks karmaRolled flag
    clickNext();

    // Step 9: Review — Create character
    fireEvent.click(screen.getByRole('button', { name: /create character/i }));

    // Assert: roster now has 1 character
    const roster = readRoster();
    expect(roster.characters.length).toBe(1);
    expect(roster.characters[0]!.name).toBe('THESUS');
    expect(roster.characters[0]!.class).toBe(0); // Fighter
    expect(roster.characters[0]!.race).toBe(0);  // Human
  });
});
