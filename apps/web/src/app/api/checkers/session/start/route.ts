export const dynamic = 'force-dynamic';

/**
 * POST /api/checkers/session/start
 *
 * Bot-only. Creates a new game session for a Discord user and returns
 * the launch URL the bot will send back to Discord.
 *
 * Auth: HMAC-SHA256 of the request body in the `x-checkers-signature`
 * header, using CHECKERS_BOT_SHARED_SECRET.
 *
 * Request body:
 *   {
 *     "discordId": "string",            // Discord user ID
 *     "discordUsername": "string?"      // Optional; updated on each call
 *   }
 *
 * Response 200:
 *   {
 *     "sessionId": "uuid",
 *     "token": "jwt",
 *     "expiresAt": "ISO8601",
 *     "gameUrl": "https://.../checkers?t=..."
 *   }
 */

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireBotAuth } from '@/lib/auth';
import { startSession, sha256 } from '@/lib/checkers-service';
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

    // Hash the requester IP for loose drift detection (Phase 6 will alert on
    // changes; Phase 2 just records it).
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      undefined;
    const ipHash = ip ? sha256(ip) : undefined;

    const result = await startSession({
      discordId: parsed.discordId,
      discordUsername: parsed.discordUsername,
      ipHash,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
