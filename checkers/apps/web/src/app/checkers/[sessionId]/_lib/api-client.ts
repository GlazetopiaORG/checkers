/**
 * Typed API client used by the game UI.
 *
 * All gameplay actions go through these wrappers — there's no direct fetch
 * elsewhere in the client. Centralizing here means we can swap retry, error
 * logging, or auth headers in one place if Phase 6 needs it.
 */

import type {
  Board,
  GameStatus,
  Move,
  Position,
  Side,
} from '@glazetopia/engine';

// -----------------------------------------------------------------------------
// Response shapes (mirror the backend exports — kept in sync by hand for now)
// -----------------------------------------------------------------------------

export interface SessionView {
  sessionId: string;
  board: Board;
  turn: Side;
  status: GameStatus | 'pending' | 'abandoned' | 'expired';
  moveCount: number;
  movesWithoutProgress: number;
  lastMove: Move | null;
  expiresAt: string;
}

export interface MoveResult {
  sessionView: SessionView;
  playerMove: Move;
  cpuReply: Move | null;
  markAwarded: boolean;
  levelPassed: boolean;
  marksTotal: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class CheckersApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CheckersApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// -----------------------------------------------------------------------------
// Internal fetch helper
// -----------------------------------------------------------------------------

interface ClientOpts {
  sessionId: string;
  token: string;
}

async function call<T>(
  opts: ClientOpts,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `/api/checkers/session/${encodeURIComponent(opts.sessionId)}${path}`;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${opts.token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (networkErr) {
    throw new CheckersApiError(
      'NETWORK_ERROR',
      networkErr instanceof Error ? networkErr.message : 'Network error',
      0,
    );
  }

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // body not JSON
    }
    const code = body?.error.code ?? `HTTP_${res.status}`;
    const message = body?.error.message ?? res.statusText;
    throw new CheckersApiError(code, message, res.status, body?.error.details);
  }

  return (await res.json()) as T;
}

// -----------------------------------------------------------------------------
// Public client surface
// -----------------------------------------------------------------------------

export async function fetchSession(opts: ClientOpts): Promise<SessionView> {
  return call<SessionView>(opts, '', { method: 'GET' });
}

export async function fetchLegalMoves(
  opts: ClientOpts,
  from?: Position,
): Promise<Move[]> {
  const qs = from ? `?from=${from[0]},${from[1]}` : '';
  const data = await call<{ moves: Move[] }>(opts, `/legal-moves${qs}`, {
    method: 'GET',
  });
  return data.moves;
}

export async function submitMove(
  opts: ClientOpts,
  from: Position,
  to: Position,
  captures: Position[],
): Promise<MoveResult> {
  return call<MoveResult>(opts, '/move', {
    method: 'POST',
    body: JSON.stringify({ from, to, captures }),
  });
}

export async function resignSession(opts: ClientOpts): Promise<SessionView> {
  return call<SessionView>(opts, '/resign', { method: 'POST' });
}
