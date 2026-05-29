/**
 * Authentication helpers for API routes.
 *
 * Two trust zones:
 *
 *   1. Bot-only routes  — authenticated by HMAC of the request body using
 *                         CHECKERS_BOT_SHARED_SECRET. Only the Discord bot
 *                         (or anything else holding the secret) can call.
 *
 *   2. Session-token routes — authenticated by the player's session JWT,
 *                             passed as `Authorization: Bearer <jwt>` or
 *                             `?t=<jwt>` query param.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { getEnv } from './env';
import { ApiError } from './errors';
import { type SessionTokenPayload, verifySessionToken } from './jwt';

// -----------------------------------------------------------------------------
// Bot HMAC auth
// -----------------------------------------------------------------------------

const HMAC_HEADER = 'x-checkers-signature';

/**
 * Compute the canonical signature for a bot request.
 * The bot signs the raw request body. Including a timestamp would prevent
 * replay attacks; we can add that later by signing `${ts}.${body}` and
 * rejecting timestamps more than ~5 minutes old.
 */
export function computeBotSignature(body: string): string {
  const env = getEnv();
  return createHmac('sha256', env.CHECKERS_BOT_SHARED_SECRET)
    .update(body)
    .digest('hex');
}

/**
 * Verify the bot signature on the request. Throws ApiError on failure.
 * Returns the (parsed) body for the caller to use — passing the raw text
 * through prevents double-reading the request stream.
 */
export async function requireBotAuth(req: NextRequest): Promise<string> {
  const signature = req.headers.get(HMAC_HEADER);
  if (!signature) {
    throw new ApiError('UNAUTHORIZED', 'Missing bot signature header');
  }
  const body = await req.text();
  const expected = computeBotSignature(body);
  if (!safeEqual(signature, expected)) {
    throw new ApiError('UNAUTHORIZED', 'Invalid bot signature');
  }
  return body;
}

function safeEqual(a: string, b: string): boolean {
  // timingSafeEqual requires same-length buffers.
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// -----------------------------------------------------------------------------
// Player session JWT auth
// -----------------------------------------------------------------------------

/**
 * Extracts the session JWT from either the Authorization header or `?t=`
 * query param, verifies it, and returns the payload.
 *
 * `sessionId` is the URL path's session id (e.g. /api/checkers/session/abc/move).
 * We confirm it matches the token's `sid` claim — otherwise a leaked token
 * for one session could be used against a different session id.
 */
export async function requireSessionAuth(
  req: NextRequest,
  expectedSessionId: string,
): Promise<SessionTokenPayload> {
  const token = extractToken(req);
  if (!token) {
    throw new ApiError('UNAUTHORIZED', 'Missing session token');
  }
  let payload: SessionTokenPayload;
  try {
    payload = await verifySessionToken(token);
  } catch {
    throw new ApiError('UNAUTHORIZED', 'Invalid or expired session token');
  }
  if (payload.sid !== expectedSessionId) {
    throw new ApiError('FORBIDDEN', 'Token does not match this session');
  }
  return payload;
}

/**
 * Variant that does not require a specific session id — used by routes
 * that need the user identity but aren't session-scoped.
 */
export async function requireAnyAuth(
  req: NextRequest,
): Promise<SessionTokenPayload> {
  const token = extractToken(req);
  if (!token) {
    throw new ApiError('UNAUTHORIZED', 'Missing session token');
  }
  try {
    return await verifySessionToken(token);
  } catch {
    throw new ApiError('UNAUTHORIZED', 'Invalid or expired session token');
  }
}

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const t = req.nextUrl.searchParams.get('t');
  if (t) return t;
  return null;
}
