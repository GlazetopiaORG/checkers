/**
 * Phase 5: tests for the bot's internal HTTP server.
 *
 * Coverage focus is on the security boundary, not the discord.js layer.
 * The role-service is mocked. We verify:
 *   - HMAC signature is REQUIRED and validated (constant-time)
 *   - Malformed payloads return 400 with a useful detail
 *   - Bad opponentType is rejected
 *   - Valid payloads reach grantLevelPassedRole with the right shape
 *   - Idempotency: already-has-role returns 200 with granted=false
 *   - Discord errors don't escape as 500 — they're 200 + structured reason
 *   - GET /healthz works without auth
 */

// Phase 5.0.2: belt-and-braces env bootstrap. See README for rationale.
import '../_test-env';

import { createHmac } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Mock the role-service before importing http-server.
vi.mock('../../src/role-service', () => ({
  grantLevelPassedRole: vi.fn(),
}));

import { grantLevelPassedRole } from '../../src/role-service';
import { startBotHttpServer, _internals } from '../../src/http-server';
import { _resetEnvForTests } from '../../src/env';

const SECRET = 'test-bot-secret-must-be-at-least-32-characters-long-here';
const ROLE_ID = '1504455432260026478';
const GUILD_ID = '1263855713353207900';

function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

// Mock Discord client — never actually used because role-service is mocked,
// but the server passes it through.
const mockClient = {} as unknown as Parameters<typeof startBotHttpServer>[0];

let serverHandle: Awaited<ReturnType<typeof startBotHttpServer>>;
let baseUrl: string;

beforeAll(async () => {
  // Phase 5.0.1: _test-env (loaded via vitest setupFiles) already seeds
  // baseline values. We override the GUILD/ROLE snowflakes with the
  // specific values this test asserts against, and the secret matches
  // the bootstrap value so HMAC roundtrips work.
  process.env.DISCORD_GUILD_ID = GUILD_ID;
  process.env.DISCORD_LEVEL_PASSED_ROLE_ID = ROLE_ID;
  process.env.CHECKERS_BOT_SHARED_SECRET = SECRET;
  process.env.BOT_HTTP_PORT = '0'; // 0 = OS-assigned ephemeral port
  _resetEnvForTests();

  serverHandle = await startBotHttpServer(mockClient);
  baseUrl = `http://127.0.0.1:${serverHandle.port}`;
});

afterAll(async () => {
  await serverHandle.close();
  delete process.env.DISCORD_LEVEL_PASSED_ROLE_ID;
  _resetEnvForTests();
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

describe('GET /healthz', () => {
  it('returns 200 OK without authentication', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// HMAC validation
// ---------------------------------------------------------------------------

describe('POST /internal/grant-role: HMAC validation', () => {
  it('rejects requests with no signature header (401)', async () => {
    const body = JSON.stringify({
      discordId: '123456789012345678',
      opponentType: 'sheriff',
      marksTotal: 4,
      marksRequired: 4,
    });
    const res = await fetch(`${baseUrl}/internal/grant-role`, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('invalid_signature');
  });

  it('rejects requests with a wrong signature (401)', async () => {
    const body = JSON.stringify({
      discordId: '123456789012345678',
      opponentType: 'sheriff',
      marksTotal: 4,
      marksRequired: 4,
    });
    const res = await fetch(`${baseUrl}/internal/grant-role`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-checkers-signature': 'deadbeef',
      },
    });
    expect(res.status).toBe(401);
  });

  it('rejects when signature length differs (timing-safe path)', async () => {
    const body = '{"x":1}';
    const res = await fetch(`${baseUrl}/internal/grant-role`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-checkers-signature': 'a', // way too short
      },
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

describe('POST /internal/grant-role: payload validation', () => {
  it('rejects malformed JSON (400)', async () => {
    const body = '{not json';
    const res = await fetch(`${baseUrl}/internal/grant-role`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-checkers-signature': sign(body),
      },
    });
    expect(res.status).toBe(400);
  });

  it('rejects non-snowflake discordId', async () => {
    const body = JSON.stringify({
      discordId: 'not-a-snowflake',
      opponentType: 'sheriff',
      marksTotal: 4,
      marksRequired: 4,
    });
    const res = await fetch(`${baseUrl}/internal/grant-role`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-checkers-signature': sign(body),
      },
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.detail).toContain('discordId');
  });

  it('rejects unknown opponentType', async () => {
    const body = JSON.stringify({
      discordId: '123456789012345678',
      opponentType: 'admin', // not a real path
      marksTotal: 4,
      marksRequired: 4,
    });
    const res = await fetch(`${baseUrl}/internal/grant-role`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-checkers-signature': sign(body),
      },
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.detail).toContain('opponentType');
  });

  it('rejects negative marksTotal', async () => {
    const body = JSON.stringify({
      discordId: '123456789012345678',
      opponentType: 'sheriff',
      marksTotal: -1,
      marksRequired: 5,
    });
    const res = await fetch(`${baseUrl}/internal/grant-role`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-checkers-signature': sign(body),
      },
    });
    expect(res.status).toBe(400);
  });

  it('rejects zero marksRequired', async () => {
    const body = JSON.stringify({
      discordId: '123456789012345678',
      opponentType: 'sheriff',
      marksTotal: 5,
      marksRequired: 0,
    });
    const res = await fetch(`${baseUrl}/internal/grant-role`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-checkers-signature': sign(body),
      },
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Successful grants and idempotency
// ---------------------------------------------------------------------------

describe('POST /internal/grant-role: grant outcomes', () => {
  it('grants successfully and returns granted=true', async () => {
    vi.mocked(grantLevelPassedRole).mockResolvedValueOnce({
      granted: true,
      reason: 'newly-added',
    });

    const body = JSON.stringify({
      discordId: '123456789012345678',
      opponentType: 'sheriff',
      marksTotal: 4,
      marksRequired: 4,
    });
    const res = await fetch(`${baseUrl}/internal/grant-role`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-checkers-signature': sign(body),
      },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ granted: true, reason: 'newly-added' });

    // role-service called with right shape
    expect(grantLevelPassedRole).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: GUILD_ID,
        roleId: ROLE_ID,
        discordId: '123456789012345678',
        opponentType: 'sheriff',
        marksTotal: 4,
        marksRequired: 4,
      }),
    );
  });

  it('is idempotent: already-has-role returns 200 + granted=false', async () => {
    vi.mocked(grantLevelPassedRole).mockResolvedValueOnce({
      granted: false,
      reason: 'already-has-role',
    });

    const body = JSON.stringify({
      discordId: '987654321098765432',
      opponentType: 'unbaked',
      marksTotal: 2,
      marksRequired: 2,
    });
    const res = await fetch(`${baseUrl}/internal/grant-role`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-checkers-signature': sign(body),
      },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.granted).toBe(false);
    expect(data.reason).toBe('already-has-role');
  });

  it('returns 200 + structured failure for Discord errors (not 500)', async () => {
    vi.mocked(grantLevelPassedRole).mockResolvedValueOnce({
      granted: false,
      reason: 'hierarchy-blocked',
      detail: 'bot top role position=5 target=8',
    });

    const body = JSON.stringify({
      discordId: '555555555555555555',
      opponentType: 'sheriff',
      marksTotal: 4,
      marksRequired: 4,
    });
    const res = await fetch(`${baseUrl}/internal/grant-role`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-checkers-signature': sign(body),
      },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.granted).toBe(false);
    expect(data.reason).toBe('hierarchy-blocked');
    expect(data.detail).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Method/route routing
// ---------------------------------------------------------------------------

describe('routing', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await fetch(`${baseUrl}/nope`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for wrong method on grant-role', async () => {
    const res = await fetch(`${baseUrl}/internal/grant-role`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Internals (sanity)
// ---------------------------------------------------------------------------

describe('_internals.verifyHmac', () => {
  it('round-trips a signature', () => {
    const body = '{"k":"v"}';
    const sig = sign(body);
    expect(_internals.verifyHmac(SECRET, body, sig)).toBe(true);
  });
  it('rejects on different body', () => {
    const sig = sign('{"k":"v"}');
    expect(_internals.verifyHmac(SECRET, '{"k":"x"}', sig)).toBe(false);
  });
  it('rejects on different secret', () => {
    const body = '{"k":"v"}';
    const sig = createHmac('sha256', 'other-secret').update(body).digest('hex');
    expect(_internals.verifyHmac(SECRET, body, sig)).toBe(false);
  });
});
