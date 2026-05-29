/**
 * POST /api/checkers/session/[id]/move
 *
 * Player submits a move. Backend:
 *   1. Validates via the engine
 *   2. Applies the move
 *   3. Picks the Unbaked's reply if the game is still active
 *   4. Records both moves in the audit log
 *   5. Awards a mark if the player won (and the game was long enough)
 *
 * Request body:
 *   {
 *     "from":     [row, col],
 *     "to":       [row, col],
 *     "captures": [[row, col], ...]   // ordered; empty for simple slides
 *   }
 *
 * Note: `steps` and `promoted` are computed by the engine, not trusted from
 * the client. We only need from/to/captures to identify the chosen move.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireSessionAuth } from '@/lib/auth';
import { submitMove } from '@/lib/checkers-service';
import { ApiError, handleApiError } from '@/lib/errors';
import type { Move } from '@glazetopia/engine';

const Coord = z
  .tuple([z.number().int().min(0).max(7), z.number().int().min(0).max(7)])
  .readonly();

const BodySchema = z.object({
  from: Coord,
  to: Coord,
  captures: z.array(Coord).default([]),
});

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
): Promise<NextResponse> {
  try {
    const sessionId = ctx.params.id;
    const payload = await requireSessionAuth(req, sessionId);
    const token = extractTokenForHash(req);

    let parsed: z.infer<typeof BodySchema>;
    try {
      parsed = BodySchema.parse(await req.json());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Invalid JSON body';
      throw new ApiError('BAD_REQUEST', message);
    }

    // Engine Move requires `steps` and `promoted` too. We provide stubs;
    // the service replaces them with the canonical engine-computed values.
    const proposed: Move = {
      from: parsed.from,
      to: parsed.to,
      steps: [parsed.to],
      captures: parsed.captures,
      promoted: false,
    };

    const result = await submitMove(sessionId, payload.uid, token, proposed);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

function extractTokenForHash(req: NextRequest): string {
  const auth = req.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return req.nextUrl.searchParams.get('t') ?? '';
}
