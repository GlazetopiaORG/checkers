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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// =============================================================================
// PHASE 5.0.10 BUILD STAMP & SELF-VERIFICATION
// =============================================================================
// The deployed Vercel bundle has been shipping older code than these zips
// for several phases now. To prove unambiguously which version is running,
// this file carries a signature line that's grep-able both in source and
// in the minified bundle (the string survives minification).
//
// If you see "GLAZETOPIA_GAMECLIENT_SIGNATURE_v5_0_10" in the live page's
// JS bundle, the patches are deployed. If not, the deployed bundle is
// older.
//
// To inspect the live bundle:
//   1. Open the live game page
//   2. View Source / DevTools → Sources → find the relevant chunk
//   3. Search for "GLAZETOPIA_GAMECLIENT_SIGNATURE"
// The string will be inlined verbatim by Next's bundler.
const GLAZETOPIA_GAMECLIENT_SIGNATURE_v5_0_10 =
  'phase5.0.10 — auto-lift uses status!==pending; commit gated by render';

const BUILD_STAMP = `phase5.0.10 — ${GLAZETOPIA_GAMECLIENT_SIGNATURE_v5_0_10}`;

if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.log(
    `%c[GameClient] LIVE GAMECLIENT LOADED — ${BUILD_STAMP}`,
    'background:#222;color:#5fe46a;font-weight:bold;padding:4px 8px;border-radius:4px;',
  );
  // eslint-disable-next-line no-console
  console.log(
    `[GameClient] SIGNATURE: ${GLAZETOPIA_GAMECLIENT_SIGNATURE_v5_0_10}`,
  );
}
// =============================================================================


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

  // Phase 5.0.7: synchronous lock against double-clicks. React state
  // (`committing`) is async — between two clicks fired in the same tick,
  // `committing` may still read false on the second click. A ref flips
  // immediately on first click, blocking any later invocation in the
  // same render cycle.
  const commitInFlightRef = useRef(false);

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
  //
  // Phase 5.0.7: full idempotent flow:
  //   1. Synchronous ref lock — second click in same tick is a no-op
  //   2. Pre-commit refetch — verify status is STILL pending RIGHT BEFORE POST
  //      (catches the case where session was committed between page load
  //      and click — e.g. another tab, slow network, or any race)
  //   3. If pre-commit refetch shows non-pending → treat as success (no POST)
  //   4. If commit returns 409 → treat as success (refetch, lift, never
  //      leave phase stuck at 'pending-commit')
  //   5. Ref released in finally so the button can be retried on error
  const handleCoverOpen = useCallback(async () => {
    // -------- SYNCHRONOUS LOCK (runs before any await) --------
    // eslint-disable-next-line no-console
    console.info('[checkers/cover-open] invoked', {
      hasView: !!view,
      viewStatus: view?.status,
      viewTurn: view?.turn,
      phase,
      coverLifted,
      committing,
      commitInFlight: commitInFlightRef.current,
      opponent,
    });

    if (commitInFlightRef.current) {
      // eslint-disable-next-line no-console
      console.warn('[checkers/cover-open] BLOCKED: commit already in flight (ref lock)');
      return;
    }
    commitInFlightRef.current = true;
    // eslint-disable-next-line no-console
    console.info('[checkers/cover-open] commit lock acquired');

    // Always persist the character regardless of commit success.
    saveCharacter(character);

    try {
      if (!view) {
        // eslint-disable-next-line no-console
        console.warn('[checkers/cover-open] SKIPPED: view not loaded');
        setCommitError('Session not loaded yet.');
        return;
      }

      // -------- EARLY GATE on local view --------
      // If the local view already shows non-pending, lift cover and exit.
      // No network call, no risk of 409.
      if (view.status !== 'pending') {
        // eslint-disable-next-line no-console
        console.info(
          `[checkers/cover-open] SKIPPED commit: local view.status=${view.status} (already committed). ` +
            'Lifting cover and reconciling phase from view.',
        );
        setPhase(mapStatusToPhase(view.status, view.turn));
        setOpponent(coerceOpponentId(view.opponentType));
        setCoverLifted(true);
        setCommitError(null);
        return;
      }

      // -------- PRE-COMMIT REFETCH --------
      // Verify the session is STILL pending right before we POST. This
      // catches the production race where the user holds the cover open
      // long enough for another tab / a retry / a slow response cycle
      // to flip the session to active. Without this, the stale local
      // view sends us straight into the 409.
      setCommitting(true);
      setCommitError(null);

      // eslint-disable-next-line no-console
      console.info('[checkers/cover-open] pre-commit refetch in progress…');
      let latest = view;
      try {
        latest = await fetchSession(apiOpts);
        // eslint-disable-next-line no-console
        console.info('[checkers/cover-open] latest status before commit', {
          status: latest.status,
          turn: latest.turn,
          opponentType: latest.opponentType,
        });
        setView(latest);
      } catch (refetchErr) {
        // Refetch failed — proceed with the local view we have. If it's
        // already non-pending the next branch handles it; otherwise the
        // commit POST will hit the 409 branch which also handles it.
        // eslint-disable-next-line no-console
        console.warn(
          '[checkers/cover-open] pre-commit refetch failed, falling back to local view:',
          refetchErr,
        );
      }

      // After refetch: if status flipped to non-pending, skip commit.
      if (latest.status !== 'pending') {
        // eslint-disable-next-line no-console
        console.info(
          `[checkers/cover-open] SKIPPED commit after refetch: status=${latest.status}. ` +
            'Lifting cover (no POST sent).',
        );
        setPhase(mapStatusToPhase(latest.status, latest.turn));
        setOpponent(coerceOpponentId(latest.opponentType));
        setCoverLifted(true);
        setCommitError(null);
        return;
      }

      // -------- COMMIT POST --------
      // eslint-disable-next-line no-console
      console.info('[checkers/cover-open] CALLING commitSession (status=pending)', {
        opponent,
      });
      try {
        const v = await commitSession(apiOpts, opponent);
        // eslint-disable-next-line no-console
        console.info('[checkers/cover-open] commitSession succeeded', {
          newStatus: v.status,
          newTurn: v.turn,
        });
        setView(v);
        setPhase(mapStatusToPhase(v.status, v.turn));
        setOpponent(coerceOpponentId(v.opponentType));
        setCoverLifted(true);
      } catch (e) {
        if (e instanceof CheckersApiError && e.code === 'CONFLICT') {
          // 409: the session is already committed (race, retry, or any
          // other reason). Per spec: treat as success. Refetch, sync,
          // lift, and ENSURE phase is no longer 'pending-commit'.
          // eslint-disable-next-line no-console
          console.info('[checkers/cover-open] 409 treated as success');
          try {
            const v = await fetchSession(apiOpts);
            // eslint-disable-next-line no-console
            console.info('[checkers/cover-open] post-409 refetch', {
              status: v.status,
              turn: v.turn,
            });
            setView(v);
            setPhase(mapStatusToPhase(v.status, v.turn));
            setOpponent(coerceOpponentId(v.opponentType));
            setCoverLifted(true);
            setCommitError(null);
          } catch (e2) {
            // Refetch failed but server confirmed active. Force phase
            // off 'pending-commit' using the locally-known opponent and
            // assume player's turn (safe default; reconciliation effect
            // and next user action will correct anything off).
            // eslint-disable-next-line no-console
            console.error(
              '[checkers/cover-open] post-409 refetch failed; forcing phase=your-turn anyway:',
              e2,
            );
            setPhase('your-turn');
            setCoverLifted(true);
            setCommitError(null);
          }
          return;
        }
        if (e instanceof CheckersApiError) {
          // eslint-disable-next-line no-console
          console.error(`[checkers/cover-open] commit failed: ${e.code}: ${e.message}`);
          setCommitError(`${e.code}: ${e.message}`);
        } else {
          // eslint-disable-next-line no-console
          console.error('[checkers/cover-open] commit threw non-API error:', e);
          setCommitError(e instanceof Error ? e.message : 'Failed to open the comic');
        }
      }
    } finally {
      setCommitting(false);
      // Release the lock so the user can retry on legitimate errors.
      // Success paths have already lifted the cover (so the button no
      // longer exists for pending-session render), making retry impossible
      // by structural means.
      commitInFlightRef.current = false;
      // eslint-disable-next-line no-console
      console.info('[checkers/cover-open] commit lock released');
    }
    // apiOpts is recreated per render but it's a thin {sessionId, token}
    // object — fine. handleApiFailure is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, opponent, view, sessionId, token, phase, coverLifted, committing]);

  // --- Initial load ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // eslint-disable-next-line no-console
        console.info('[checkers/init] fetching session', { sessionId });
        const v = await fetchSession(apiOpts);
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.info('[checkers/init] session loaded', {
          status: v.status,
          turn: v.turn,
          moveCount: v.moveCount,
          hasLastMove: v.lastMove !== null,
          opponentType: v.opponentType,
        });
        setView(v);
        setPhase(mapStatusToPhase(v.status, v.turn));
        // Phase 4.6.4: if the session was already committed (i.e. user
        // refreshed mid-game), seed the opponent state from the view so
        // the picker pre-selects and the CPU art is correct.
        setOpponent(coerceOpponentId(v.opponentType));

        // Phase 5.0.5/5.0.6: auto-lift cover for ANY non-pending session.
        // The cover ONLY stays up for fresh `pending` sessions where the
        // player still needs to pick character + opponent. This catches:
        //   - refresh of an active session (with or without moves)
        //   - refresh of a completed session
        //   - URL hash dev-shortcut
        //
        // CRITICAL: the cover is the ONLY surface that can call commit().
        // Lifting it on load + the render-time gate below means commit()
        // is unreachable for any non-pending session.
        const hashSkip =
          typeof window !== 'undefined' && window.location.hash === '#skip-intro';
        const shouldLift = hashSkip || v.status !== 'pending';
        // eslint-disable-next-line no-console
        console.info('[checkers/init] cover auto-lift decision', {
          shouldLift,
          hashSkip,
          isPending: v.status === 'pending',
          reason: hashSkip
            ? 'dev hash skip'
            : v.status !== 'pending'
              ? `status=${v.status} (not pending)`
              : 'staying up for character/opponent selection',
        });
        if (shouldLift) {
          setCoverLifted(true);
        }
      } catch (e) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[checkers/init] fetchSession failed:', e);
        handleApiFailure(e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, token]);

  // --- Cover-lift guarantee -------------------------------------------------
  //
  // Phase 5.0.6: if the session is not pending, coverLifted MUST be true
  // so the board is interactive. This is a belt-and-braces effect on top
  // of the initial-load auto-lift — in case anything ever sets
  // coverLifted=false during an active session (e.g. a future refactor),
  // this immediately corrects it.
  useEffect(() => {
    if (!view) return;
    if (view.status !== 'pending' && !coverLifted) {
      // eslint-disable-next-line no-console
      console.info(
        `[checkers/lift-guarantee] forcing coverLifted=true for status=${view.status}`,
      );
      setCoverLifted(true);
    }
  }, [view, coverLifted]);

  // --- Phase reconciliation -------------------------------------------------
  //
  // Defensive guard: if view.status no longer matches the current phase
  // (e.g. status went pending → active via a commit, or active → won
  // via a move-result race), re-derive phase from view.
  //
  // Without this, `interactive` could stay false in edge cases where
  // phase is stuck at 'pending-commit' but view.status is 'active'.
  //
  // Transient phases (sending-move, unbaked-thinking, error) are
  // intentionally allowed to differ from view.status — they're local
  // UI states without a server counterpart.
  useEffect(() => {
    if (!view) return;
    const transientPhase =
      phase === 'sending-move' ||
      phase === 'unbaked-thinking' ||
      phase === 'error';
    if (transientPhase) return;
    const expected = mapStatusToPhase(view.status, view.turn);
    if (expected !== phase) {
      // eslint-disable-next-line no-console
      console.info(
        `[checkers/reconcile] phase mismatch ${phase} → ${expected} (view.status=${view.status} turn=${view.turn})`,
      );
      setPhase(expected);
    }
  }, [view, phase]);

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

  // Phase 5.0.6: STRICT render-time gate. ComicCover and PageLift are
  // ONLY mounted when the session is pending — i.e. when the player still
  // needs to choose character + opponent and commit. For every other
  // status, the cover doesn't exist in the DOM, so its onClick handler
  // (which calls handleCoverOpen → potentially commit) is unreachable.
  //
  // This is the structural fix for the live 409 bug: regardless of any
  // state-management edge case, an active session has no path to
  // commit() because the button doesn't exist.
  const needsIntro = view.status === 'pending';

  // Stage content used in both branches (kept identical for layout parity).
  const stageContent = (
    <>
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
    </>
  );

  // One-time debug log of the final render decision. Visible in the
  // browser console so we can verify on the live deploy.
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line no-console
    console.debug('[checkers/render]', {
      viewStatus: view.status,
      viewTurn: view.turn,
      phase,
      coverLifted,
      interactive,
      drawOffered: view.drawOffered,
      needsIntro,
      mountsCover: needsIntro,
    });
  }

  return (
    <main className={shellClass}>
      <section className="game-stage" aria-label="Glazetopia Checkers stage">
        {needsIntro ? (
          // Pending session: render the cover + PageLift wrapper so the
          // player can pick character/opponent and tap to commit.
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
            {stageContent}
          </PageLift>
        ) : (
          // Any non-pending session: render the stage directly. No cover,
          // no PageLift, no commit handler in scope. The board is the
          // top-level interactive surface from the first paint.
          <div className="game-stage__direct">{stageContent}</div>
        )}
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
