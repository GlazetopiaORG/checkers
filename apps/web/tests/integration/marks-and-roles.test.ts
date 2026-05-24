/**
 * Marks and level-pass flow.
 *
 * Verifies the 3-marks-passes-level mechanic. Role assignment itself is
 * stubbed (logs only) and wired for real in Phase 5.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  getUserMarks,
  startSession,
  submitMove,
} from '../../src/lib/checkers-service';
import { verifySessionToken } from '../../src/lib/jwt';
import { getSupabase } from '../../src/lib/supabase';
import { ensureDbReachable, wipeDatabase } from './_helpers';

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
 *
 * Phase 4.6.4.1: takes an explicit opponent so the test can simulate
 * Sheriff vs Unbaked wins independently. Defaults to 'unbaked' to match
 * the pre-4.6.4 behavior of older tests.
 */
async function playWinningMove(
  discordId: string,
  opponent: 'sheriff' | 'unbaked' = 'unbaked',
) {
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
      opponent_type: opponent,
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
  it.skipIf(!dbAvailable)('awards 1 mark per Unbaked win, passes level on 3rd', async () => {
    const r1 = await playWinningMove('marks-1', 'unbaked');
    expect(r1.markAwarded).toBe(true);
    expect(r1.marksTotal).toBe(1);
    expect(r1.marksRequired).toBe(3); // Unbaked threshold
    expect(r1.levelPassed).toBe(false);

    const r2 = await playWinningMove('marks-1', 'unbaked');
    expect(r2.markAwarded).toBe(true);
    expect(r2.marksTotal).toBe(2);
    expect(r2.levelPassed).toBe(false);

    const r3 = await playWinningMove('marks-1', 'unbaked');
    expect(r3.markAwarded).toBe(true);
    expect(r3.marksTotal).toBe(3);
    expect(r3.levelPassed).toBe(true);
  });

  it.skipIf(!dbAvailable)('REGRESSION: 2 Sheriff + 1 Unbaked does NOT pass', async () => {
    // Two Sheriff wins (path threshold is 5, not yet reached).
    const s1 = await playWinningMove('marks-mixed', 'sheriff');
    expect(s1.marksTotal).toBe(1);
    expect(s1.marksRequired).toBe(5);
    expect(s1.levelPassed).toBe(false);

    const s2 = await playWinningMove('marks-mixed', 'sheriff');
    expect(s2.marksTotal).toBe(2);
    expect(s2.levelPassed).toBe(false);

    // One Unbaked win (path threshold is 3, also not yet reached).
    const u1 = await playWinningMove('marks-mixed', 'unbaked');
    expect(u1.marksTotal).toBe(1); // Per-opponent count, not cross-path sum!
    expect(u1.marksRequired).toBe(3);
    expect(u1.levelPassed).toBe(false);

    // Verify via /marks endpoint that paths are tracked separately.
    const marks = await getUserMarks('marks-mixed');
    expect(marks.paths.sheriff.marks).toBe(2);
    expect(marks.paths.sheriff.required).toBe(5);
    expect(marks.paths.sheriff.passed).toBe(false);
    expect(marks.paths.unbaked.marks).toBe(1);
    expect(marks.paths.unbaked.required).toBe(3);
    expect(marks.paths.unbaked.passed).toBe(false);
    expect(marks.levelPassed).toBe(false); // sum is 3 but neither path passed
  });

  it.skipIf(!dbAvailable)('Sheriff and Unbaked progress remain separate', async () => {
    // 4 sheriff wins (still below 5-win threshold)
    for (let i = 0; i < 4; i++) {
      const r = await playWinningMove('marks-sep', 'sheriff');
      expect(r.levelPassed).toBe(false);
    }
    // 2 unbaked wins (still below 3-win threshold)
    for (let i = 0; i < 2; i++) {
      const r = await playWinningMove('marks-sep', 'unbaked');
      expect(r.levelPassed).toBe(false);
    }
    // Total wins: 6, but no path passed yet.
    const marks = await getUserMarks('marks-sep');
    expect(marks.paths.sheriff.marks).toBe(4);
    expect(marks.paths.unbaked.marks).toBe(2);
    expect(marks.levelPassed).toBe(false);

    // One more unbaked win clears the Unbaked path (3/3) but not Sheriff (4/5).
    const last = await playWinningMove('marks-sep', 'unbaked');
    expect(last.levelPassed).toBe(true);
    expect(last.marksTotal).toBe(3);
    expect(last.marksRequired).toBe(3);

    const after = await getUserMarks('marks-sep');
    expect(after.paths.unbaked.passed).toBe(true);
    expect(after.paths.sheriff.passed).toBe(false); // Sheriff path still incomplete
    expect(after.levelPassed).toBe(true);
  });

  it.skipIf(!dbAvailable)('passing Sheriff requires 5 Sheriff wins (not 5 total)', async () => {
    // Mix path wins: 3 Unbaked + 2 Sheriff = 5 total wins, but Sheriff
    // path has only 2 marks, so it must NOT pass.
    for (let i = 0; i < 3; i++) await playWinningMove('marks-sheriff', 'unbaked');
    for (let i = 0; i < 2; i++) await playWinningMove('marks-sheriff', 'sheriff');

    const after = await getUserMarks('marks-sheriff');
    expect(after.paths.unbaked.passed).toBe(true); // unbaked done
    expect(after.paths.sheriff.passed).toBe(false); // sheriff: 2/5
    // levelPassed is true because the OR of paths-passed is true;
    // it's not a 5-total-wins gate.
    expect(after.levelPassed).toBe(true);

    // Adding 3 more Sheriff wins (total 5 Sheriff) finally passes Sheriff.
    for (let i = 0; i < 3; i++) await playWinningMove('marks-sheriff', 'sheriff');
    const final = await getUserMarks('marks-sheriff');
    expect(final.paths.sheriff.marks).toBe(5);
    expect(final.paths.sheriff.passed).toBe(true);
  });

  it.skipIf(!dbAvailable)('user_mark_counts view returns correct total', async () => {
    await playWinningMove('marks-2', 'unbaked');
    await playWinningMove('marks-2', 'unbaked');

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
