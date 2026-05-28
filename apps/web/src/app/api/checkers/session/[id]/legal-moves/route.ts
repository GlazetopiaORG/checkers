export const dynamic = 'force-dynamic';

/**
 * GET /api/checkers/session/[id]/legal-moves?from=r,c
 *
 * Returns legal moves for the player. If `from` is provided, restricted
 * to moves originating at that square (used for piece-selection highlights).
 */

import { type NextRequest, NextResponse } from 'next/server';

import { requireSessionAuth } from '@/lib/auth';
import { getLegalMoves } from '@/lib/checkers-service';
import { ApiError, handleApiError } from '@/lib/errors';

export async function GET(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const sessionId = ctx.params.id;
    const payload = await requireSessionAuth(req, sessionId);
    const token = extractTokenForHash(req);
    const from = parseFrom(req.nextUrl.searchParams.get('from'));

    const moves = await getLegalMoves(sessionId, payload.uid, token, from);
    return NextResponse.json({ moves }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

function extractTokenForHash(req: NextRequest): string {
  const auth = req.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return req.nextUrl.searchParams.get('t') ?? '';
}

function parseFrom(raw: string | null): [number, number] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => s.trim());
  if (parts.length !== 2) {
    throw new ApiError('BAD_REQUEST', "`from` must be in the form 'row,col'");
  }
  const r = Number(parts[0]);
  const c = Number(parts[1]);
  if (
    !Number.isInteger(r) ||
    !Number.isInteger(c) ||
    r < 0 || r > 7 || c < 0 || c > 7
  ) {
    throw new ApiError('BAD_REQUEST', '`from` row/col must be integers 0-7');
  }
  return [r, c];
}
