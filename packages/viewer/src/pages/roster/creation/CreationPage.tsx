/**
 * CreationPage — top-level component for the wpcmk character-creation flow.
 *
 * Owns:
 *   - `useReducer(creationReducer, initialCreationState(rng))` — the state machine
 *   - `WichmannHill` RNG instance (constructed once from `seed` prop)
 *   - Asset loading (`loadCreationFontSet` + `loadMessageDb`)
 *   - Screen routing: renders the correct screen component for `state.screen`
 *   - Terminal transitions: on `committing` → buildCharacterFromDraft + addCharacter + navigate
 *                           on `cancelled` → navigate without saving
 *
 * Props:
 *   `seed?`    — numeric seed for deterministic tests (default `Date.now()`).
 *               Seed 0 maps to the static boot triple (3000, 1, 29999).
 *               Any other value: derive streams as (seed%30269+1, seed%30307+1, seed%30323+1).
 *   `loaders?` — injectable asset loaders for tests (avoids fetch() in vitest/node).
 *
 * Asset loading:
 *   `useEffect` fires once on mount. Until fontSet+db are ready, renders a
 *   minimal "Loading…" <div>. Once loaded, the reducer-driven screens render.
 *
 * Key listening:
 *   Each screen component attaches its own `window.keydown` listener and
 *   detaches on unmount. Since CreationPage renders only the active screen
 *   at a time (no multi-screen overlap), exactly one listener is active.
 *   CreationPage does NOT add a top-level keydown listener of its own.
 *
 * Spec: docs/re/wpcmk-screens.md §1 (screen sequence and transitions)
 */

import { useReducer, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { WichmannHill, WIZ6_MAIN } from '@wiz6/data';
import type { Font, Font4bpp, MessageDb } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import { useState } from 'react';
import {
  initialCreationState,
  creationReducer,
} from './state.js';
import { loadCreationFontSet } from './ega/assets.js';
import { loadMessageDb as defaultLoadMessageDb } from '../../../data-loader.js';
import { addCharacter } from '../../../lib/roster-store.js';
import { buildCharacterFromDraft } from './lib/build.js';

// Screen components
import { NameInputScreen } from './screens/NameInputScreen.js';
import { MenuPickerScreen } from './screens/MenuPickerScreen.js';
import { BonusAllocatorScreen } from './screens/BonusAllocatorScreen.js';
import { PersonalityScreen } from './screens/PersonalityScreen.js';
import { PortraitPickerScreen } from './screens/PortraitPickerScreen.js';
import { SkillTrainScreen } from './screens/SkillTrainScreen.js';
import { SpellPickScreen } from './screens/SpellPickScreen.js';
import { ConfirmScreen } from './screens/ConfirmScreen.js';

// ---------------------------------------------------------------------------
// Loader interface (injectable for tests)
// ---------------------------------------------------------------------------

export interface CreationPageLoaders {
  /** 1bpp font loader. Defaults to fetch-based loadFont. */
  loadFont?: (url: string) => Promise<Font>;
  /** 4bpp font loader. Defaults to fetch-based loadFont4bpp. */
  loadFont4bpp?: (url: string) => Promise<Font4bpp>;
  /** MessageDb loader. Defaults to fetch('/msg.json'). */
  loadMessageDb?: (url: string) => Promise<MessageDb>;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CreationPageProps {
  /**
   * Numeric seed for the WichmannHill RNG.
   * - 0 → static boot triple (3000, 1, 29999) — deterministic tests
   * - Any other number → derive streams from seed
   * - Default: Date.now()
   */
  seed?: number;
  /**
   * Injectable asset loaders for tests (avoids fetch() in vitest/node).
   * Production callers use the defaults (real fetch-based loaders).
   */
  loaders?: CreationPageLoaders;
  /**
   * TEST ONLY: Override the initial reducer state.
   * Allows tests to skip directly to a specific screen (e.g. 'confirm')
   * without driving the full keydown flow.
   * Must NOT be used in production — undefined in all production paths.
   */
  _testInitialState?: import('./state.js').CreationState;
}

// ---------------------------------------------------------------------------
// Seed → WichmannHill streams
// ---------------------------------------------------------------------------

/** Moduli for the 3 WichmannHill streams (same as wichmann-hill.ts). */
const M1 = 30269;
const M2 = 30307;
const M3 = 30323;

/**
 * Derive a WichmannHill instance from a numeric seed.
 *
 * seed === 0 → static boot triple (3000, 1, 29999) per §12.
 * Any other value → three streams derived via modular reduction.
 * All streams are clamped to [1, M-1] (WichmannHill requires non-zero streams).
 */
function seedToRng(seed: number): WichmannHill {
  if (seed === 0) {
    // Static boot triple (3000, 1, 29999)
    return new WichmannHill(3000, 1, 29999);
  }
  // Derive three streams deterministically from the seed
  const s1 = ((Math.abs(seed) % (M1 - 1)) + 1);
  const s2 = ((Math.abs(seed + 7919) % (M2 - 1)) + 1);
  const s3 = ((Math.abs(seed + 15731) % (M3 - 1)) + 1);
  return new WichmannHill(s1, s2, s3);
}

// ---------------------------------------------------------------------------
// Loaded assets shape
// ---------------------------------------------------------------------------

interface LoadedAssets {
  fontSet: FontSet;
  db: MessageDb;
}

// ---------------------------------------------------------------------------
// CreationPage component
// ---------------------------------------------------------------------------

/**
 * CreationPage — owns the creation flow state machine, assets, and commit logic.
 *
 * Renders a loading indicator until assets are ready, then delegates rendering
 * to the active screen component. Watches for `committing` and `cancelled`
 * terminal states and handles navigation accordingly.
 */
export function CreationPage({ seed = Date.now(), loaders, _testInitialState }: CreationPageProps) {
  const navigate = useNavigate();

  // -------------------------------------------------------------------------
  // RNG + reducer — constructed once per mount
  // -------------------------------------------------------------------------

  // useMemo ensures the RNG is only created once even if the component
  // re-renders due to parent state changes. The seed prop is intentionally
  // not in the dependency array — changing seed after mount has no effect.
  const rng = useMemo(() => seedToRng(seed), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [state, dispatch] = useReducer(creationReducer, undefined, () =>
    _testInitialState ?? initialCreationState(rng),
  );

  // -------------------------------------------------------------------------
  // Asset loading
  // -------------------------------------------------------------------------

  const [assets, setAssets] = useState<LoadedAssets | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fontLoader = loaders?.loadFont;
    const font4bppLoader = loaders?.loadFont4bpp;
    const msgLoader = loaders?.loadMessageDb ?? defaultLoadMessageDb;

    Promise.all([
      loadCreationFontSet(
        fontLoader || font4bppLoader
          ? { loadFont: fontLoader, loadFont4bpp: font4bppLoader }
          : undefined,
      ),
      msgLoader('/messages/msg.json'),
    ]).then(([fontSet, db]) => {
      if (!cancelled) {
        setAssets({ fontSet, db });
      }
    }).catch((err: unknown) => {
      if (!cancelled) {
        console.error('[CreationPage] asset load failed:', err);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------------
  // Terminal state handlers
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (state.screen === 'committing') {
      try {
        const character = buildCharacterFromDraft(state.draft);
        addCharacter(character);
      } catch (err: unknown) {
        console.error('[CreationPage] buildCharacterFromDraft failed:', err);
      }
      navigate('/roster');
    } else if (state.screen === 'cancelled') {
      navigate('/roster');
    }
  }, [state.screen, state.draft, navigate]);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (!assets) {
    return <div>Loading…</div>;
  }

  const { fontSet, db } = assets;
  const palette = WIZ6_MAIN;

  // -------------------------------------------------------------------------
  // Screen routing — render the active screen component
  // -------------------------------------------------------------------------

  const sharedProps = {
    state,
    dispatch,
    fontSet,
    palette,
    db,
  };

  switch (state.screen) {
    case 'name':
      return <NameInputScreen {...sharedProps} />;

    case 'race':
    case 'sex':
    case 'class':
      return <MenuPickerScreen {...sharedProps} />;

    case 'bonusAllocator':
      return <BonusAllocatorScreen {...sharedProps} />;

    case 'personality':
      return <PersonalityScreen {...sharedProps} />;

    case 'portrait':
      return <PortraitPickerScreen {...sharedProps} />;

    case 'skillTrain':
      return <SkillTrainScreen {...sharedProps} />;

    case 'spellPick':
      return <SpellPickScreen {...sharedProps} />;

    case 'confirm':
      return <ConfirmScreen {...sharedProps} />;

    case 'committing':
    case 'done':
    case 'cancelled':
      // Terminal states — navigation is handled by the useEffect above.
      // Render a blank canvas while the navigate() call fires.
      return <div>Saving…</div>;

    default:
      return null;
  }
}
