/**
 * POST /api/checkers/session/[id]/accept-draw
 *
 * Player accepts a backend-offered draw. The session must currently have
 * `draw_offered = true` — set by submitMove when the no-progress threshold
 * is reached. Idempotency / abuse prevention: the service returns 409 if
 * the session isn't in the draw-offered state, so a client cannot fake an
 * accept on an arbitrary session.
 *
 * Result: status becomes 'draw', session ends. No mark awarded.
 */

import { type NextRequest, NextResponse } from 'next/server';

import { requireSessionAuth } from '@/lib/auth';
import { acceptDraw } from '@/lib/checkers-service';
import { handleApiError } from '@/lib/errors';

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const sessionId = ctx.params.id;
    const payload = await requireSessionAuth(req, sessionId);
    const token = extractTokenForHash(req);

    const view = await acceptDraw(sessionId, payload.uid, token);
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
