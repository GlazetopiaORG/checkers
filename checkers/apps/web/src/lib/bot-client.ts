/**
 * Outbound HMAC client for web → bot calls.
 *
 * Currently exposes one operation: `requestRoleGrant`, used after a player
 * passes either opponent path. The bot receives the request, validates the
 * HMAC, and calls Discord to add the role to the member.
 *
 * Security model:
 *   - HMAC-SHA256 of the JSON body, signed with CHECKERS_BOT_SHARED_SECRET
 *     (the same secret the bot uses for its outbound calls into web).
 *   - The signature is sent in the x-checkers-signature header.
 *   - The bot verifies with constant-time compare.
 *
 * Failure model:
 *   - This function NEVER throws into the caller. Errors are caught and
 *     logged. Role-grant failure must not block the player's win response.
 *   - The return value reports outcome ('granted' | 'noop' | 'failed').
 *
 * When CHECKERS_BOT_INTERNAL_URL is unset (local dev / staging without the
 * bot deployed): we log the intended grant and return 'skipped'. This lets
 * the test/integration paths work without a bot up.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import { getEnv } from './env';

export type RoleGrantOutcome = 'granted' | 'noop' | 'skipped' | 'failed';

export interface RoleGrantRequest {
  discordId: string;
  opponentType: 'sheriff' | 'unbaked';
  marksTotal: number;
  marksRequired: number;
}

export interface RoleGrantResult {
  outcome: RoleGrantOutcome;
  /** Free-form detail for logs (reason for noop, error message, etc.). */
  detail?: string;
}

/**
 * Request a role grant from the bot. Returns a structured result; never throws.
 *
 * The caller (checkers-service.submitMove) logs the result and continues.
 */
export async function requestRoleGrant(
  payload: RoleGrantRequest,
): Promise<RoleGrantResult> {
  const env = getEnv();

  if (!env.CHECKERS_BOT_INTERNAL_URL) {
    // No bot URL configured. Log and skip — this is the local-dev path.
    // eslint-disable-next-line no-console
    console.warn(
      `[phase5] role-grant skipped (CHECKERS_BOT_INTERNAL_URL not set) ` +
        `user=${payload.discordId} path=${payload.opponentType} ` +
        `marks=${payload.marksTotal}/${payload.marksRequired}`,
    );
    return { outcome: 'skipped', detail: 'BOT_INTERNAL_URL not configured' };
  }

  const url = `${env.CHECKERS_BOT_INTERNAL_URL.replace(/\/$/, '')}/internal/grant-role`;
  const body = JSON.stringify(payload);
  const signature = createHmac('sha256', env.CHECKERS_BOT_SHARED_SECRET)
    .update(body)
    .digest('hex');

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-checkers-signature': signature,
      },
      body,
      // 5s ceiling — role grant is best-effort, don't hang the move response.
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown network error';
    // eslint-disable-next-line no-console
    console.error(
      `[phase5] role-grant network failure user=${payload.discordId} ` +
        `path=${payload.opponentType} err=${msg}`,
    );
    return { outcome: 'failed', detail: `network: ${msg}` };
  }

  if (!res.ok) {
    let detail = `status ${res.status}`;
    try {
      const text = await res.text();
      if (text) detail += ` body=${text.slice(0, 200)}`;
    } catch {
      // ignore
    }
    // eslint-disable-next-line no-console
    console.error(
      `[phase5] role-grant rejected by bot user=${payload.discordId} ` +
        `path=${payload.opponentType} ${detail}`,
    );
    return { outcome: 'failed', detail };
  }

  let data: { granted?: boolean; reason?: string } = {};
  try {
    data = (await res.json()) as { granted?: boolean; reason?: string };
  } catch {
    // Bot returned non-JSON 200. Treat as success-but-detail-unknown.
  }
  const outcome: RoleGrantOutcome = data.granted ? 'granted' : 'noop';
  // eslint-disable-next-line no-console
  console.log(
    `[phase5] role-grant ${outcome} user=${payload.discordId} ` +
      `path=${payload.opponentType} marks=${payload.marksTotal}/${payload.marksRequired}` +
      (data.reason ? ` reason=${data.reason}` : ''),
  );
  return { outcome, ...(data.reason ? { detail: data.reason } : {}) };
}

// --- Internals exposed for tests --------------------------------------------

/**
 * Verify an HMAC signature against a body. Exported for the bot's
 * companion verifier in tests and for the bot's HTTP handler.
 * Uses timing-safe compare to thwart timing attacks.
 */
export function verifyHmacSignature(
  secret: string,
  body: string,
  presentedSignature: string,
): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(presentedSignature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
