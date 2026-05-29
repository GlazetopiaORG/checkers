/**
 * GET /api/checkers/marks/me
 *
 * Bot-only. Returns the mark count for a Discord user.
 *
 * Auth: HMAC-SHA256 of the request body in `x-checkers-signature` header.
 * Because GET requests have empty bodies, the signature is computed over
 * the empty string. (Considered using the query string in the signature
 * payload, but that adds complexity for marginal gain — the secret alone
 * already authenticates the caller.)
 *
 * Query params:
 *   discordId — required, the Discord user ID to look up
 *
 * Response 200:
 *   { discordId, marks, required, levelPassed }
 */

import { type NextRequest, NextResponse } from 'next/server';

import { requireBotAuth } from '@/lib/auth';
import { getUserMarks } from '@/lib/checkers-service';
import { ApiError, handleApiError } from '@/lib/errors';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireBotAuth(req);

    const discordId = req.nextUrl.searchParams.get('discordId');
    if (!discordId) {
      throw new ApiError('BAD_REQUEST', 'Missing discordId query parameter');
    }
    if (!/^\d{15,25}$/.test(discordId)) {
      throw new ApiError('BAD_REQUEST', 'discordId must be a numeric snowflake');
    }

    const result = await getUserMarks(discordId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
