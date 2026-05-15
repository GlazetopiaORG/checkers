/**
 * Marks and level-pass flow.
 *
 * Verifies the 3-marks-passes-level mechanic. Role assignment itself is
 * stubbed (logs only) and wired for real in Phase 5.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  startSession,
  submitMove,
} from '../../src/lib/checkers-service.js';
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

/**
 * Helper: force a session to a "one-move-from-winning" state and play the
 * winning move. Returns the move result.
 */
async function playWinningMove(discordId: string) {
  const r = await startSession({ discordId });
  const payload = await verifySessionToken(r.token);
  const supabase = getSupabase();

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

  const result = await submitMove(r.sessionId, payload.uid, r.token, {
    from: [5, 2],
    to: [3, 4],
    steps: [[3, 4]],
    captures: [[4, 3]],
    promoted: false,
  });

  // Abandon the row so the user can start a fresh session next call.
  await supabase
    .from('checkers_sessions')
    .update({ status: 'won', ended_at: new Date().toISOString() })
    .eq('id', r.sessionId);

  return result;
}

describe('marks accumulation', () => {
  it.skipIf(!dbAvailable)('awards 1 mark per win, passes level on 3rd', async () => {
    const r1 = await playWinningMove('marks-1');
    expect(r1.markAwarded).toBe(true);
    expect(r1.marksTotal).toBe(1);
    expect(r1.levelPassed).toBe(false);

    const r2 = await playWinningMove('marks-1');
    expect(r2.markAwarded).toBe(true);
    expect(r2.marksTotal).toBe(2);
    expect(r2.levelPassed).toBe(false);

    const r3 = await playWinningMove('marks-1');
    expect(r3.markAwarded).toBe(true);
    expect(r3.marksTotal).toBe(3);
    expect(r3.levelPassed).toBe(true);
  });

  it.skipIf(!dbAvailable)('user_mark_counts view returns correct total', async () => {
    await playWinningMove('marks-2');
    await playWinningMove('marks-2');

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('user_mark_counts')
      .select('marks')
      .eq('discord_id', 'marks-2')
      .single();
    expect(error).toBeNull();
    expect((data as { marks: number } | null)?.marks).toBe(2);
  });
});
