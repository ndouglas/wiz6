/**
 * CreationPage — top-level component for the wpcmk character-creation flow.
 *
 * Owns:
 *   - `useReducer(creationReducer, initialCreationState(rng))` — the state machine
 *   - `WichmannHill` RNG instance (constructed once from `seed` prop)
 *   - Asset loading (`loadCreationFontSet` + `loadMessageDb`)
 *   - Screen routing: renders the correct screen component for `state.screen`
 *   - Terminal transitions: on `committing` → buildCharacterFromDraft + addCharacter +
 *                           dispatch COMMIT_DONE (returns to characterMenu)
 *                           on `exit` → navigate('/castle')
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
 * Centering wrapper:
 *   The rendered CreationCanvas is wrapped in:
 *     <main className={styles.page}><div className={styles.canvasWrap}>…</div></main>
 *   using CreationPage.module.css (same .page/.canvasWrap rules as CastleScreen.module.css).
 *
 * Spec: docs/re/wpcmk-screens.md §1 (screen sequence and transitions)
 */

import { useReducer, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { WichmannHill, WIZ6_MAIN } from '@wiz6/data';
import type { Font, Font4bpp, MessageDb, PortraitSet } from '@wiz6/data';
import type { FontSet } from '@wiz6/parser';
import { useState } from 'react';
import {
  initialCreationState,
  creationReducer,
  mergeInjectedState,
} from './state.js';
import type { CreationState, DraftState } from './state.js';
import { loadCreationFontSet } from './ega/assets.js';
import { loadMessageDb as defaultLoadMessageDb, loadPortraitSet as defaultLoadPortraitSet } from '../../../data-loader.js';
import { addCharacter, readRoster } from '../../../lib/roster-store.js';
import { getHouseRules } from '../../../lib/house-rules-store.js';
import { buildCharacterFromDraft } from './lib/build.js';

// Screen components
import { CharacterMenuScreen } from './screens/CharacterMenuScreen.js';
import { NameInputScreen } from './screens/NameInputScreen.js';
import { MenuPickerScreen } from './screens/MenuPickerScreen.js';
import { BonusAllocatorScreen } from './screens/BonusAllocatorScreen.js';
import { PersonalityScreen } from './screens/PersonalityScreen.js';
import { PortraitPickerScreen } from './screens/PortraitPickerScreen.js';
import { SkillTrainScreen } from './screens/SkillTrainScreen.js';
import { SpellPickScreen } from './screens/SpellPickScreen.js';
import { ConfirmScreen } from './screens/ConfirmScreen.js';
import { ReviewScreen } from './screens/ReviewScreen.js';
import { ReviewPickerScreen } from './screens/ReviewPickerScreen.js';
import { DeletePickerScreen } from './screens/DeletePickerScreen.js';
import { DeleteConfirmScreen } from './screens/DeleteConfirmScreen.js';
import { RenamePickerScreen } from './screens/RenamePickerScreen.js';
import { RenameInputScreen } from './screens/RenameInputScreen.js';
import { PortraitTargetPickerScreen } from './screens/PortraitTargetPickerScreen.js';
import { PortraitChangeScreen } from './screens/PortraitChangeScreen.js';
import { PortraitDoneScreen } from './screens/PortraitDoneScreen.js';

import styles from './CreationPage.module.css';

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
  /** PortraitSet loader. Defaults to fetch-based loadPortraitSet. */
  loadPortraitSet?: (url: string) => Promise<PortraitSet>;
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
  _testInitialState?: CreationState;
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
  portraits: PortraitSet[]; // wport1, wport2, wport3 — 42 portraits total
}

// ---------------------------------------------------------------------------
// CreationPage component
// ---------------------------------------------------------------------------

/**
 * CreationPage — owns the creation flow state machine, assets, and commit logic.
 *
 * Renders a loading indicator until assets are ready, then delegates rendering
 * to the active screen component. Watches for `committing` and `exit`
 * terminal states and handles them accordingly.
 *
 * Entry point: /castle/character-menu (centered in the game shell).
 */
export function CreationPage({ seed = Date.now(), loaders, _testInitialState }: CreationPageProps) {
  const navigate = useNavigate();

  // -------------------------------------------------------------------------
  // RNG + reducer — constructed once per mount
  // -------------------------------------------------------------------------

  // useMemo ensures the RNG is only created once even if the component
  // re-renders due to parent state changes. The seed prop is intentionally
  // not in the dependency array — changing seed after mount has no effect.
  const rng = useMemo(() => seedToRng(seed), []);

  const [state, dispatch] = useReducer(creationReducer, undefined, () => {
    if (_testInitialState) return _testInitialState;
    const base = initialCreationState(rng, { pinMaxBonusRoll: getHouseRules().pinMaxBonusRoll });
    // E2E-only: a Playwright test may inject a starting { screen, draft } via a
    // window global. Guarded by import.meta.env.DEV so Vite strips it from prod.
    if (import.meta.env.DEV) {
      const injected = (globalThis as { __WIZ6_E2E_STATE__?: Partial<CreationState> & { draft?: Partial<DraftState> } }).__WIZ6_E2E_STATE__;
      if (injected) return mergeInjectedState(base, injected);
    }
    return base;
  });

  // -------------------------------------------------------------------------
  // Asset loading
  // -------------------------------------------------------------------------

  const [assets, setAssets] = useState<LoadedAssets | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fontLoader = loaders?.loadFont;
    const font4bppLoader = loaders?.loadFont4bpp;
    const msgLoader = loaders?.loadMessageDb ?? defaultLoadMessageDb;
    const portraitLoader = loaders?.loadPortraitSet ?? defaultLoadPortraitSet;

    Promise.all([
      loadCreationFontSet(
        fontLoader || font4bppLoader
          ? {
              ...(fontLoader ? { loadFont: fontLoader } : {}),
              ...(font4bppLoader ? { loadFont4bpp: font4bppLoader } : {}),
            }
          : undefined,
      ),
      msgLoader('/messages/msg.json'),
      portraitLoader('/portraits/wport1.json'),
      portraitLoader('/portraits/wport2.json'),
      portraitLoader('/portraits/wport3.json'),
    ]).then(([fontSet, db, w1, w2, w3]) => {
      if (!cancelled) {
        setAssets({ fontSet, db, portraits: [w1, w2, w3] });
      }
    }).catch((err: unknown) => {
      if (!cancelled) {
        console.error('[CreationPage] asset load failed:', err);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Terminal state handlers
  // -------------------------------------------------------------------------

  // Guard against double-commit: only call addCharacter+COMMIT_DONE once
  // per entry into the 'committing' screen.
  const committingFired = useRef(false);

  useEffect(() => {
    if (state.screen === 'committing') {
      if (!committingFired.current) {
        committingFired.current = true;
        try {
          const character = buildCharacterFromDraft(state.draft);
          addCharacter(character);
        } catch (err: unknown) {
          console.error('[CreationPage] buildCharacterFromDraft failed:', err);
        }
        dispatch({ type: 'COMMIT_DONE' });
      }
    } else {
      // Reset the guard whenever we leave the committing screen.
      committingFired.current = false;
    }

    if (state.screen === 'exit') {
      navigate('/castle');
    }
  }, [state.screen, state.draft, navigate]);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (!assets) {
    return <div>Loading…</div>;
  }

  const { fontSet, db, portraits } = assets;
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

  // Read roster count synchronously for CharacterMenuScreen.
  // readRoster() is a synchronous localStorage read, so it's safe here.
  // We read it freshly on each render of the character menu so it reflects
  // the most up-to-date roster state (e.g. after a character is added or deleted).
  const rosterCount = state.screen === 'characterMenu'
    ? (() => {
        try {
          return readRoster().characters.length;
        } catch {
          return 0;
        }
      })()
    : 0;

  // Render the active screen wrapped in the centering shell.
  function renderScreen() {
    switch (state.screen) {
      case 'characterMenu':
        return <CharacterMenuScreen {...sharedProps} rosterCount={rosterCount} />;

      case 'name':
        return <NameInputScreen {...sharedProps} />;

      case 'race':
      case 'sex':
      case 'class':
        // key=state.screen forces a fresh mount (and cursor reset) on each
        // race→sex→class transition. Without it, React reuses the same
        // MenuPickerScreen instance and preserves the stale cursorIdx (e.g.
        // cursor from race=Elf index 1 carries over to sex screen, selecting
        // FEMALE instead of MALE). This is a product-correctness fix.
        return <MenuPickerScreen key={state.screen} {...sharedProps} />;

      case 'bonusAllocator':
        return <BonusAllocatorScreen {...sharedProps} />;

      case 'personality':
        return <PersonalityScreen {...sharedProps} />;

      case 'portrait':
        return <PortraitPickerScreen {...sharedProps} portraits={portraits} />;

      case 'skillTrain':
        return <SkillTrainScreen {...sharedProps} portraits={portraits} />;

      case 'spellPick':
        return <SpellPickScreen {...sharedProps} portraits={portraits} />;

      case 'confirm':
        return <ConfirmScreen {...sharedProps} portraits={portraits} />;

      case 'reviewPicker':
        return <ReviewPickerScreen {...sharedProps} />;

      case 'review':
        return <ReviewScreen {...sharedProps} portraits={portraits} />;

      case 'deletePicker':
        return <DeletePickerScreen {...sharedProps} />;

      case 'deleteConfirm':
        return <DeleteConfirmScreen {...sharedProps} portraits={portraits} />;

      case 'renamePicker':
        return <RenamePickerScreen {...sharedProps} />;

      case 'renameInput':
        return <RenameInputScreen {...sharedProps} portraits={portraits} />;

      case 'portraitPicker':
        return <PortraitTargetPickerScreen {...sharedProps} />;

      case 'portraitChange':
        return <PortraitChangeScreen {...sharedProps} portraits={portraits} />;

      case 'portraitDone':
        return <PortraitDoneScreen {...sharedProps} portraits={portraits} />;

      case 'committing':
      case 'done':
      case 'cancelled':
      case 'exit':
        // Terminal states — transition is handled by the useEffect above.
        // Render a blank canvas while the navigate() call or COMMIT_DONE fires.
        return <div>Saving…</div>;

      default:
        return null;
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.canvasWrap}>
        {renderScreen()}
      </div>
    </main>
  );
}
