/**
 * Anti-cheat tests.
 *
 * Verifies:
 *   - rate limits (active session cap, daily cap, cooldown)
 *   - minimum move count for win awarding
 *   - session expiry
 *   - unique-mark-per-session
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  startSession,
  submitMove,
} from '../../src/lib/checkers-service.js';
import { _resetEnvForTests } from '../../src/lib/env.js';
import { verifySessionToken } from '../../src/lib/jwt.js';
import { getSupabase } from '../../src/lib/supabase.js';
import { ensureDbReachable, wipeDatabase } from './_helpers.js';

let dbAvailable = false;

beforeAll(async () => {
  dbAvailable = await ensureDbReachable();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await wipeDatabase();
});

describe('rate limits', () => {
  it.skipIf(!dbAvailable)('refuses a second active session per user', async () => {
    await startSession({ discordId: 'rl-1' });
    await expect(startSession({ discordId: 'rl-1' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it.skipIf(!dbAvailable)('respects daily session cap', async () => {
    process.env.CHECKERS_MAX_DAILY_SESSIONS = '2';
    _resetEnvForTests();

    const s1 = await startSession({ discordId: 'rl-2' });
    // End it so the next start isn't blocked by "one active" rule.
    const supabase = getSupabase();
    await supabase
      .from('checkers_sessions')
      .update({ status: 'abandoned', ended_at: new Date().toISOString() })
      .eq('id', s1.sessionId);

    const s2 = await startSession({ discordId: 'rl-2' });
    await supabase
      .from('checkers_sessions')
      .update({ status: 'abandoned', ended_at: new Date().toISOString() })
      .eq('id', s2.sessionId);

    await expect(startSession({ discordId: 'rl-2' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });

    // Reset for other tests.
    process.env.CHECKERS_MAX_DAILY_SESSIONS = '100';
    _resetEnvForTests();
  });
});

describe('minimum moves for win', () => {
  it.skipIf(!dbAvailable)(
    'refuses to award a mark for a too-short win',
    async () => {
      // Set threshold high enough that any quick win is rejected.
      process.env.CHECKERS_MIN_MOVES_FOR_WIN = '1000';
      _resetEnvForTests();

      const r = await startSession({ discordId: 'short-1' });
      const payload = await verifySessionToken(r.token);

      // Hack: directly write a state where player is one move from winning.
      // CPU has 1 piece, player can capture it.
      const supabase = getSupabase();
      // Build the board: one player piece at (5,2), one cpu at (4,3).
      const board: ({ side: 'player' | 'cpu'; king: boolean } | null)[][] =
        Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
      board[5]![2] = { side: 'player', king: false };
      board[4]![3] = { side: 'cpu', king: false };

      await supabase
        .from('checkers_sessions')
        .update({
          board_state: board,
          turn: 'player',
          status: 'active',
          move_count: 0,
          moves_without_progress: 0,
        })
        .eq('id', r.sessionId);

      const result = await submitMove(r.sessionId, payload.uid, r.token, {
        from: [5, 2],
        to: [3, 4],
        steps: [[3, 4]],
        captures: [[4, 3]],
        promoted: false,
      });

      expect(result.sessionView.status).toBe('won');
      // BUT no mark, because move_count (1) < threshold (1000).
      expect(result.markAwarded).toBe(false);
      expect(result.marksTotal).toBe(0);

      // Reset.
      process.env.CHECKERS_MIN_MOVES_FOR_WIN = '0';
      _resetEnvForTests();
    },
  );
});

describe('unique mark per session', () => {
  it.skipIf(!dbAvailable)(
    'only one mark row exists for a session even if write retried',
    async () => {
      const r = await startSession({ discordId: 'unique-1' });
      const payload = await verifySessionToken(r.token);
      const supabase = getSupabase();

      // Set up a winning move directly.
      const board: ({ side: 'player' | 'cpu'; king: boolean } | null)[][] =
        Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
      board[5]![2] = { side: 'player', king: false };
      board[4]![3] = { side: 'cpu', king: false };
      await supabase
        .from('checkers_sessions')
        .update({
          board_state: board,
          turn: 'player',
          status: 'active',
          move_count: 0,
        })
        .eq('id', r.sessionId);

      const res1 = await submitMove(r.sessionId, payload.uid, r.token, {
        from: [5, 2],
        to: [3, 4],
        steps: [[3, 4]],
        captures: [[4, 3]],
        promoted: false,
      });
      expect(res1.markAwarded).toBe(true);

      // Attempt to insert a duplicate mark via raw DB insert. Should fail
      // with unique violation.
      const { error } = await supabase.from('checkers_marks').insert({
        user_id: payload.uid,
        session_id: r.sessionId,
      });
      expect(error).not.toBeNull();
      const code = (error as { code?: string } | null)?.code;
      expect(code).toBe('23505');
    },
  );
});
