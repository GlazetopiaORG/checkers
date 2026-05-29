/**
 * POST /api/checkers/session/[id]/resign
 *
 * Player concedes the game. Session ends as 'abandoned'. No mark awarded.
 */

import { type NextRequest, NextResponse } from 'next/server';

import { requireSessionAuth } from '@/lib/auth';
import { resignSession } from '@/lib/checkers-service';
import { handleApiError } from '@/lib/errors';

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const sessionId = ctx.params.id;
    const payload = await requireSessionAuth(req, sessionId);
    const token = extractTokenForHash(req);

    const view = await resignSession(sessionId, payload.uid, token);
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
