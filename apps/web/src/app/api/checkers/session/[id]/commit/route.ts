/**
 * POST /api/checkers/session/[id]/commit
 *
 * Phase 4.6.4: single-commit endpoint for opponent selection.
 * Called by the web client when the player taps "Open the Comic" on the
 * intro cover.
 *
 * Request body:
 *   { opponentType: 'sheriff' | 'unbaked' }
 *
 * Backend behavior:
 *   - Validates opponentType strictly (400 on invalid)
 *   - Requires session to currently be 'pending' (409 otherwise — opponent
 *     is immutable once active)
 *   - Flips status from 'pending' to 'active'
 *   - Sets opponent_type on the session row
 *
 * The client cannot send difficulty, marks-required, or any other
 * gameplay knob — those are derived by the backend from opponentType
 * via the OPPONENTS registry in src/lib/opponents.ts.
 */

import { type NextRequest, NextResponse } from 'next/server';

import { requireSessionAuth } from '@/lib/auth';
import { commitSession } from '@/lib/checkers-service';
import { handleApiError } from '@/lib/errors';

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const sessionId = ctx.params.id;
    const payload = await requireSessionAuth(req, sessionId);
    const token = extractTokenForHash(req);

    const body = (await req.json().catch(() => ({}))) as { opponentType?: unknown };

    const view = await commitSession(sessionId, payload.uid, token, {
      opponentType: body.opponentType,
    });
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
