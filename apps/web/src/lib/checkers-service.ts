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
  initialState,
  legalMoves as engineLegalMoves,
  type GameState,
  type Move,
  type Position,
} from '@glazetopia/engine';
import { createHash } from 'node:crypto';

import { getEnv } from './env.js';
import { ApiError } from './errors.js';
import { hashToken, signSessionToken } from './jwt.js';
import { deserializeState, serializeState } from './serialize.js';
import { getSupabase } from './supabase.js';

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
  /** Live count of non-revoked marks for the user. */
  marksTotal: number;
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

  // Persist token hash and full board state; flip status to 'active'.
  const serialized = serializeState(state);
  const { error: updateErr } = await supabase
    .from('checkers_sessions')
    .update({
      token_hash: hash,
      board_state: serialized.board,
      turn: serialized.turn,
      status: 'active',
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
// getLegalMoves — for piece-selection highlights
// -----------------------------------------------------------------------------

export async function getLegalMoves(
  sessionId: string,
  expectedUserId: string,
  presentedToken: string,
  from: Position | undefined,
): Promise<Move[]> {
  const row = await loadSessionRow(sessionId, expectedUserId, presentedToken);
  if (row.status !== 'active') return [];
  if (row.turn !== 'player') return [];
  const state = rowToState(row);
  return engineLegalMoves(state, defaultConfig, from);
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
    throw new ApiError('GAME_OVER', `Session is not active (status=${row.status})`);
  }
  if (row.turn !== 'player') {
    throw new ApiError('CONFLICT', "It is not the player's turn");
  }

  // Apply the player's move via the engine. Engine throws on illegal moves.
  let state = rowToState(row);
  let appliedPlayer: Move;
  try {
    state = applyMove(state, proposedMove, defaultConfig);
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
    const choice = cpuMove(state, defaultConfig);
    if (choice) {
      state = applyMove(state, choice, defaultConfig);
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
  const update: Record<string, unknown> = {
    board_state: finalSerialized.board,
    turn: finalSerialized.turn,
    status: state.status,
    move_count: finalSerialized.moveCount,
    moves_without_progress: finalSerialized.movesWithoutProgress,
    last_move_at: new Date().toISOString(),
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
  let markAwarded = false;
  let levelPassed = false;
  if (state.status === 'won') {
    if (finalSerialized.moveCount >= env.CHECKERS_MIN_MOVES_FOR_WIN) {
      markAwarded = await awardMark(expectedUserId, sessionId);
      if (markAwarded) {
        const totalAfter = await countUserMarks(expectedUserId);
        if (totalAfter >= env.CHECKERS_MARKS_REQUIRED) {
          // Phase 5 will wire actual Discord role assignment here. For now
          // we just log so the rest of the flow is testable end-to-end.
          // eslint-disable-next-line no-console
          console.log(
            `[phase5-stub] award level pass to user=${expectedUserId} marks=${totalAfter}`,
          );
          levelPassed = true;
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

  const marksTotal = await countUserMarks(expectedUserId);

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
    },
    playerMove: appliedPlayer,
    cpuReply,
    markAwarded,
    levelPassed,
    marksTotal,
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

async function awardMark(userId: string, sessionId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase.from('checkers_marks').insert({
    user_id: userId,
    session_id: sessionId,
  });
  if (!error) return true;
  // 23505 = unique violation on session_id — mark already exists for this
  // session. Idempotent: treat as "already awarded, do not double-credit."
  const code = (error as { code?: string }).code;
  if (code === '23505') return false;
  throw new ApiError('INTERNAL_ERROR', `Failed to award mark: ${error.message}`);
}

async function countUserMarks(userId: string): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('count_user_marks', {
    p_user_id: userId,
  });
  if (error) {
    throw new ApiError(
      'INTERNAL_ERROR',
      `Failed to count marks: ${error.message}`,
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
  marks: number;
  required: number;
  levelPassed: boolean;
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
    // User has never played. Not an error — return zero marks.
    return {
      discordId,
      marks: 0,
      required: env.CHECKERS_MARKS_REQUIRED,
      levelPassed: false,
    };
  }

  const userId = (user as { id: string }).id;
  const marks = await countUserMarks(userId);

  return {
    discordId,
    marks,
    required: env.CHECKERS_MARKS_REQUIRED,
    levelPassed: marks >= env.CHECKERS_MARKS_REQUIRED,
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

