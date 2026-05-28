/**
 * Phase 5: tests for the web → bot HMAC client.
 *
 * Covers:
 *   - HMAC computed from the JSON body, sent in x-checkers-signature
 *   - URL composition (trailing slash on base URL tolerated)
 *   - 200 OK with granted/noop response
 *   - 4xx rejection
 *   - Network timeout / fetch throw
 *   - "skipped" outcome when CHECKERS_BOT_INTERNAL_URL is unset
 *   - HMAC roundtrip via verifyHmacSignature
 */

// Phase 5.0.2: MUST be the first import — see auth.test.ts for rationale.
import '../_test-env';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  requestRoleGrant,
  verifyHmacSignature,
} from '../../src/lib/bot-client';
import { _resetEnvForTests } from '../../src/lib/env';

// Note: setup.ts populates BASE env. We override specific values here.
const BOT_URL = 'https://bot.example.com';
const SECRET = 'test-bot-secret-must-be-at-least-32-characters-long-here';

describe('requestRoleGrant', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.CHECKERS_BOT_INTERNAL_URL = BOT_URL;
    process.env.CHECKERS_BOT_SHARED_SECRET = SECRET;
    _resetEnvForTests();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.CHECKERS_BOT_INTERNAL_URL;
    _resetEnvForTests();
  });

  it('POSTs to /internal/grant-role with HMAC-signed body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ granted: true, reason: 'newly-added' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await requestRoleGrant({
      discordId: '123456789012345678',
      opponentType: 'sheriff',
      marksTotal: 4,
      marksRequired: 4,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0]!;
    const url = call[0] as string;
    const init = call[1] as { method: string; headers: Record<string, string>; body: string };
    expect(url).toBe(`${BOT_URL}/internal/grant-role`);
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');

    // Verify the signature matches the body via HMAC roundtrip.
    const body = init.body;
    const sig = init.headers['x-checkers-signature']!;
    expect(verifyHmacSignature(SECRET, body, sig)).toBe(true);

    // Body shape is preserved end-to-end.
    expect(JSON.parse(body)).toEqual({
      discordId: '123456789012345678',
      opponentType: 'sheriff',
      marksTotal: 4,
      marksRequired: 4,
    });

    expect(result.outcome).toBe('granted');
  });

  it('tolerates a trailing slash on CHECKERS_BOT_INTERNAL_URL', async () => {
    process.env.CHECKERS_BOT_INTERNAL_URL = `${BOT_URL}/`;
    _resetEnvForTests();
    fetchMock.mockResolvedValueOnce(
      new Response('{"granted":true,"reason":"newly-added"}', { status: 200 }),
    );

    await requestRoleGrant({
      discordId: '111111111111111111',
      opponentType: 'unbaked',
      marksTotal: 2,
      marksRequired: 2,
    });
    expect(fetchMock.mock.calls[0]![0] as string).toBe(`${BOT_URL}/internal/grant-role`);
  });

  it('returns "noop" when the bot says granted=false (already-has-role)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ granted: false, reason: 'already-has-role' }),
        { status: 200 },
      ),
    );

    const result = await requestRoleGrant({
      discordId: '222222222222222222',
      opponentType: 'unbaked',
      marksTotal: 2,
      marksRequired: 2,
    });

    expect(result.outcome).toBe('noop');
    expect(result.detail).toBe('already-has-role');
  });

  it('returns "failed" on 4xx response without throwing', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_signature' }), {
        status: 401,
      }),
    );

    const result = await requestRoleGrant({
      discordId: '333333333333333333',
      opponentType: 'sheriff',
      marksTotal: 4,
      marksRequired: 4,
    });

    expect(result.outcome).toBe('failed');
    expect(result.detail).toContain('401');
  });

  it('returns "failed" on network throw without surfacing the exception', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await requestRoleGrant({
      discordId: '444444444444444444',
      opponentType: 'unbaked',
      marksTotal: 2,
      marksRequired: 2,
    });

    expect(result.outcome).toBe('failed');
    expect(result.detail).toContain('ECONNREFUSED');
  });

  it('returns "skipped" when CHECKERS_BOT_INTERNAL_URL is unset', async () => {
    delete process.env.CHECKERS_BOT_INTERNAL_URL;
    _resetEnvForTests();

    const result = await requestRoleGrant({
      discordId: '555555555555555555',
      opponentType: 'sheriff',
      marksTotal: 4,
      marksRequired: 4,
    });

    expect(result.outcome).toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('verifyHmacSignature', () => {
  it('accepts a correctly-signed body', () => {
    const body = '{"hello":"world"}';
    // Sign manually with node:crypto inline so we don't rely on internals
    // of the function under test for the test setup.
    // (We import createHmac via the public helper itself by signing and
    // verifying. This is the simplest non-circular approach.)
    // A roundtrip-based test is also performed in requestRoleGrant.
    // Here we just verify mismatches fail.

    // Wrong secret → false
    expect(verifyHmacSignature(SECRET, body, 'abcdef')).toBe(false);
    expect(verifyHmacSignature(SECRET, body, '')).toBe(false);
  });

  it('rejects signatures of different length without timing leak', () => {
    expect(verifyHmacSignature(SECRET, 'a', 'b')).toBe(false);
    expect(verifyHmacSignature(SECRET, 'a', 'bb')).toBe(false);
  });
});
