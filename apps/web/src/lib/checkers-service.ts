/**
 * Checkers service.
 *
 * This is the only module that talks to both the engine and Supabase.
 * API route handlers should be thin shells that:
 *   1. Authenticate the request
 *   2. Validate input shape
 *   3. Call a service function
 *   4. Return the response
 *
 * All business rules (anti-cheat, mark awarding, status transitions) live here.
 */

import {
  applyMove,
  cpuMove,
  defaultConfig,
  drawAvailable,
  initialState,
  legalMoves as engineLegalMoves,
  makeConfig,
  type GameConfig,
  type GameState,
  type Move,
  type Position,
} from '@glazetopia/engine';
import { createHash } from 'node:crypto';

import { getEnv } from './env';
import { ApiError } from './errors';
import { requestRoleGrant } from './bot-client';
import { hashToken, signSessionToken } from './jwt';
import {
  coerceOpponentType,
  OPPONENTS,
  parseOpponentTypeStrict,
  type OpponentType,
} from './opponents';
import { deserializeState, serializeState } from './serialize';
import { getSupabase } from './supabase';

// -----------------------------------------------------------------------------
// Types exposed to the API layer
// -----------------------------------------------------------------------------

export interface StartSessionInput {
  discordId: string;
  discordUsername?: string | undefined;
  ipHash?: string | undefined;
}

export interface StartSessionResult {
  sessionId: string;
  token: string;
  expiresAt: string;
  gameUrl: string;
}

export interface SessionView {
  sessionId: string;
  board: GameState['board'];
  turn: GameState['turn'];
  status: GameState['status'];
  moveCount: number;
  movesWithoutProgress: number;
  lastMove: Move | null;
  expiresAt: string;
  /**
   * Phase 4.6.3: true when the no-progress threshold has been reached
   * and the player can choose Keep Playing / Accept Draw / Resign.
   * Backend-controlled; the client cannot modify it directly.
   */
  drawOffered: boolean;
  /**
   * Phase 4.6.4: which opponent path this session is on. The client uses
   * this for display (CPU art, lore copy) — the BACKEND uses it for
   * authoritative decisions (AI depth, marks-required).
   */
  opponentType: OpponentType;
}

export interface MoveResult {
  sessionView: SessionView;
  playerMove: Move;
  /** Null if the player's move ended the game. */
  cpuReply: Move | null;
  /** Set when the player wins this session AND a mark is awarded. */
  markAwarded: boolean;
  /** Set when this mark crossed the threshold and the level was passed. */
  levelPassed: boolean;
  /**
   * Live count of non-revoked marks for the user ON THE CURRENT PATH.
   * Phase 4.6.4: marks are tracked per-opponent. This count reflects
   * the opponent path the session is on.
   */
  marksTotal: number;
  /** Phase 4.6.4: marks required to pass this opponent's path. */
  marksRequired: number;
}

// -----------------------------------------------------------------------------
// startSession — called by the bot via /session/start
// -----------------------------------------------------------------------------

export async function startSession(
  input: StartSessionInput,
): Promise<StartSessionResult> {
  const env = getEnv();
  const supabase = getSupabase();

  // Opportunistic cleanup of stale sessions before we apply per-user limits.
  await supabase.rpc('expire_stale_sessions');

  // Upsert user.
  const user = await upsertUser(input.discordId, input.discordUsername);

  // Rate-limit checks.
  await enforceRateLimits(user.id);

  // Build initial state.
  const state = initialState();
  const expiresAt = new Date(
    Date.now() + env.CHECKERS_SESSION_TTL_MINUTES * 60_000,
  );

  // Insert the session row with a temporary token_hash; we'll sign the
  // JWT with the assigned id, then update the row with the real hash.
  // The session is created in 'pending' status — it stays pending until
  // the player commits character + opponent choices via POST /commit
  // (typically when they tap "Open the Comic"). This is the Phase 4.6.4
  // single-commit point.
  const { data: inserted, error: insertErr } = await supabase
    .from('checkers_sessions')
    .insert({
      user_id: user.id,
      token_hash: 'pending',
      board_state: serializeState(state).board,
      turn: state.turn,
      status: 'pending',
      move_count: 0,
      moves_without_progress: 0,
      expires_at: expiresAt.toISOString(),
      ip_hash: input.ipHash ?? null,
      // opponent_type left as the DB default ('unbaked') until commit;
      // backend will reject submitMove on pending sessions, so the
      // player must commit before play starts.
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Failed to create session: ${insertErr?.message ?? 'no row returned'}`,
    );
  }

  const sessionId = (inserted as { id: string }).id;

  // Sign the token with the real session id.
  const { token, hash } = await signSessionToken(
    sessionId,
    user.id,
    env.CHECKERS_SESSION_TTL_MINUTES,
  );

  // Persist token hash and full board state; status stays 'pending'.
  const serialized = serializeState(state);
  const { error: updateErr } = await supabase
    .from('checkers_sessions')
    .update({
      token_hash: hash,
      board_state: serialized.board,
      turn: serialized.turn,
      // status remains 'pending' until commitSession is called.
    })
    .eq('id', sessionId);

  if (updateErr) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Failed to finalize session: ${updateErr.message}`,
    );
  }

  return {
    sessionId,
    token,
    expiresAt: expiresAt.toISOString(),
    gameUrl: `${env.CHECKERS_GAME_URL}/checkers/${sessionId}?t=${encodeURIComponent(token)}`,
  };
}

// -----------------------------------------------------------------------------
// getSession — load the player's current view of a session
// -----------------------------------------------------------------------------

export async function getSession(
  sessionId: string,
  expectedUserId: string,
  presentedToken: string,
): Promise<SessionView> {
  const row = await loadSessionRow(sessionId, expectedUserId, presentedToken);
  return rowToView(row);
}

// -----------------------------------------------------------------------------
// commitSession — Phase 4.6.4
//
// Single-commit point invoked when the player taps "Open the Comic":
//   - Validates the session is still 'pending' (cannot re-commit later)
//   - Accepts an opponentType (sheriff | unbaked) — character is purely
//     cosmetic and client-managed, so it does NOT flow through here
//   - Flips status from 'pending' to 'active'
//   - opponent_type is IMMUTABLE after this call
//
// Backend authority:
//   - Difficulty (AI depth) is derived from opponent_type via the OPPONENTS
//     registry. Client cannot send difficulty or marks-required.
//   - Once status='active', any subsequent commit attempt is rejected.
// -----------------------------------------------------------------------------

export interface CommitSessionInput {
  /** 'sheriff' or 'unbaked' — backend validates strictly */
  opponentType: unknown;
}

export async function commitSession(
  sessionId: string,
  expectedUserId: string,
  presentedToken: string,
  input: CommitSessionInput,
): Promise<SessionView> {
  const supabase = getSupabase();
  const row = await loadSessionRow(sessionId, expectedUserId, presentedToken);

  if (row.status !== 'pending') {
    // Idempotency: returning the current view is friendlier than 4xx,
    // but spec says opponent must be immutable once active — so 409.
    throw new ApiError(
      'CONFLICT',
      `Session has already been committed (status=${row.status}); opponent is immutable`,
    );
  }

  let opponentType: OpponentType;
  try {
    opponentType = parseOpponentTypeStrict(input.opponentType);
  } catch (err) {
    throw new ApiError(
      'BAD_REQUEST',
      err instanceof Error ? err.message : 'Invalid opponentType',
    );
  }

  // Phase 5.0.12: explicitly request the updated row back. If the
  // .eq('status', 'pending') race-safety check doesn't match (because
  // the row was already flipped, or RLS silently filtered it), the
  // UPDATE matches zero rows but Supabase still returns no `error`.
  // Without this check, the function would fabricate a "active" view
  // while the DB row stays at 'pending', and every subsequent call
  // (getLegalMoves, submitMove) would short-circuit because the row's
  // status isn't 'active'.
  const { data: updatedRows, error } = await supabase
    .from('checkers_sessions')
    .update({
      status: 'active',
      opponent_type: opponentType,
    })
    .eq('id', sessionId)
    .eq('status', 'pending') // race-safety: only flip if still pending
    .select('id, status, opponent_type');
  if (error) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Failed to commit session: ${error.message}`,
    );
  }
  if (!updatedRows || updatedRows.length === 0) {
    // Either the row was already committed by another caller (race) or
    // RLS hid it. Reload the row and return its current shape — caller
    // gets the truth. If it's still 'pending' the caller will see that
    // and can investigate; otherwise we treat it as success (idempotent).
    const fresh = await loadSessionRow(sessionId, expectedUserId, presentedToken);
    if (fresh.status === 'pending') {
      // UPDATE was silently filtered — DB state is wrong.
      throw new ApiError(
        'INTERNAL_ERROR',
        'commit UPDATE matched zero rows; session row remains pending. ' +
          'Check Supabase RLS policies for checkers_sessions UPDATE.',
      );
    }
    return rowToView(fresh);
  }

  return rowToView({
    ...row,
    status: 'active',
    opponent_type: opponentType,
  });
}

// -----------------------------------------------------------------------------
// getLegalMoves — for piece-selection highlights
// -----------------------------------------------------------------------------

export async function getLegalMoves(
  sessionId: string,
  expectedUserId: string,
  presentedToken: string,
  from: Position | undefined,
): Promise<Move[]> {
  const row = await loadSessionRow(sessionId, expectedUserId, presentedToken);

  // Phase 5.0.12: log every call so we can see in Vercel logs WHY a request
  // returned []. The most common cause has been row.status !== 'active'.
  // eslint-disable-next-line no-console
  console.log('[api/legal-moves] request', {
    sessionId,
    rowStatus: row.status,
    rowTurn: row.turn,
    rowOpponentType: row.opponent_type,
    rowMoveCount: row.move_count,
    from,
  });

  if (row.status !== 'active') {
    // eslint-disable-next-line no-console
    console.warn(
      `[api/legal-moves] returning [] because status=${row.status} (expected 'active')`,
    );
    return [];
  }
  if (row.turn !== 'player') {
    // eslint-disable-next-line no-console
    console.warn(
      `[api/legal-moves] returning [] because turn=${row.turn} (expected 'player')`,
    );
    return [];
  }
  const state = rowToState(row);
  const moves = engineLegalMoves(state, defaultConfig, from);
  // eslint-disable-next-line no-console
  console.log(`[api/legal-moves] engine returned ${moves.length} moves`);
  return moves;
}

// -----------------------------------------------------------------------------
// submitMove — the main game loop endpoint
// -----------------------------------------------------------------------------

export async function submitMove(
  sessionId: string,
  expectedUserId: string,
  presentedToken: string,
  proposedMove: Move,
): Promise<MoveResult> {
  const env = getEnv();
  const supabase = getSupabase();

  const row = await loadSessionRow(sessionId, expectedUserId, presentedToken);

  if (row.status !== 'active') {
    // 'pending' lands here too — the session needs commitSession first.
    throw new ApiError('GAME_OVER', `Session is not active (status=${row.status})`);
  }
  if (row.turn !== 'player') {
    throw new ApiError('CONFLICT', "It is not the player's turn");
  }

  // Phase 4.6.4: opponent is authoritative from the session row.
  // The engine config used for the CPU's reply is derived from it; the
  // client cannot influence AI depth.
  const opponentType = coerceOpponentType(row.opponent_type);
  const opponent = OPPONENTS[opponentType];
  const engineConfig: GameConfig = makeConfig({ aiDepth: opponent.aiDepth });

  // Apply the player's move via the engine. Engine throws on illegal moves.
  let state = rowToState(row);
  let appliedPlayer: Move;
  try {
    // Player moves don't depend on aiDepth, but pass the same config for
    // consistency (also handles draw threshold from config in detectWinner).
    state = applyMove(state, proposedMove, engineConfig);
    // After applyMove, lastMove holds the canonical move with steps/captures
    // populated. We re-read it because the caller-provided Move may have
    // missing or stale fields.
    appliedPlayer = state.lastMove!;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown engine error';
    throw new ApiError('ILLEGAL_MOVE', message);
  }

  // Persist the player's move to the audit log.
  await recordMove(sessionId, row.move_count, 'player', appliedPlayer, state.board);

  // If the player's move ended the game, finalize. Otherwise let the CPU move.
  let cpuReply: Move | null = null;
  if (state.status === 'active' && state.turn === 'cpu') {
    // engineConfig carries the per-opponent aiDepth — this is where the
    // Sheriff vs Unbaked difficulty actually takes effect.
    const choice = cpuMove(state, engineConfig);
    if (choice) {
      state = applyMove(state, choice, engineConfig);
      cpuReply = state.lastMove!;
      await recordMove(sessionId, state.moveCount - 1, 'cpu', cpuReply, state.board);
    }
  }

  // Build update payload for the session row.
  const finalSerialized = serializeState(state);
  const isTerminal =
    state.status === 'won' ||
    state.status === 'lost' ||
    state.status === 'draw';
  // Phase 4.6.3: if the game is still active but the no-progress threshold
  // has been reached, offer the player a draw choice instead of ending
  // the game automatically.
  const drawOffered = !isTerminal && drawAvailable(state, engineConfig);
  const update: Record<string, unknown> = {
    board_state: finalSerialized.board,
    turn: finalSerialized.turn,
    status: state.status,
    move_count: finalSerialized.moveCount,
    moves_without_progress: finalSerialized.movesWithoutProgress,
    last_move_at: new Date().toISOString(),
    draw_offered: drawOffered,
  };
  if (isTerminal) {
    update.ended_at = new Date().toISOString();
  }

  const { error: updErr } = await supabase
    .from('checkers_sessions')
    .update(update)
    .eq('id', sessionId);
  if (updErr) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Failed to persist session: ${updErr.message}`,
    );
  }

  // Mark awarding: ONLY when player won AND the game has enough moves.
  // Phase 4.6.4: marks are stamped with the opponent_type and counted
  // per-opponent.
  let markAwarded = false;
  let levelPassed = false;
  if (state.status === 'won') {
    if (finalSerialized.moveCount >= env.CHECKERS_MIN_MOVES_FOR_WIN) {
      markAwarded = await awardMark(expectedUserId, sessionId, opponentType);
      if (markAwarded) {
        const totalAfter = await countUserMarksByOpponent(expectedUserId, opponentType);
        if (totalAfter >= opponent.marksRequired) {
          levelPassed = true;
          // eslint-disable-next-line no-console
          console.log(
            `[phase5] ${opponentType} path passed for user=${expectedUserId} ` +
              `marks=${totalAfter}/${opponent.marksRequired}`,
          );

          // Phase 5: request the bot to grant the Discord role. This call
          // is fire-and-log: any failure (bot down, network error, role
          // hierarchy issue) is logged but does NOT throw, so the player's
          // win response succeeds regardless. Manual reconciliation can
          // re-grant later if needed.
          //
          // We resolve the Discord ID from the users table — the session
          // row only has the internal user UUID. If the lookup fails (e.g.
          // RLS misconfiguration), we log and continue.
          try {
            const { data: userRow, error: userLookupErr } = await supabase
              .from('users')
              .select('discord_id')
              .eq('id', expectedUserId)
              .single();
            if (userLookupErr || !userRow) {
              // eslint-disable-next-line no-console
              console.error(
                `[phase5] role-grant skipped — user lookup failed ` +
                  `user=${expectedUserId} err=${userLookupErr?.message ?? 'no row'}`,
              );
            } else {
              const discordId = (userRow as { discord_id: string }).discord_id;
              await requestRoleGrant({
                discordId,
                opponentType,
                marksTotal: totalAfter,
                marksRequired: opponent.marksRequired,
              });
            }
          } catch (err) {
            // Belt-and-braces: requestRoleGrant already swallows errors,
            // but a Supabase exception could escape. Log and continue.
            // eslint-disable-next-line no-console
            console.error(
              `[phase5] role-grant unexpected exception user=${expectedUserId} ` +
                `path=${opponentType} err=${
                  err instanceof Error ? err.message : String(err)
                }`,
            );
          }
        }
      }
    } else {
      // Defensive: even though we recorded the win, refuse to grant the mark.
      // The session is still "won" in the DB for audit, but no mark is created.
      // eslint-disable-next-line no-console
      console.warn(
        `[anti-cheat] Suspiciously short win refused: session=${sessionId} moves=${finalSerialized.moveCount}`,
      );
    }
  }

  // marksTotal reflects PER-OPPONENT progress (the path the player is on)
  // so the UI can show "3/5" or "2/3" correctly.
  const marksTotal = await countUserMarksByOpponent(expectedUserId, opponentType);

  return {
    sessionView: {
      sessionId,
      board: finalSerialized.board,
      turn: finalSerialized.turn,
      status: state.status,
      moveCount: finalSerialized.moveCount,
      movesWithoutProgress: finalSerialized.movesWithoutProgress,
      lastMove: finalSerialized.lastMove,
      expiresAt: row.expires_at,
      drawOffered,
      opponentType,
    },
    playerMove: appliedPlayer,
    cpuReply,
    markAwarded,
    levelPassed,
    marksTotal,
    marksRequired: opponent.marksRequired,
  };
}

// -----------------------------------------------------------------------------
// resignSession
// -----------------------------------------------------------------------------

export async function resignSession(
  sessionId: string,
  expectedUserId: string,
  presentedToken: string,
): Promise<SessionView> {
  const supabase = getSupabase();
  const row = await loadSessionRow(sessionId, expectedUserId, presentedToken);
  if (row.status !== 'active' && row.status !== 'pending') {
    throw new ApiError('GAME_OVER', `Session is not active (status=${row.status})`);
  }
  const { error } = await supabase
    .from('checkers_sessions')
    .update({
      status: 'abandoned',
      ended_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
  if (error) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Failed to resign session: ${error.message}`,
    );
  }
  return rowToView({ ...row, status: 'abandoned', ended_at: new Date().toISOString() });
}

// -----------------------------------------------------------------------------
// acceptDraw / declineDraw — Phase 4.6.3
//
// Both routes require:
//   - The session must be in the draw-offered state (draw_offered = true)
//   - The session must still be active
//
// acceptDraw  → status = 'draw', session ends, no mark.
// declineDraw → draw_offered = false, moves_without_progress = 0, play continues.
//
// The CONFLICT error code is used when the client requests these actions on
// a session that isn't currently offering a draw — prevents racing the
// client into faking a draw acceptance on an arbitrary session.
// -----------------------------------------------------------------------------

export async function acceptDraw(
  sessionId: string,
  expectedUserId: string,
  presentedToken: string,
): Promise<SessionView> {
  const supabase = getSupabase();
  const row = await loadSessionRow(sessionId, expectedUserId, presentedToken);

  if (row.status !== 'active') {
    throw new ApiError('GAME_OVER', `Session is not active (status=${row.status})`);
  }
  if (!row.draw_offered) {
    throw new ApiError(
      'CONFLICT',
      'A draw has not been offered on this session',
    );
  }

  const endedAt = new Date().toISOString();
  const { error } = await supabase
    .from('checkers_sessions')
    .update({
      status: 'draw',
      ended_at: endedAt,
      draw_offered: false,
    })
    .eq('id', sessionId);
  if (error) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Failed to accept draw: ${error.message}`,
    );
  }
  return rowToView({
    ...row,
    status: 'draw',
    ended_at: endedAt,
    draw_offered: false,
  });
}

export async function declineDraw(
  sessionId: string,
  expectedUserId: string,
  presentedToken: string,
): Promise<SessionView> {
  const supabase = getSupabase();
  const row = await loadSessionRow(sessionId, expectedUserId, presentedToken);

  if (row.status !== 'active') {
    throw new ApiError('GAME_OVER', `Session is not active (status=${row.status})`);
  }
  if (!row.draw_offered) {
    throw new ApiError(
      'CONFLICT',
      'A draw has not been offered on this session',
    );
  }

  const { error } = await supabase
    .from('checkers_sessions')
    .update({
      draw_offered: false,
      // Per Phase 4.6.3 design decision (A): reset the no-progress count
      // when the player commits to keep playing. The next draw offer can
      // come at the threshold again later.
      moves_without_progress: 0,
    })
    .eq('id', sessionId);
  if (error) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Failed to decline draw: ${error.message}`,
    );
  }
  return rowToView({
    ...row,
    moves_without_progress: 0,
    draw_offered: false,
  });
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  board_state: GameState['board'];
  turn: GameState['turn'];
  status: GameState['status'] | 'pending' | 'abandoned' | 'expired';
  move_count: number;
  moves_without_progress: number;
  started_at: string;
  last_move_at: string | null;
  ended_at: string | null;
  expires_at: string;
  ip_hash: string | null;
  /** Phase 4.6.3: column added in 20260520000001_add_draw_offered.sql */
  draw_offered: boolean;
  /** Phase 4.6.4: column added in 20260521000001_add_opponent_type.sql */
  opponent_type: OpponentType;
}

async function loadSessionRow(
  sessionId: string,
  expectedUserId: string,
  presentedToken: string,
): Promise<SessionRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('checkers_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    throw new ApiError('NOT_FOUND', 'Session not found');
  }
  const row = data as SessionRow;

  if (row.user_id !== expectedUserId) {
    // The token is for a different user than this session belongs to.
    throw new ApiError('FORBIDDEN', 'Session does not belong to this user');
  }

  if (row.token_hash !== hashToken(presentedToken)) {
    throw new ApiError(
      'UNAUTHORIZED',
      'Token mismatch — was the session re-issued?',
    );
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    // Opportunistically expire it.
    if (row.status === 'pending' || row.status === 'active') {
      await supabase
        .from('checkers_sessions')
        .update({ status: 'expired', ended_at: new Date().toISOString() })
        .eq('id', sessionId);
    }
    throw new ApiError('SESSION_EXPIRED', 'Session has expired');
  }

  return row;
}

function rowToState(row: SessionRow): GameState {
  return deserializeState({
    board: row.board_state,
    turn: row.turn as GameState['turn'],
    status: row.status as GameState['status'],
    moveCount: row.move_count,
    movesWithoutProgress: row.moves_without_progress,
    lastMove: null,
  });
}

function rowToView(row: SessionRow): SessionView {
  return {
    sessionId: row.id,
    board: row.board_state,
    turn: row.turn as GameState['turn'],
    status: row.status as GameState['status'],
    moveCount: row.move_count,
    movesWithoutProgress: row.moves_without_progress,
    lastMove: null,
    expiresAt: row.expires_at,
    drawOffered: row.draw_offered ?? false,
    opponentType: coerceOpponentType(row.opponent_type),
  };
}

async function upsertUser(
  discordId: string,
  discordUsername: string | undefined,
): Promise<{ id: string }> {
  const supabase = getSupabase();
  // Try insert first; on conflict, fetch.
  const { data: inserted, error: insertErr } = await supabase
    .from('users')
    .insert({
      discord_id: discordId,
      discord_username: discordUsername ?? null,
    })
    .select('id')
    .single();
  if (!insertErr && inserted) return { id: (inserted as { id: string }).id };

  // 23505 = unique violation. Anything else is a real error.
  const code = (insertErr as { code?: string } | null)?.code;
  if (code && code !== '23505') {
    throw new ApiError('INTERNAL_ERROR', `User upsert failed: ${insertErr?.message}`);
  }

  const { data: existing, error: selErr } = await supabase
    .from('users')
    .select('id')
    .eq('discord_id', discordId)
    .single();
  if (selErr || !existing) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `User lookup failed: ${selErr?.message ?? 'no row'}`,
    );
  }

  const existingId = (existing as { id: string }).id;

  // If the username has changed since first signup, update it.
  if (discordUsername) {
    await supabase
      .from('users')
      .update({ discord_username: discordUsername })
      .eq('id', existingId);
  }

  return { id: existingId };
}

async function enforceRateLimits(userId: string): Promise<void> {
  const env = getEnv();
  const supabase = getSupabase();

  // One active session at a time.
  const { data: activeCount, error: activeErr } = await supabase.rpc(
    'active_session_count',
    { p_user_id: userId },
  );
  if (activeErr) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Rate-limit check failed: ${activeErr.message}`,
    );
  }
  if ((activeCount as number) >= 1) {
    throw new ApiError(
      'RATE_LIMITED',
      'You already have an active checkers session. Finish or resign it first.',
    );
  }

  // Daily cap.
  const { data: daily, error: dailyErr } = await supabase.rpc(
    'daily_session_count',
    { p_user_id: userId },
  );
  if (dailyErr) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Rate-limit check failed: ${dailyErr.message}`,
    );
  }
  if ((daily as number) >= env.CHECKERS_MAX_DAILY_SESSIONS) {
    throw new ApiError(
      'RATE_LIMITED',
      `Daily session limit reached (${env.CHECKERS_MAX_DAILY_SESSIONS}).`,
    );
  }

  // Cooldown between session starts: look at the user's most recent session.
  const { data: latest, error: latestErr } = await supabase
    .from('checkers_sessions')
    .select('started_at')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Rate-limit check failed: ${latestErr.message}`,
    );
  }
  if (latest) {
    const latestRow = latest as { started_at: string };
    const gap = Date.now() - new Date(latestRow.started_at).getTime();
    const cooldownMs = env.CHECKERS_COOLDOWN_SECONDS * 1000;
    if (gap < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - gap) / 1000);
      throw new ApiError(
        'RATE_LIMITED',
        `Cooldown active: try again in ${remaining}s.`,
        { retryAfterSeconds: remaining },
      );
    }
  }
}

async function recordMove(
  sessionId: string,
  moveIndex: number,
  actor: 'player' | 'cpu',
  move: Move,
  boardAfter: GameState['board'],
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('checkers_moves').insert({
    session_id: sessionId,
    move_index: moveIndex,
    actor,
    from_sq: move.from,
    to_sq: move.to,
    captures: move.captures,
    promoted: move.promoted,
    board_after: boardAfter,
  });
  if (error) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Failed to record move: ${error.message}`,
    );
  }
}

async function awardMark(
  userId: string,
  sessionId: string,
  opponentType: OpponentType,
): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase.from('checkers_marks').insert({
    user_id: userId,
    session_id: sessionId,
    opponent_type: opponentType,
  });
  if (!error) return true;
  // 23505 = unique violation on session_id — mark already exists for this
  // session. Idempotent: treat as "already awarded, do not double-credit."
  const code = (error as { code?: string }).code;
  if (code === '23505') return false;
  throw new ApiError('INTERNAL_ERROR', `Failed to award mark: ${error.message}`);
}

/**
 * Phase 4.6.4: per-opponent mark count. The level-pass check uses this so
 * Sheriff wins only count toward the Sheriff path and Unbaked wins only
 * count toward the Unbaked path.
 */
async function countUserMarksByOpponent(
  userId: string,
  opponentType: OpponentType,
): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('count_user_marks_by_opponent', {
    p_user_id: userId,
    p_opponent_type: opponentType,
  });
  if (error) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Failed to count marks for opponent ${opponentType}: ${error.message}`,
    );
  }
  return (data as number) ?? 0;
}

/** Hashes a string with SHA-256 — used by routes to hash IPs before storing. */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// -----------------------------------------------------------------------------
// Phase 4: bot-facing helpers
// -----------------------------------------------------------------------------

export interface UserMarksResult {
  discordId: string;
  /**
   * Sum of marks across both opponent paths. This field is **deprecated
   * for display** because it implies that wins combine across paths,
   * which they don't. The bot ignores this on screen as of Phase 4.6.4.1
   * — `paths` below is the only authoritative display source.
   *
   * Kept on the wire for API compatibility with any older consumer; do
   * NOT introduce new code that uses it for level-pass decisions.
   *
   * @deprecated Use `paths.sheriff.marks` / `paths.unbaked.marks`.
   */
  marks: number;
  /**
   * Legacy single-threshold required count (env CHECKERS_MARKS_REQUIRED).
   * Phase 4.6.4 introduced per-opponent thresholds — see `paths` below
   * for the authoritative values.
   *
   * @deprecated Use `paths.sheriff.required` / `paths.unbaked.required`.
   */
  required: number;
  /**
   * True if EITHER path has been passed.
   *
   * IMPORTANT: this is `sheriffPassed || unbakedPassed`. It is **never**
   * `(sheriffMarks + unbakedMarks) >= someThreshold`. Wins on one path do
   * not contribute to passing the other.
   */
  levelPassed: boolean;
  /**
   * Phase 4.6.4: per-opponent path progress. Required field — every
   * response includes this. The bot relies on it; if the backend can't
   * compute it, the call fails rather than returning a misleading
   * combined view.
   */
  paths: {
    sheriff: { marks: number; required: number; passed: boolean };
    unbaked: { marks: number; required: number; passed: boolean };
  };
}

/**
 * Read-only: return the current non-revoked mark count for a Discord user.
 * Used by the bot's /checkers-status command.
 *
 * If the user has never played, returns 0. Never creates a user row — the
 * /checkers command is what creates users (via startSession).
 */
export async function getUserMarks(discordId: string): Promise<UserMarksResult> {
  const env = getEnv();
  const supabase = getSupabase();

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('discord_id', discordId)
    .maybeSingle();

  if (userErr) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Failed to look up user: ${userErr.message}`,
    );
  }

  if (!user) {
    return {
      discordId,
      marks: 0,
      required: env.CHECKERS_MARKS_REQUIRED,
      levelPassed: false,
      paths: {
        sheriff: { marks: 0, required: OPPONENTS.sheriff.marksRequired, passed: false },
        unbaked: { marks: 0, required: OPPONENTS.unbaked.marksRequired, passed: false },
      },
    };
  }

  const userId = (user as { id: string }).id;
  const [sheriffMarks, unbakedMarks] = await Promise.all([
    countUserMarksByOpponent(userId, 'sheriff'),
    countUserMarksByOpponent(userId, 'unbaked'),
  ]);
  const totalMarks = sheriffMarks + unbakedMarks;

  const sheriffPassed = sheriffMarks >= OPPONENTS.sheriff.marksRequired;
  const unbakedPassed = unbakedMarks >= OPPONENTS.unbaked.marksRequired;

  return {
    discordId,
    marks: totalMarks,
    required: env.CHECKERS_MARKS_REQUIRED,
    levelPassed: sheriffPassed || unbakedPassed,
    paths: {
      sheriff: {
        marks: sheriffMarks,
        required: OPPONENTS.sheriff.marksRequired,
        passed: sheriffPassed,
      },
      unbaked: {
        marks: unbakedMarks,
        required: OPPONENTS.unbaked.marksRequired,
        passed: unbakedPassed,
      },
    },
  };
}

export interface CancelSessionResult {
  cancelled: number;
}

/**
 * Cancels any active or pending sessions belonging to a Discord user.
 * Idempotent: returns the number of rows cancelled (0 if none).
 *
 * Used by the bot to recover from "I have a stuck session" cases. Cancelled
 * sessions are marked 'abandoned' so audit history is preserved.
 */
export async function cancelActiveSession(
  discordId: string,
): Promise<CancelSessionResult> {
  const supabase = getSupabase();

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('discord_id', discordId)
    .maybeSingle();

  if (userErr) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Failed to look up user: ${userErr.message}`,
    );
  }
  if (!user) {
    return { cancelled: 0 };
  }

  const userId = (user as { id: string }).id;
  const { data, error } = await supabase
    .from('checkers_sessions')
    .update({
      status: 'abandoned',
      ended_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .in('status', ['pending', 'active'])
    .select('id');

  if (error) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Failed to cancel sessions: ${error.message}`,
    );
  }

  const rows = (data as unknown[] | null) ?? [];
  return { cancelled: rows.length };
}

