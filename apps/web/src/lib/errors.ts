/**
 * Typed API errors. Throw these from service code; the route handler
 * catches and converts them to HTTP responses with consistent shape.
 */

import { NextResponse } from 'next/server';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'GONE'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'ILLEGAL_MOVE'
  | 'SESSION_EXPIRED'
  | 'GAME_OVER'
  | 'INTERNAL_ERROR';

const STATUS_FOR_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  GONE: 410,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  ILLEGAL_MOVE: 400,
  SESSION_EXPIRED: 410,
  GAME_OVER: 410,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: ApiErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS_FOR_CODE[code];
    this.details = details;
  }

  toResponse(): NextResponse {
    return NextResponse.json(
      {
        error: {
          code: this.code,
          message: this.message,
          ...(this.details ? { details: this.details } : {}),
        },
      },
      { status: this.status },
    );
  }
}

/**
 * Wraps a route handler so any thrown ApiError becomes a proper response,
 * and any unexpected error becomes a 500 without leaking internals.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return err.toResponse();
  }
  // Unexpected — log full detail server-side, return generic to client.
  // eslint-disable-next-line no-console
  console.error('[api] unhandled error:', err);
  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    { status: 500 },
  );
}
