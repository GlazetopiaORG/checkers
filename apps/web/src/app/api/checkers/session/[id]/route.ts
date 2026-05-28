export const dynamic = 'force-dynamic';

/**
 * GET /api/checkers/session/[id]
 *
 * Returns the current state of a game session.
 * Player-authenticated via session JWT.
 */

import { type NextRequest, NextResponse } from 'next/server';

import { requireSessionAuth } from '@/lib/auth';
import { getSession } from '@/lib/checkers-service';
import { handleApiError } from '@/lib/errors';

export async function GET(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const sessionId = ctx.params.id;
    const payload = await requireSessionAuth(req, sessionId);
    const token = extractTokenForHash(req);
    const view = await getSession(sessionId, payload.uid, token);
    return NextResponse.json(view, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

function extractTokenForHash(req: NextRequest): string {
  const auth = req.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return req.nextUrl.searchParams.get('t') ?? '';
}
