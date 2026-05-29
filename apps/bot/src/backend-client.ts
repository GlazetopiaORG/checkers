/**
 * Backend client for the bot.
 *
 * All calls to the checkers backend go through this module. Every request
 * is signed with HMAC-SHA256 over the request body using
 * CHECKERS_BOT_SHARED_SECRET. The backend verifies the signature with the
 * same secret; without it, calls return 401.
 *
 * The bot does not hold any other backend secrets. It can only do what the
 * backend is willing to do on behalf of an authenticated bot caller.
 */

import { createHmac } from 'node:crypto';

import { getEnv } from './env.js';

const HMAC_HEADER = 'x-checkers-signature';

// -----------------------------------------------------------------------------
// Response shapes — kept in sync with apps/web by hand for now. If the bot
// ever drifts from backend types this is where it'll fail loudly.
// -----------------------------------------------------------------------------

export interface StartSessionResponse {
  sessionId: string;
  token: string;
  expiresAt: string;
  gameUrl: string;
}

export interface UserMarksResponse {
  discordId: string;
  /**
   * Combined cross-path total. **Do not display** — this is misleading
   * because wins on different paths don't combine for level-pass purposes.
   * Kept on the wire only for backward compatibility with any older
   * consumer; the bot uses `paths` exclusively.
   *
   * @deprecated Display `paths.sheriff.marks` / `paths.unbaked.marks` instead.
   */
  marks: number;
  /**
   * @deprecated Single env-derived threshold; use `paths.<id>.required`.
   */
  required: number;
  /** True if EITHER path has been passed (sheriffPassed || unbakedPassed). */
  levelPassed: boolean;
  /**
   * Phase 4.6.4.1: REQUIRED. Per-opponent breakdown. If a backend
   * response omits this, the bot fails loudly rather than silently
   * showing a misleading combined view.
   */
  paths: {
    sheriff: { marks: number; required: number; passed: boolean };
    unbaked: { marks: number; required: number; passed: boolean };
  };
}

export interface CancelSessionResponse {
  cancelled: number;
}

export interface BackendErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Typed backend error. The bot catches these to render user-friendly Discord
 * embeds rather than dumping raw API responses.
 */
export class BackendApiError extends Error {
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
    this.name = 'BackendApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// -----------------------------------------------------------------------------
// HMAC signing
// -----------------------------------------------------------------------------

function sign(body: string): string {
  const env = getEnv();
  return createHmac('sha256', env.CHECKERS_BOT_SHARED_SECRET)
    .update(body)
    .digest('hex');
}

// -----------------------------------------------------------------------------
// Core fetch wrapper
// -----------------------------------------------------------------------------

interface CallOpts {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  query?: Record<string, string>;
}

async function call<T>(opts: CallOpts): Promise<T> {
  const env = getEnv();
  const url = new URL(opts.path, env.CHECKERS_BACKEND_URL);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      url.searchParams.set(k, v);
    }
  }

  // GET requests sign an empty body so HMAC verification is uniform.
  const bodyText = opts.body === undefined ? '' : JSON.stringify(opts.body);
  const signature = sign(bodyText);

  const headers: Record<string, string> = {
    [HMAC_HEADER]: signature,
  };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: opts.method,
      headers,
      body: opts.body === undefined ? undefined : bodyText,
    });
  } catch (networkErr) {
    throw new BackendApiError(
      'NETWORK_ERROR',
      networkErr instanceof Error ? networkErr.message : 'Network error',
      0,
    );
  }

  if (!res.ok) {
    let parsed: BackendErrorBody | null = null;
    try {
      parsed = (await res.json()) as BackendErrorBody;
    } catch {
      // Non-JSON body — just use HTTP status
    }
    const code = parsed?.error.code ?? `HTTP_${res.status}`;
    const message = parsed?.error.message ?? res.statusText;
    throw new BackendApiError(code, message, res.status, parsed?.error.details);
  }

  return (await res.json()) as T;
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export async function startSession(input: {
  discordId: string;
  discordUsername?: string | undefined;
}): Promise<StartSessionResponse> {
  return call<StartSessionResponse>({
    method: 'POST',
    path: '/api/checkers/session/start',
    body: {
      discordId: input.discordId,
      ...(input.discordUsername ? { discordUsername: input.discordUsername } : {}),
    },
  });
}

export async function getUserMarks(discordId: string): Promise<UserMarksResponse> {
  const raw = await call<unknown>({
    method: 'GET',
    path: '/api/checkers/marks/me',
    query: { discordId },
  });

  // Phase 4.6.4.1: runtime guard. The wire contract requires per-path
  // breakdown; without it, the bot would have to fall back to a misleading
  // combined-total view. We refuse instead — better a loud error than a
  // misleading status embed.
  if (!isUserMarksResponseWithPaths(raw)) {
    throw new Error(
      'Backend /marks/me response is missing per-opponent `paths`. ' +
        'This is required as of Phase 4.6.4.1. The backend may be out of date.',
    );
  }
  return raw;
}

function isUserMarksResponseWithPaths(v: unknown): v is UserMarksResponse {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  if (typeof o.discordId !== 'string') return false;
  if (typeof o.marks !== 'number') return false;
  if (typeof o.required !== 'number') return false;
  if (typeof o.levelPassed !== 'boolean') return false;
  if (!o.paths || typeof o.paths !== 'object') return false;
  const p = o.paths as Record<string, unknown>;
  return isPathEntry(p.sheriff) && isPathEntry(p.unbaked);
}

function isPathEntry(v: unknown): v is { marks: number; required: number; passed: boolean } {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.marks === 'number' &&
    typeof o.required === 'number' &&
    typeof o.passed === 'boolean'
  );
}

export async function cancelActiveSession(
  discordId: string,
): Promise<CancelSessionResponse> {
  return call<CancelSessionResponse>({
    method: 'POST',
    path: '/api/checkers/session/cancel',
    body: { discordId },
  });
}

/**
 * Exported for unit testing. Not for use elsewhere — call() handles signing.
 */
export const _internals = { sign };
