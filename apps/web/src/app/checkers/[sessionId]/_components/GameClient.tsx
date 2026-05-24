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

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Move, Position } from '@glazetopia/engine';

import {
  acceptDraw,
  CheckersApiError,
  commitSession,
  declineDraw,
  fetchLegalMoves,
  fetchSession,
  resignSession,
  submitMove,
  type SessionView,
} from '../_lib/api-client';
import { anyPlayerCaptureAvailable, samePos } from '../_lib/coordinate';
import { DEFAULT_CHARACTER, type CharacterId } from '../_lib/characters';
import { loadCharacter, saveCharacter } from '../_lib/character-storage';
import {
  DEFAULT_OPPONENT_ID,
  OPPONENT_DISPLAY,
  coerceOpponentId,
  type OpponentId,
} from '../_lib/opponents';
import { themeForSession } from '../_lib/themes';
import { Board } from './Board';
import { ComicCover } from './ComicCover';
import { CrumbTrail } from './CrumbTrail';
import { DrawOfferOverlay } from './DrawOfferOverlay';
import { GameStatusBar } from './GameStatusBar';
import { MarksDisplay } from './MarksDisplay';
import { PageLift } from './PageLift';
import { ResultOverlay } from './ResultOverlay';

/**
 * Animation pacing — must stay in sync with checkers.css custom properties.
 * Slower than Phase 3 so captures and CPU replies read clearly.
 *
 *   piece-land  (CSS --move-jump)     560ms
 *   piece-melt  (CSS --capture-melt)  620ms
 *   piece-promote (CSS --promote-flash) 420ms
 *
 * Sequencing rules of thumb:
 *   - Hold the player's landed piece for ~MOVE_LAND_MS before the CPU moves
 *   - Captured-piece melt overlaps the landing; full melt completes a beat after
 *   - CPU "thinking" pulse is the breathing room between player's land and CPU's land
 */
const MOVE_LAND_MS = 560;
const CAPTURE_MELT_MS = 620;
/** Time the "Unbaked considers…" pulse shows after player's move resolves. */
const CPU_REPLY_DELAY = 750;

export interface GameClientProps {
  sessionId: string;
  token: string;
  // Phase 5: removed `marksRequired` prop. The HUD now derives required-marks
  // from the session's opponentType (or, before commit, from the player's
  // current opponent selection). The server is still authoritative on every
  // server response — each MoveResult carries the per-opponent value, and
  // the HUD reconciles.
}

type Phase =
  | 'loading'
  | 'pending-commit'
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
  /** Where the most recently moved piece lives now — gets the jump-land anim. */
  justLandedPosition: Position | null;
}

const NO_ANIM: AnimationState = {
  capturedPositions: [],
  promotedPosition: null,
  justLandedPosition: null,
};

export function GameClient({
  sessionId,
  token,
}: GameClientProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [view, setView] = useState<SessionView | null>(null);
  const [selected, setSelected] = useState<Position | null>(null);
  const [legalMoves, setLegalMoves] = useState<Move[]>([]);
  const [marksTotal, setMarksTotal] = useState<number>(0);
  // Phase 5: marksRequired tracks the server-authoritative value from the
  // most recent MoveResult. Initialized to 0; once we know the opponent
  // (from the session view or the player's cover selection), the derived
  // `effectiveMarksRequired` below takes over for display.
  const [marksRequired, setMarksRequired] = useState<number>(0);
  const [justEarned, setJustEarned] = useState<boolean>(false);
  const [levelPassed, setLevelPassed] = useState<boolean>(false);
  const [anim, setAnim] = useState<AnimationState>(NO_ANIM);

  // Phase 4.6 — comic cover + theme.
  //
  // Theme is picked deterministically from the session id so refreshing
  // doesn't shuffle it. The cover shows on first load and stays until the
  // player taps it, unless any of these are true:
  //   - URL contains `#skip-intro` (developer shortcut)
  //   - Session already has lastMove (player refreshed mid-game)
  const theme = useMemo(() => themeForSession(sessionId), [sessionId]);
  const [coverLifted, setCoverLifted] = useState<boolean>(false);

  // Phase 4.6.3: chosen character. Initial value comes from localStorage
  // (defaults to D'Lish if none stored). The picker on the comic cover
  // can change this; the choice is persisted to localStorage when the
  // player commits by tapping "Open the comic".
  const [character, setCharacter] = useState<CharacterId>(DEFAULT_CHARACTER);

  // Phase 4.6.4: chosen opponent. Default to Unbaked for parity with
  // existing behavior. The backend is authoritative — this value is only
  // used as the client's display preference until it gets committed to
  // the session at cover-open. After commit, the SessionView's
  // opponentType becomes the source of truth.
  const [opponent, setOpponent] = useState<OpponentId>(DEFAULT_OPPONENT_ID);

  // Phase 5: which opponent should the HUD reflect right now?
  //   - Once we have a session view with opponentType, that's the truth
  //     (the server committed it; gameplay is on that path).
  //   - Before commit (cover still up), use the player's current cover
  //     selection so they see "0 / 5" the moment they tap Sheriff.
  // The function tolerates view being null during the very first render.
  const effectiveOpponent: OpponentId = view
    ? coerceOpponentId(view.opponentType)
    : opponent;

  // Phase 5: marks-required for the HUD.
  //   - If the server has spoken (marksRequired > 0 from a MoveResult), trust it.
  //     This is the authoritative path during active play.
  //   - Otherwise, mirror from the client display registry (which is kept
  //     in sync with the server registry — see _lib/opponents.ts comment).
  //     This is only used pre-first-move so the cover and the first board
  //     view show the correct path threshold.
  // The server wins after one move either way — if the registries diverge,
  // marksRequired from the server replaces the mirror immediately.
  const effectiveMarksRequired: number =
    marksRequired > 0 ? marksRequired : OPPONENT_DISPLAY[effectiveOpponent].marksRequired;

  // Commit-in-flight state for the cover CTA.
  const [committing, setCommitting] = useState<boolean>(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // Hydrate the character from localStorage on the client AFTER mount,
  // so we don't get an SSR/CSR mismatch. Empty deps — runs once.
  useEffect(() => {
    setCharacter(loadCharacter());
  }, []);

  const handleCharacterChange = useCallback((id: CharacterId) => {
    setCharacter(id);
  }, []);

  const handleOpponentChange = useCallback((id: OpponentId) => {
    setOpponent(id);
    // Clear any prior commit error when the player changes selection —
    // they may be retrying after a transient failure.
    setCommitError(null);
  }, []);

  const apiOpts = { sessionId, token };

  // Phase 4.6.4: cover-open commits the opponent (and persists the
  // character locally). Only after the backend confirms (status → active)
  // does the cover lift.
  const handleCoverOpen = useCallback(async () => {
    // Always persist the character regardless of commit success.
    saveCharacter(character);

    if (!view) {
      // Shouldn't happen — cover only shows when we have a view — but
      // guard anyway.
      setCommitError('Session not loaded yet.');
      return;
    }

    // If the session is already active (e.g. mid-game refresh), there's
    // nothing to commit. Just lift the cover.
    if (view.status !== 'pending') {
      setCoverLifted(true);
      return;
    }

    setCommitting(true);
    setCommitError(null);
    try {
      const v = await commitSession(apiOpts, opponent);
      setView(v);
      setPhase(mapStatusToPhase(v.status, v.turn));
      setCoverLifted(true);
    } catch (e) {
      if (e instanceof CheckersApiError) {
        if (e.code === 'CONFLICT') {
          // Another tab already committed, or we raced. Refetch and lift.
          try {
            const v = await fetchSession(apiOpts);
            setView(v);
            setPhase(mapStatusToPhase(v.status, v.turn));
            setCoverLifted(true);
            return;
          } catch (e2) {
            handleApiFailure(e2);
            return;
          }
        }
        setCommitError(`${e.code}: ${e.message}`);
      } else {
        setCommitError(e instanceof Error ? e.message : 'Failed to open the comic');
      }
    } finally {
      setCommitting(false);
    }
    // handleApiFailure is stable; apiOpts is recreated per render but it's
    // a thin {sessionId, token} object — fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, opponent, view, sessionId, token]);

  // --- Initial load ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await fetchSession(apiOpts);
        if (cancelled) return;
        setView(v);
        setPhase(mapStatusToPhase(v.status, v.turn));
        // Phase 4.6.4: if the session was already committed (i.e. user
        // refreshed mid-game), seed the opponent state from the view so
        // the picker pre-selects and the CPU art is correct.
        setOpponent(coerceOpponentId(v.opponentType));

        // Auto-skip the comic cover when:
        //   1. URL contains #skip-intro (developer shortcut)
        //   2. The game is already in progress (player refreshed mid-game)
        //   3. The session has already ended somehow
        // Note: a fresh pending session does NOT skip — the cover stays
        // so the player can pick character + opponent.
        const hashSkip =
          typeof window !== 'undefined' && window.location.hash === '#skip-intro';
        const inProgress = v.lastMove !== null || v.moveCount > 0;
        const ended = v.status !== 'active' && v.status !== 'pending';
        if (hashSkip || inProgress || ended) {
          setCoverLifted(true);
        }
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

          // ---- Animation sequence (Phase 4.5) ----
          //
          // Backend has already applied BOTH the player's move and the CPU's
          // reply, and `result.sessionView.board` is the post-CPU state.
          // For visual clarity we play these as two distinct animation beats:
          //
          //   Beat 1 (now → +MOVE_LAND_MS):
          //     Render the intermediate state (post-player, pre-CPU).
          //     Player's piece animates "just landed" at dest.to.
          //     Captured pieces from the player's move melt away.
          //
          //   Beat 2 (+CPU_REPLY_DELAY → +CPU_REPLY_DELAY + MOVE_LAND_MS):
          //     Render the final state. CPU's piece animates "just landed".
          //     Captured pieces from the CPU's move melt away.
          //
          // Applying the player's move locally is a pure rendering transform —
          // we're not deciding anything; the server already authoritatively
          // confirmed this exact move. If the local apply diverges from the
          // server, that's a bug we'd want to see, not a security issue.

          const playerMove = result.playerMove;
          const playerCaptures = playerMove.captures.map(
            (c) => [c[0], c[1]] as Position,
          );

          if (result.cpuReply && result.sessionView.status === 'active') {
            // Compute intermediate board for Beat 1.
            const intermediateBoard = applyMoveToBoardSnapshot(view.board, playerMove);

            setView({
              ...view,
              board: intermediateBoard,
              turn: 'cpu',
              lastMove: playerMove,
              moveCount: view.moveCount + 1,
            });
            setAnim({
              capturedPositions: playerCaptures,
              promotedPosition: playerMove.promoted ? (playerMove.to as Position) : null,
              justLandedPosition: playerMove.to as Position,
            });
            setPhase('unbaked-thinking');

            // Hold Beat 1 long enough for jump-land + a beat of "thinking".
            await wait(CPU_REPLY_DELAY);

            // ---- Beat 2: CPU's reply ----
            const cpu = result.cpuReply;
            const cpuCaptures = cpu.captures.map(
              (c) => [c[0], c[1]] as Position,
            );

            setView(result.sessionView);
            setAnim({
              capturedPositions: cpuCaptures,
              promotedPosition: cpu.promoted ? (cpu.to as Position) : null,
              justLandedPosition: cpu.to as Position,
            });

            await wait(MOVE_LAND_MS + 80);
            setAnim(NO_ANIM);
            setPhase('your-turn');
          } else {
            // No CPU reply: the player's move ended the game.
            setView(result.sessionView);
            setAnim({
              capturedPositions: playerCaptures,
              promotedPosition: playerMove.promoted ? (playerMove.to as Position) : null,
              justLandedPosition: playerMove.to as Position,
            });
            await wait(Math.max(MOVE_LAND_MS, CAPTURE_MELT_MS) + 80);
            setAnim(NO_ANIM);
            setPhase(
              mapStatusToPhase(
                result.sessionView.status,
                result.sessionView.turn,
              ),
            );
          }

          setMarksTotal(result.marksTotal);
          setMarksRequired(result.marksRequired);
          if (result.markAwarded) setJustEarned(true);
          if (result.levelPassed) setLevelPassed(true);
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

  // --- Draw offer state -----------------------------------------------------
  // The draw overlay is driven by view.drawOffered + a busy/error pair used
  // while a request is in flight.

  const [drawBusy, setDrawBusy] = useState<boolean>(false);
  const [drawError, setDrawError] = useState<string | null>(null);

  // --- Resign ---------------------------------------------------------------

  const onResign = useCallback(async () => {
    // Allow resign during normal play AND while the draw overlay is showing.
    // The third button in the draw overlay reuses this handler.
    const allowedPhases = ['your-turn', 'sending-move', 'unbaked-thinking'];
    if (!allowedPhases.includes(phase)) return;
    // Skip the confirm dialog if the draw overlay is open — the player has
    // already chosen "Resign" from a 3-button picker.
    const isFromDrawOverlay = view?.drawOffered === true;
    if (!isFromDrawOverlay) {
      const ok = window.confirm('Resign the game? This will end the session with no mark.');
      if (!ok) return;
    }
    setDrawBusy(true);
    setDrawError(null);
    try {
      const v = await resignSession(apiOpts);
      setView(v);
      setPhase('abandoned');
      clearSelection();
    } catch (e) {
      if (isFromDrawOverlay && e instanceof CheckersApiError) {
        setDrawError(e.message);
      } else {
        handleApiFailure(e);
      }
    } finally {
      setDrawBusy(false);
    }
  }, [phase, apiOpts, view, clearSelection, handleApiFailure]);

  // --- Draw: Keep Playing ---------------------------------------------------

  const onKeepPlaying = useCallback(async () => {
    if (!view?.drawOffered) return;
    setDrawBusy(true);
    setDrawError(null);
    try {
      const v = await declineDraw(apiOpts);
      setView(v);
      // After decline, the server has reset moves_without_progress and
      // cleared draw_offered. Status stays 'active' and turn is unchanged.
      setPhase(mapStatusToPhase(v.status, v.turn));
      clearSelection();
    } catch (e) {
      if (e instanceof CheckersApiError) {
        setDrawError(e.message);
      } else {
        handleApiFailure(e);
      }
    } finally {
      setDrawBusy(false);
    }
  }, [view, apiOpts, clearSelection, handleApiFailure]);

  // --- Draw: Accept ---------------------------------------------------------

  const onAcceptDraw = useCallback(async () => {
    if (!view?.drawOffered) return;
    setDrawBusy(true);
    setDrawError(null);
    try {
      const v = await acceptDraw(apiOpts);
      setView(v);
      setPhase('draw');
      clearSelection();
    } catch (e) {
      if (e instanceof CheckersApiError) {
        setDrawError(e.message);
      } else {
        handleApiFailure(e);
      }
    } finally {
      setDrawBusy(false);
    }
  }, [view, apiOpts, clearSelection, handleApiFailure]);

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

  const interactive =
    phase === 'your-turn' && coverLifted && !view.drawOffered;
  const isOver =
    phase === 'won' ||
    phase === 'lost' ||
    phase === 'draw' ||
    phase === 'abandoned' ||
    phase === 'expired';

  // Apply theme class to the page shell so theme tokens cascade to every
  // child. `theme-page-bg` additionally swaps the page background for
  // themes that define one.
  const shellClass = `game-shell ${theme.cssClass} theme-page-bg`;

  return (
    <main className={shellClass}>
      <section className="game-stage" aria-label="Glazetopia Checkers stage">
        <PageLift
          lifted={coverLifted}
          cover={
            <ComicCover
              theme={theme}
              selectedCharacter={character}
              selectedOpponent={opponent}
              onCharacterChange={handleCharacterChange}
              onOpponentChange={handleOpponentChange}
              onOpen={handleCoverOpen}
              busy={committing}
              errorMessage={commitError}
            />
          }
        >
          {/* Stage content — header + status sit above the play row, all
              inside the same unified frame. The PageLift overlay sits on
              top of THIS whole subtree during intro. */}
          <header className="game-stage__header">
            <h1 className="game-title">Glazetopia Checkers</h1>
            <MarksDisplay
              total={marksTotal}
              required={effectiveMarksRequired}
              justEarned={justEarned}
              opponent={effectiveOpponent}
            />
          </header>

          <GameStatusBar
            state={narrowPhaseForStatusBar(phase)}
            onResign={onResign}
            canResign={!isOver && coverLifted}
          />

          <div className="game-stage__play">
            <div className="game-stage__board">
              <Board
                board={view.board}
                selected={selected}
                legalDestinations={legalMoves}
                lastMove={view.lastMove ?? null}
                capturedPositions={anim.capturedPositions}
                promotedPosition={anim.promotedPosition}
                justLandedPosition={anim.justLandedPosition}
                interactive={interactive}
                playerCharacter={character}
                opponent={coerceOpponentId(view.opponentType)}
                onSquareClick={onSquareClick}
              />
            </div>
            <div className="game-stage__panel">
              <CrumbTrail
                sessionId={sessionId}
                theme={theme}
                phase={narrowPhaseForCrumb(phase)}
                marksTotal={marksTotal}
                marksRequired={effectiveMarksRequired}
                moveCount={view.moveCount}
                opponent={effectiveOpponent}
                capturesAvailable={
                  phase === 'your-turn' && anyPlayerCaptureAvailable(view.board)
                }
                visible={coverLifted}
              />
            </div>
          </div>
        </PageLift>
      </section>

      {/* Phase 4.6.3: draw offered. Shown before the ResultOverlay check
          because the game is still active but the player must make a choice. */}
      {view.drawOffered && !isOver && coverLifted && (
        <DrawOfferOverlay
          movesWithoutProgress={view.movesWithoutProgress}
          busy={drawBusy}
          errorMessage={drawError}
          onKeepPlaying={onKeepPlaying}
          onAcceptDraw={onAcceptDraw}
          onResign={onResign}
        />
      )}

      {isOver && (
        <ResultOverlay
          status={resolveEndStatus(view.status)}
          marksTotal={marksTotal}
          marksRequired={effectiveMarksRequired}
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
  // Phase 4.6.4: pending sessions stay on the cover until commit.
  if (status === 'pending')   return 'pending-commit';
  return 'loading';
}

/**
 * Narrow the broader Phase type to the subset the CrumbTrail expects.
 * The 'loading' and 'error' phases have their own early-return render
 * paths, so they never reach the CrumbTrail; this defensively maps them
 * to 'your-turn' if they ever did.
 */
function narrowPhaseForCrumb(
  p: Phase,
): 'your-turn' | 'sending-move' | 'unbaked-thinking' | 'won' | 'lost' | 'draw' | 'abandoned' | 'expired' {
  switch (p) {
    case 'your-turn':
    case 'sending-move':
    case 'unbaked-thinking':
    case 'won':
    case 'lost':
    case 'draw':
    case 'abandoned':
    case 'expired':
      return p;
    default:
      return 'your-turn';
  }
}

/**
 * Phase 4.6.4: narrow Phase to the status-bar's supported values.
 * pending-commit shouldn't render in the status bar (the bar is hidden
 * during the cover), but we map it to 'loading' defensively.
 */
function narrowPhaseForStatusBar(p: Phase): 'your-turn' | 'sending-move' | 'unbaked-thinking' | 'won' | 'lost' | 'draw' | 'abandoned' | 'expired' | 'loading' {
  switch (p) {
    case 'your-turn':
    case 'sending-move':
    case 'unbaked-thinking':
    case 'won':
    case 'lost':
    case 'draw':
    case 'abandoned':
    case 'expired':
    case 'loading':
      return p;
    case 'pending-commit':
    case 'error':
    default:
      return 'loading';
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Apply a server-confirmed move to a board snapshot, returning a new board.
 *
 * This is a PURE RENDERING transform — used to compute the intermediate
 * board state for the player's-move animation beat. The server is still the
 * sole authority on what moves are legal; this just replays a confirmed
 * move for visual sequencing.
 *
 * Intentionally duplicates a tiny bit of engine logic (move application)
 * rather than importing the engine into the client bundle. Keeps the
 * trust model clean: the client cannot generate moves, only render them.
 */
function applyMoveToBoardSnapshot(
  board: SessionView['board'],
  move: Move,
): SessionView['board'] {
  // Shallow-clone rows (cells are immutable Piece objects, so row clone is enough).
  const next: SessionView['board'] = board.map((row) => row.slice());
  type Cell = SessionView['board'][number][number];

  const fromCell = next[move.from[0]]?.[move.from[1]];
  if (!fromCell) return board; // defensive — shouldn't happen with valid server data

  // Lift the moving piece from its origin.
  (next[move.from[0]] as Cell[])[move.from[1]] = null;

  // Remove captured pieces.
  for (const [r, c] of move.captures) {
    (next[r] as Cell[])[c] = null;
  }

  // Place the piece at its destination, promoting if the server says so.
  const placed: Cell = move.promoted ? { ...fromCell, king: true } : fromCell;
  (next[move.to[0]] as Cell[])[move.to[1]] = placed;

  return next;
}
