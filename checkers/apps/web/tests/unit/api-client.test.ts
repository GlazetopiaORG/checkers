/**
 * Unit tests for the browser API client. Uses a fetch mock to avoid the
 * real network. We focus on the wrapper's behaviour, not the API itself
 * (that's covered by integration tests against Supabase).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CheckersApiError,
  fetchLegalMoves,
  fetchSession,
  resignSession,
  submitMove,
} from '../../src/app/checkers/[sessionId]/_lib/api-client';

const SID = '11111111-2222-3333-4444-555555555555';
const TOK = 'fake.jwt.token';

// Spies on global fetch. Recreated per test.
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  // Assign through unknown to bypass strict fetch typing in the mock.
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastCall(): { url: string; init: RequestInit } {
  const calls = fetchMock.mock.calls;
  const last = calls[calls.length - 1] as [string, RequestInit] | undefined;
  if (!last) throw new Error('fetch was not called');
  return { url: last[0], init: last[1] };
}

describe('api-client', () => {
  it('fetchSession sends bearer auth on GET', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse(200, {
        sessionId: SID,
        board: [],
        turn: 'player',
        status: 'active',
        moveCount: 0,
        movesWithoutProgress: 0,
        lastMove: null,
        expiresAt: new Date().toISOString(),
      }),
    );

    await fetchSession({ sessionId: SID, token: TOK });

    const { url, init } = lastCall();
    expect(url).toBe(`/api/checkers/session/${SID}`);
    expect(init.method).toBe('GET');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${TOK}`);
  });

  it('fetchLegalMoves passes from coordinate as query string', async () => {
    fetchMock.mockResolvedValueOnce(mockJsonResponse(200, { moves: [] }));
    await fetchLegalMoves({ sessionId: SID, token: TOK }, [5, 2]);
    expect(lastCall().url).toBe(
      `/api/checkers/session/${SID}/legal-moves?from=5,2`,
    );
  });

  it('submitMove POSTs JSON with from/to/captures', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse(200, {
        sessionView: {
          sessionId: SID,
          board: [],
          turn: 'player',
          status: 'active',
          moveCount: 2,
          movesWithoutProgress: 1,
          lastMove: null,
          expiresAt: new Date().toISOString(),
        },
        playerMove: {
          from: [5, 2],
          to: [4, 3],
          steps: [[4, 3]],
          captures: [],
          promoted: false,
        },
        cpuReply: null,
        markAwarded: false,
        levelPassed: false,
        marksTotal: 0,
      }),
    );

    await submitMove({ sessionId: SID, token: TOK }, [5, 2], [4, 3], []);

    const { init } = lastCall();
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as {
      from: number[];
      to: number[];
      captures: unknown[];
    };
    expect(body.from).toEqual([5, 2]);
    expect(body.to).toEqual([4, 3]);
    expect(body.captures).toEqual([]);
    const headers = new Headers(init.headers);
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('resignSession POSTs and returns the view', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse(200, {
        sessionId: SID,
        board: [],
        turn: 'cpu',
        status: 'abandoned',
        moveCount: 5,
        movesWithoutProgress: 0,
        lastMove: null,
        expiresAt: new Date().toISOString(),
      }),
    );

    const v = await resignSession({ sessionId: SID, token: TOK });
    expect(v.status).toBe('abandoned');
  });

  it('throws a typed error on 4xx with JSON body', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse(400, {
        error: { code: 'ILLEGAL_MOVE', message: 'bad move' },
      }),
    );

    let caught: unknown;
    try {
      await submitMove({ sessionId: SID, token: TOK }, [0, 0], [1, 1], []);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CheckersApiError);
    const err = caught as CheckersApiError;
    expect(err.code).toBe('ILLEGAL_MOVE');
    expect(err.status).toBe(400);
    expect(err.message).toBe('bad move');
  });

  it('throws NETWORK_ERROR when fetch itself rejects', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    let caught: unknown;
    try {
      await fetchSession({ sessionId: SID, token: TOK });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CheckersApiError);
    expect((caught as CheckersApiError).code).toBe('NETWORK_ERROR');
    expect((caught as CheckersApiError).status).toBe(0);
  });
});
