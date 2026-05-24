/**
 * Session lifecycle integration tests.
 *
 * These tests exercise the service layer (not the HTTP layer) against the
 * local Supabase. To run:
 *
 *   npm run db:start        # in another terminal
 *   npm run web:test
 *
 * If the DB is not reachable, tests skip.
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  commitSession,
  getLegalMoves,
  getSession,
  resignSession,
  startSession,
  submitMove,
} from '../../src/lib/checkers-service';
import { verifySessionToken } from '../../src/lib/jwt';
import { ensureDbReachable, wipeDatabase } from './_helpers';

let dbAvailable = false;

beforeAll(async () => {
  dbAvailable = await ensureDbReachable();
});

beforeEach(async () => {
  if (!dbAvailable) return;
  await wipeDatabase();
});

describe('session lifecycle', () => {
  it.skipIf(!dbAvailable)('creates a pending session then commits to active', async () => {
    const result = await startSession({
      discordId: 'test-user-1',
      discordUsername: 'testuser',
    });
    expect(result.sessionId).toBeTruthy();
    expect(result.token).toBeTruthy();
    expect(result.gameUrl).toContain(`/checkers/${result.sessionId}?t=`);

    const payload = await verifySessionToken(result.token);
    expect(payload.sid).toBe(result.sessionId);

    // Phase 4.6.4: session starts pending — player must commit on the
    // comic cover to flip to active.
    const pendingView = await getSession(result.sessionId, payload.uid, result.token);
    expect(pendingView.status).toBe('pending');
    expect(pendingView.opponentType).toBe('unbaked');

    const activeView = await commitSession(
      result.sessionId,
      payload.uid,
      result.token,
      { opponentType: 'unbaked' },
    );
    expect(activeView.status).toBe('active');
    expect(activeView.opponentType).toBe('unbaked');
    expect(activeView.turn).toBe('player');
    expect(activeView.moveCount).toBe(0);
    // Board should be a fresh setup: 12 cpu pieces in rows 0-2, 12 player in 5-7.
    let cpuCount = 0;
    let playerCount = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = activeView.board[r]![c];
        if (!cell) continue;
        if (cell.side === 'cpu') cpuCount++;
        else playerCount++;
      }
    }
    expect(cpuCount).toBe(12);
    expect(playerCount).toBe(12);
  });

  it.skipIf(!dbAvailable)('commitSession with sheriff sets the right opponent', async () => {
    const r = await startSession({ discordId: 'test-user-sheriff' });
    const payload = await verifySessionToken(r.token);
    const view = await commitSession(r.sessionId, payload.uid, r.token, {
      opponentType: 'sheriff',
    });
    expect(view.status).toBe('active');
    expect(view.opponentType).toBe('sheriff');
  });

  it.skipIf(!dbAvailable)('commitSession rejects a second commit (409)', async () => {
    const r = await startSession({ discordId: 'test-user-doublecommit' });
    const payload = await verifySessionToken(r.token);
    await commitSession(r.sessionId, payload.uid, r.token, {
      opponentType: 'unbaked',
    });
    await expect(
      commitSession(r.sessionId, payload.uid, r.token, {
        opponentType: 'sheriff',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it.skipIf(!dbAvailable)('refuses a second active session for the same user', async () => {
    await startSession({ discordId: 'test-user-2' });
    await expect(
      startSession({ discordId: 'test-user-2' }),
    ).rejects.toThrow(/active checkers session/i);
  });

  it.skipIf(!dbAvailable)('returns legal moves for player', async () => {
    const r = await startSession({ discordId: 'test-user-3' });
    const payload = await verifySessionToken(r.token);
    // Phase 4.6.4: must commit before play.
    await commitSession(r.sessionId, payload.uid, r.token, { opponentType: 'unbaked' });
    const moves = await getLegalMoves(
      r.sessionId,
      payload.uid,
      r.token,
      undefined,
    );
    // Standard opening = 7 player moves.
    expect(moves).toHaveLength(7);
  });

  it.skipIf(!dbAvailable)('plays a move and persists CPU reply', async () => {
    const r = await startSession({ discordId: 'test-user-4' });
    const payload = await verifySessionToken(r.token);
    await commitSession(r.sessionId, payload.uid, r.token, { opponentType: 'unbaked' });
    const moves = await getLegalMoves(r.sessionId, payload.uid, r.token, undefined);
    const first = moves[0]!;
    const result = await submitMove(r.sessionId, payload.uid, r.token, first);
    expect(result.playerMove.from).toEqual(first.from);
    // After player's move and CPU reply, it's the player's turn again.
    expect(result.sessionView.turn).toBe('player');
    expect(result.sessionView.moveCount).toBe(2);
    expect(result.cpuReply).not.toBeNull();
    // Phase 4.6.4: marksRequired is per-opponent (3 for unbaked).
    expect(result.marksRequired).toBe(3);
  });

  it.skipIf(!dbAvailable)('resigns a session', async () => {
    const r = await startSession({ discordId: 'test-user-5' });
    const payload = await verifySessionToken(r.token);
    await commitSession(r.sessionId, payload.uid, r.token, { opponentType: 'unbaked' });
    const view = await resignSession(r.sessionId, payload.uid, r.token);
    expect(view.status).toBe('abandoned');
    await expect(
      resignSession(r.sessionId, payload.uid, r.token),
    ).rejects.toThrow(/not active/i);
  });

  it.skipIf(!dbAvailable)('rejects token for a different session', async () => {
    const a = await startSession({ discordId: 'test-user-6a' });
    const b = await startSession({ discordId: 'test-user-6b' });
    // Try to use B's token against A's session id with B's user id.
    const payloadB = await verifySessionToken(b.token);
    await expect(
      getSession(a.sessionId, payloadB.uid, b.token),
    ).rejects.toThrow(/does not belong/i);
  });
});
