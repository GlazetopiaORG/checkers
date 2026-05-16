/**
 * GameClient — the UI state machine.
 *
 * Responsibilities:
 *   - Hold the current server-authoritative state (board, turn, status)
 *   - Manage UI-only state (selected piece, legal moves for highlights)
 *   - Sequence animations:
 *       player move slide → optional capture fade → CPU reply with delay
 *   - Talk to the API client; never to Supabase or the engine directly
 *
 * The component renders nothing about gameplay correctness — it just shows
 * whatever the server says.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import type { Move, Position } from '@glazetopia/engine';

import {
  CheckersApiError,
  fetchLegalMoves,
  fetchSession,
  resignSession,
  submitMove,
  type SessionView,
} from '../_lib/api-client';
import { samePos } from '../_lib/coordinate';
import { Board } from './Board';
import { GameStatusBar } from './GameStatusBar';
import { MarksDisplay } from './MarksDisplay';
import { ResultOverlay } from './ResultOverlay';

/** How long to pause before showing the Unbaked's reply, in ms. */
const CPU_REPLY_DELAY = 450;
/** Match the CSS `--move-duration`. */
const ANIM_DURATION = 220;

export interface GameClientProps {
  sessionId: string;
  token: string;
  marksRequired: number;
}

type Phase =
  | 'loading'
  | 'your-turn'
  | 'sending-move'
  | 'unbaked-thinking'
  | 'won'
  | 'lost'
  | 'draw'
  | 'abandoned'
  | 'expired'
  | 'error';

interface AnimationState {
  capturedPositions: Position[];
  promotedPosition: Position | null;
}

const NO_ANIM: AnimationState = { capturedPositions: [], promotedPosition: null };

export function GameClient({
  sessionId,
  token,
  marksRequired,
}: GameClientProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [view, setView] = useState<SessionView | null>(null);
  const [selected, setSelected] = useState<Position | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [marksTotal, setMarksTotal] = useState<number>(0);
  const [justEarned, setJustEarned] = useState<boolean>(false);
  const [levelPassed, setLevelPassed] = useState<boolean>(false);
  const [anim, setAnim] = useState<AnimationState>(NO_ANIM);

  const apiOpts = { sessionId, token };

  // --- Initial load ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await fetchSession(apiOpts);
        if (cancelled) return;
        setView(v);
        setPhase(mapStatusToPhase(v.status, v.turn));
      } catch (e) {
        if (cancelled) return;
        handleApiFailure(e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token]);

  // --- Helpers --------------------------------------------------------------

  const handleApiFailure = useCallback((e: unknown) => {
    if (e instanceof CheckersApiError) {
      if (e.code === 'SESSION_EXPIRED') {
        setPhase('expired');
        return;
      }
      setErrorMsg(`${e.code}: ${e.message}`);
    } else {
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
    }
    setPhase('error');
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(null);
    setLegalMoves([]);
  }, []);

  // --- Square click handler -------------------------------------------------

  const onSquareClick = useCallback(
    async (row: number, col: number) => {
      if (phase !== 'your-turn' || !view) return;
      const cell = view.board[row]?.[col];

      // Case 1: clicking a legal destination → submit move
      const here: Position = [row, col];
      const dest = legalMoves.find((m) => samePos(m.to, here));
      if (selected && dest) {
        setPhase('sending-move');
        clearSelection();
        try {
          const result = await submitMove(
            apiOpts,
            dest.from,
            dest.to,
            // Convert readonly to mutable for transit.
            dest.captures.map((c) => [c[0], c[1]] as Position),
          );

          // Phase A: animate player's move (already mounted; board now has new state)
          setAnim({
            capturedPositions: dest.captures.map((c) => [c[0], c[1]] as Position),
            promotedPosition: dest.promoted ? dest.to : null,
          });

          // Snap view to the post-player-move state (server confirms it).
          // We can construct this without a second API call: server already
          // sent the canonical playerMove + post-CPU state. To animate the
          // player move first, we synthesize an interim state by applying just
          // the player move client-side via a quick local update.
          // Simpler approach: show the FINAL state immediately but mark
          // captured & promoted positions for the animation. The board
          // already reflects post-CPU state but capture markers render fading.
          setView(result.sessionView);
          setMarksTotal(result.marksTotal);

          if (result.markAwarded) {
            setJustEarned(true);
          }
          if (result.levelPassed) {
            setLevelPassed(true);
          }

          // If there was a CPU reply, briefly show "Unbaked considers..."
          // then snap into yourTurn (or whatever the new status is).
          if (result.cpuReply && result.sessionView.status === 'active') {
            setPhase('unbaked-thinking');
            await wait(CPU_REPLY_DELAY);
            setAnim(NO_ANIM);
            setPhase('your-turn');
          } else {
            // No CPU reply means the player's move ended the game.
            await wait(ANIM_DURATION);
            setAnim(NO_ANIM);
            setPhase(
              mapStatusToPhase(
                result.sessionView.status,
                result.sessionView.turn,
              ),
            );
          }
        } catch (e) {
          handleApiFailure(e);
        }
        return;
      }

      // Case 2: clicking your own piece → select & fetch its legal moves
      if (cell && cell.side === 'player') {
        // Toggle: clicking the already-selected piece deselects.
        if (selected && samePos(selected, here)) {
          clearSelection();
          return;
        }
        try {
          const moves = await fetchLegalMoves(apiOpts, here);
          if (moves.length === 0) {
            // The piece has no legal moves — likely because another piece has
            // a forced capture. Don't select; provide implicit feedback.
            return;
          }
          setSelected(here);
          setLegalMoves(moves);
        } catch (e) {
          handleApiFailure(e);
        }
        return;
      }

      // Case 3: clicking empty / opponent square with no selection → ignore
      // Case 4: clicking empty / opponent square while something selected → deselect
      if (selected) {
        clearSelection();
      }
    },
    [phase, view, selected, legalMoves, apiOpts, clearSelection, handleApiFailure],
  );

  // --- Resign ---------------------------------------------------------------

  const onResign = useCallback(async () => {
    if (!['your-turn', 'sending-move'].includes(phase)) return;
    const ok = window.confirm('Resign the game? This will end the session with no mark.');
    if (!ok) return;
    try {
      const v = await resignSession(apiOpts);
      setView(v);
      setPhase('abandoned');
      clearSelection();
    } catch (e) {
      handleApiFailure(e);
    }
  }, [phase, apiOpts, clearSelection, handleApiFailure]);

  // --- Render ---------------------------------------------------------------

  if (phase === 'loading' || !view) {
    return (
      <main className="game-shell">
        <header className="game-header">
          <h1 className="game-title">Glazetopia Checkers</h1>
        </header>
        <div className="state-message loading">
          <div className="spinner" aria-hidden="true" />
          <span>Loading the duel…</span>
        </div>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="game-shell">
        <header className="game-header">
          <h1 className="game-title">Glazetopia Checkers</h1>
        </header>
        <div className="state-message error" role="alert">
          <p>Something went wrong.</p>
          <p style={{ color: 'var(--ui-text-dim)', fontSize: '0.85em' }}>{errorMsg}</p>
          <p style={{ color: 'var(--ui-text-dim)', fontSize: '0.85em' }}>
            Return to Discord and run <code>/checkers</code> to try again.
          </p>
        </div>
      </main>
    );
  }

  const interactive = phase === 'your-turn';
  const isOver =
    phase === 'won' ||
    phase === 'lost' ||
    phase === 'draw' ||
    phase === 'abandoned' ||
    phase === 'expired';

  return (
    <main className="game-shell">
      <header className="game-header">
        <h1 className="game-title">Glazetopia Checkers</h1>
        <MarksDisplay
          total={marksTotal}
          required={marksRequired}
          justEarned={justEarned}
        />
      </header>

      <GameStatusBar
        state={phase as Parameters<typeof GameStatusBar>[0]['state']}
        onResign={onResign}
        canResign={!isOver}
      />

      <Board
        board={view.board}
        selected={selected}
        legalDestinations={legalMoves}
        lastMove={view.lastMove ?? null}
        capturedPositions={anim.capturedPositions}
        promotedPosition={anim.promotedPosition}
        interactive={interactive}
        onSquareClick={onSquareClick}
      />

      {isOver && (
        <ResultOverlay
          status={resolveEndStatus(view.status)}
          marksTotal={marksTotal}
          marksRequired={marksRequired}
          levelPassed={levelPassed}
        />
      )}
    </main>
  );
}

/**
 * Map any non-active status to an EndStatus, defaulting unexpected values
 * to 'draw' so the overlay always renders something.
 */
function resolveEndStatus(
  status: SessionView['status'],
): 'won' | 'lost' | 'draw' | 'abandoned' | 'expired' {
  switch (status) {
    case 'won':
    case 'lost':
    case 'draw':
    case 'abandoned':
    case 'expired':
      return status;
    default:
      return 'draw';
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function mapStatusToPhase(
  status: SessionView['status'],
  turn: SessionView['turn'],
): Phase {
  if (status === 'active') return turn === 'player' ? 'your-turn' : 'unbaked-thinking';
  if (status === 'won')       return 'won';
  if (status === 'lost')      return 'lost';
  if (status === 'draw')      return 'draw';
  if (status === 'abandoned') return 'abandoned';
  if (status === 'expired')   return 'expired';
  // 'pending' shouldn't reach the UI; treat as loading just in case.
  return 'loading';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
