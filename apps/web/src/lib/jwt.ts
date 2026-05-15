/**
 * Session JWT helpers.
 *
 * The token carries (session_id, user_id) and is verified on every API
 * call the player makes. We use HS256 with a single server-side secret;
 * since both signing and verification happen on our backend, symmetric
 * keys are appropriate.
 *
 * The token's hash (SHA-256) is stored on the session row so we can
 * additionally enforce that the token presented matches the one we issued.
 * If a player tries to replay a token against a finished session, they're
 * rejected; if a bug causes us to issue two tokens for one session somehow,
 * only the latest one works.
 */

import { createHash, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

import { getEnv } from './env.js';

export interface SessionTokenPayload {
  /** The session this token grants access to. */
  sid: string;
  /** The user the session belongs to. Trusted by the backend after verification. */
  uid: string;
  /** A unique token id; allows us to invalidate specific tokens if needed. */
  jti: string;
}

const ISSUER = 'glazetopia-checkers';
const AUDIENCE = 'glazetopia-checkers-player';

function getKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().CHECKERS_JWT_SECRET);
}

export async function signSessionToken(
  sid: string,
  uid: string,
  ttlMinutes: number,
): Promise<{ token: string; hash: string; expiresAt: Date }> {
  const jti = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlMinutes * 60;
  const token = await new SignJWT({ sid, uid, jti } satisfies SessionTokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getKey());
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(exp * 1000),
  };
}

export async function verifySessionToken(
  token: string,
): Promise<SessionTokenPayload> {
  const { payload } = await jwtVerify(token, getKey(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (
    typeof payload.sid !== 'string' ||
    typeof payload.uid !== 'string' ||
    typeof payload.jti !== 'string'
  ) {
    throw new Error('Malformed session token payload');
  }
  return { sid: payload.sid, uid: payload.uid, jti: payload.jti };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
