/**
 * POST /api/checkers/session/[id]/decline-draw
 *
 * Player declines a backend-offered draw and commits to keep playing.
 * The session must currently have `draw_offered = true`. The service
 * returns 409 if it isn't.
 *
 * Result: `draw_offered = false`, `moves_without_progress = 0` (per
 * Phase 4.6.3 design — option A: reset the counter when the player
 * commits to keep playing). Play continues normally; the next draw
 * offer may appear later if play stagnates again.
 */

import { type NextRequest, NextResponse } from 'next/server';

import { requireSessionAuth } from '@/lib/auth';
import { declineDraw } from '@/lib/checkers-service';
import { handleApiError } from '@/lib/errors';

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const sessionId = ctx.params.id;
    const payload = await requireSessionAuth(req, sessionId);
    const token = extractTokenForHash(req);

    const view = await declineDraw(sessionId, payload.uid, token);
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
