/**
 * POST /api/checkers/session/cancel
 *
 * Bot-only. Cancels any active or pending session for the given Discord user.
 * Idempotent: returns { cancelled: 0 } if there's nothing to cancel.
 *
 * Auth: HMAC-SHA256 of the request body in `x-checkers-signature` header.
 *
 * Request body:
 *   { "discordId": "..." }
 *
 * Response 200:
 *   { "cancelled": <count of rows abandoned> }
 */

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireBotAuth } from '@/lib/auth';
import { cancelActiveSession } from '@/lib/checkers-service';
import { ApiError, handleApiError } from '@/lib/errors';

const BodySchema = z.object({
  discordId: z.string().regex(/^\d{15,25}$/, 'discordId must be a numeric snowflake'),
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

    const result = await cancelActiveSession(parsed.discordId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
