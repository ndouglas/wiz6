/**
 * StartNewGamePage — wbase MASTER OPTIONS slot 3 (START NEW GAME).
 *
 * Engine flow (docs/re/findings/maze-start-new-game.json):
 *   START NEW GAME → scenario pick → scripted entry narration → first
 *   controllable dungeon frame (game_state 5, party at entrance).
 *
 * Viewer MVP:
 *   - Empty party → show a brief "no party" message; back link stays in castle.
 *   - Non-empty party → loadDungeonLevel(0) → initGameSession(level) → /game/maze.
 *   - Scripted intro narration is DEFERRED (MVP only; not reproduced here).
 *     See TODO #078 for the narration port.
 *
 * Scripted intro deferral is intentional and noted: the engine shows a modal
 * text sequence ("YOU APPROACH THE GATE…") before the first controllable frame.
 * The viewer skips straight to /game/maze to keep the MVP unblocked.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loadDungeonLevel } from '../../data-loader.js';
import { initGameSession } from '../../game/game-session-store.js';
import { readActiveParty } from '../../lib/active-party-store.js';
import styles from './CastleStub.module.css';

type State = 'loading' | 'error' | 'no-party';

export function StartNewGamePage() {
  const navigate = useNavigate();
  const partySize = useMemo(() => readActiveParty().members.length, []);
  const [uiState, setUiState] = useState<State | null>(null);

  useEffect(() => {
    if (partySize === 0) {
      setUiState('no-party');
      return;
    }
    // Non-empty party: load level 0, init session, navigate.
    let cancelled = false;
    setUiState('loading');
    loadDungeonLevel(0)
      .then((level) => {
        if (cancelled) return;
        initGameSession(level);
        navigate('/game/maze');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[StartNewGamePage] failed to load level 0:', err);
        setUiState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [partySize, navigate]);

  if (uiState === 'no-party') {
    return (
      <main className={styles.page}>
        <h1 className={styles.heading}>Start New Game</h1>
        <p className={styles.lede}>
          You need at least one party member to start a new game.
          Add a character first, then return here.
        </p>
        <Link to="/castle" className={styles.back}>
          ← back to Master Options
        </Link>
      </main>
    );
  }

  if (uiState === 'error') {
    return (
      <main className={styles.page}>
        <h1 className={styles.heading}>Start New Game</h1>
        <p className={styles.lede}>
          Failed to load the dungeon level. Check the console for details.
        </p>
        <Link to="/castle" className={styles.back}>
          ← back to Master Options
        </Link>
      </main>
    );
  }

  // 'loading' or null (before effect fires): show a minimal loading state.
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Start New Game</h1>
      <p className={styles.lede}>Loading dungeon…</p>
    </main>
  );
}
