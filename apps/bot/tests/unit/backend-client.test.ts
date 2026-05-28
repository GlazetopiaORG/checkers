/**
 * Unit tests for the backend client.
 *
 * Verifies HMAC signing is correct and error handling does the right thing.
 * Uses fetch mocks — no real network.
 */

// Phase 5.0.2: belt-and-braces env bootstrap. See README for rationale.
import '../_test-env';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BackendApiError,
  _internals,
  cancelActiveSession,
  getUserMarks,
  startSession,
} from '../../src/backend-client';
import { _resetEnvForTests } from '../../src/env';

const SECRET = 'test-secret-must-be-at-least-32-characters-long';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.DISCORD_BOT_TOKEN = 'fake.bot.token';
  process.env.DISCORD_APPLICATION_ID = '123456789012345678';
  process.env.DISCORD_GUILD_ID = '123456789012345678';
  process.env.CHECKERS_BACKEND_URL = 'http://localhost:3000';
  process.env.CHECKERS_BOT_SHARED_SECRET = SECRET;
  _resetEnvForTests();

  fetchMock = vi.fn();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function lastCall(): { url: string; init: RequestInit } {
  const calls = fetchMock.mock.calls as [string, RequestInit][];
  const last = calls[calls.length - 1];
  if (!last) throw new Error('fetch was not called');
  return { url: last[0], init: last[1] };
}

describe('HMAC signing', () => {
  it('produces a stable 64-char hex signature', () => {
    const sig = _internals.sign('{"discordId":"123"}');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    const sig2 = _internals.sign('{"discordId":"123"}');
    expect(sig).toBe(sig2);
  });

  it('produces different signatures for different bodies', () => {
    expect(_internals.sign('{"a":1}')).not.toBe(_internals.sign('{"a":2}'));
  });

  it('uses CHECKERS_BOT_SHARED_SECRET — changing the secret changes the signature', () => {
    const before = _internals.sign('{"x":1}');
    process.env.CHECKERS_BOT_SHARED_SECRET = 'different-secret-also-at-least-32-chars-long';
    _resetEnvForTests();
    const after = _internals.sign('{"x":1}');
    expect(after).not.toBe(before);
  });
});

describe('startSession', () => {
  it('POSTs to /api/checkers/session/start with signed body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        sessionId: 'sid-1',
        token: 'tok',
        expiresAt: new Date().toISOString(),
        gameUrl: 'http://localhost:3000/checkers/sid-1?t=tok',
      }),
    );

    await startSession({ discordId: '123456789012345678', discordUsername: 'tester' });

    const { url, init } = lastCall();
    expect(url).toBe('http://localhost:3000/api/checkers/session/start');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-checkers-signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.discordId).toBe('123456789012345678');
    expect(body.discordUsername).toBe('tester');
  });

  it('omits discordUsername when not provided', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        sessionId: 'sid-1',
        token: 'tok',
        expiresAt: new Date().toISOString(),
        gameUrl: 'http://localhost:3000/checkers/sid-1?t=tok',
      }),
    );

    await startSession({ discordId: '123456789012345678' });

    const { init } = lastCall();
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.discordId).toBe('123456789012345678');
    expect('discordUsername' in body).toBe(false);
  });
});

describe('getUserMarks', () => {
  it('GETs with empty-body HMAC, discordId query, and returns per-path data', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        discordId: '123456789012345678',
        marks: 3,
        required: 4,
        levelPassed: false,
        paths: {
          sheriff: { marks: 2, required: 4, passed: false },
          unbaked: { marks: 1, required: 2, passed: false },
        },
      }),
    );

    const result = await getUserMarks('123456789012345678');

    const { url, init } = lastCall();
    expect(url).toContain('/api/checkers/marks/me');
    expect(url).toContain('discordId=123456789012345678');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    const headers = init.headers as Record<string, string>;
    // Empty body signature should be the HMAC of "".
    expect(headers['x-checkers-signature']).toBe(_internals.sign(''));

    // Phase 4.6.4.1 + Phase 5.0.4: per-path data with tuned thresholds.
    expect(result.paths.sheriff.marks).toBe(2);
    expect(result.paths.sheriff.required).toBe(4);
    expect(result.paths.sheriff.passed).toBe(false);
    expect(result.paths.unbaked.marks).toBe(1);
    expect(result.paths.unbaked.required).toBe(2);
    expect(result.paths.unbaked.passed).toBe(false);
  });

  it('throws when the backend omits `paths` (no silent fallback)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        discordId: '123456789012345678',
        marks: 2,
        required: 3,
        levelPassed: false,
        // Intentionally missing `paths` — simulates an older backend.
      }),
    );

    await expect(getUserMarks('123456789012345678')).rejects.toThrow(
      /missing per-opponent `paths`/,
    );
  });

  it('throws when `paths.sheriff` is missing required fields', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        discordId: '123456789012345678',
        marks: 0,
        required: 3,
        levelPassed: false,
        paths: {
          // Missing `passed`
          sheriff: { marks: 0, required: 5 },
          unbaked: { marks: 0, required: 3, passed: false },
        },
      }),
    );
    await expect(getUserMarks('123456789012345678')).rejects.toThrow(
      /missing per-opponent `paths`/,
    );
  });
});

describe('cancelActiveSession', () => {
  it('POSTs cancel with discordId body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { cancelled: 1 }));
    const result = await cancelActiveSession('123456789012345678');
    expect(result.cancelled).toBe(1);
    const { url, init } = lastCall();
    expect(url).toBe('http://localhost:3000/api/checkers/session/cancel');
    expect(init.method).toBe('POST');
  });
});

describe('error handling', () => {
  it('throws BackendApiError on 4xx with JSON body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, {
        error: {
          code: 'RATE_LIMITED',
          message: 'Slow down',
          details: { retryAfterSeconds: 12 },
        },
      }),
    );

    let caught: unknown;
    try {
      await startSession({ discordId: '123456789012345678' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BackendApiError);
    const err = caught as BackendApiError;
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.status).toBe(429);
    expect(err.details?.retryAfterSeconds).toBe(12);
  });

  it('translates network failures into BackendApiError("NETWORK_ERROR")', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    let caught: unknown;
    try {
      await getUserMarks('123456789012345678');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BackendApiError);
    expect((caught as BackendApiError).code).toBe('NETWORK_ERROR');
    expect((caught as BackendApiError).status).toBe(0);
  });
});
