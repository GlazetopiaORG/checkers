/**
 * POST /api/checkers/session/start-or-resume
 *
 * Bot-only. Phase 5.0.14: replaces a direct call to /session/start when
 * the bot wants to avoid creating duplicate sessions. Behavior:
 *   - If the user has an unfinished session (status pending/active and
 *     not yet expired), re-mint a fresh JWT for that session and return
 *     a `resumed` payload (kind: 'resumed').
 *   - Otherwise create a new session as in /session/start (kind: 'new').
 *
 * Auth: HMAC-SHA256 of the request body in the `x-checkers-signature`
 * header, using CHECKERS_BOT_SHARED_SECRET (same scheme as /session/start).
 *
 * Request body:
 *   {
 *     "discordId": "string",
 *     "discordUsername": "string?"
 *   }
 *
 * Response 200:
 *   {
 *     "kind": "new" | "resumed",
 *     "sessionId": "uuid",
 *     "token": "jwt",
 *     "expiresAt": "ISO8601",
 *     "gameUrl": "https://.../checkers/<id>?t=...",
 *     "resumed": { "status": "pending"|"active", "opponentType": "...",
 *                  "moveCount": number } | null
 *   }
 */

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireBotAuth } from '@/lib/auth';
import { startOrResumeSession, sha256 } from '@/lib/checkers-service';
import { ApiError, handleApiError } from '@/lib/errors';

const BodySchema = z.object({
  discordId: z.string().min(1).max(64),
  discordUsername: z.string().max(64).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const rawBody = await requireBotAuth(req);

    let parsed: z.infer<typeof BodySchema>;
    try {
      const json = JSON.parse(rawBody) as unknown;
      parsed = BodySchema.parse(json);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Invalid JSON body';
      throw new ApiError('BAD_REQUEST', message);
    }

    // Hash the requester IP for loose drift detection (same as /start).
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      undefined;
    const ipHash = ip ? sha256(ip) : undefined;

    const result = await startOrResumeSession({
      discordId: parsed.discordId,
      discordUsername: parsed.discordUsername,
      ipHash,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
