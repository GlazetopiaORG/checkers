/**
 * Unit tests for auth primitives. No DB required.
 */

import { describe, expect, it } from 'vitest';

import { computeBotSignature } from '../../src/lib/auth.js';
import { signSessionToken, verifySessionToken, hashToken } from '../../src/lib/jwt.js';

describe('computeBotSignature', () => {
  it('produces stable HMAC', () => {
    const a = computeBotSignature('{"discordId":"abc"}');
    const b = computeBotSignature('{"discordId":"abc"}');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different bodies', () => {
    const a = computeBotSignature('{"discordId":"abc"}');
    const b = computeBotSignature('{"discordId":"def"}');
    expect(a).not.toBe(b);
  });
});

describe('session JWT', () => {
  it('round-trips sign + verify', async () => {
    const { token, hash } = await signSessionToken('sid-1', 'uid-1', 15);
    expect(token.split('.').length).toBe(3); // three JWT segments
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const payload = await verifySessionToken(token);
    expect(payload.sid).toBe('sid-1');
    expect(payload.uid).toBe('uid-1');
    expect(payload.jti).toBeTruthy();
  });

  it('rejects a tampered token', async () => {
    const { token } = await signSessionToken('sid-2', 'uid-2', 15);
    const tampered = `${token.slice(0, -4)}XXXX`;
    await expect(verifySessionToken(tampered)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    // Sign with 0 minutes => expires immediately. Wait a tick.
    const { token } = await signSessionToken('sid-3', 'uid-3', 0);
    await new Promise((r) => setTimeout(r, 1100));
    await expect(verifySessionToken(token)).rejects.toThrow();
  });

  it('hashes the token consistently', () => {
    const a = hashToken('abc.def.ghi');
    const b = hashToken('abc.def.ghi');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
