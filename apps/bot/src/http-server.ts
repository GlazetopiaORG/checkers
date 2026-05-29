/**
 * Bot HTTP server.
 *
 * Exposes a single internal endpoint:
 *   POST /internal/grant-role
 *
 * The web backend calls this when a player passes either opponent path.
 *
 * Security:
 *   - HMAC-SHA256 of the JSON body, validated against CHECKERS_BOT_SHARED_SECRET
 *   - Constant-time signature compare
 *   - Body shape validated before any Discord interaction
 *   - All requests logged with their outcome
 *
 * This is the only inbound HTTP surface on the bot. Everything else is
 * gateway-only (discord.js websocket).
 *
 * Failure model:
 *   - 401 on missing/bad signature
 *   - 400 on malformed body or unsupported method/route
 *   - 200 on success (including idempotent no-ops); body explains what happened
 *   - 200 + `{ granted: false, reason: '...' }` for Discord-side failures —
 *     this gives the web backend structured info instead of opaque 500s
 *
 * Health:
 *   - GET /healthz returns 200 OK for Railway/etc. liveness probes
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

import type { Client } from 'discord.js';

import { getEnv } from './env.js';
import { grantLevelPassedRole, type GrantResult } from './role-service.js';

const SIG_HEADER = 'x-checkers-signature';

export interface BotHttpServerHandle {
  close(): Promise<void>;
  /** Port the server is actually bound to (useful for tests with port=0). */
  port: number;
}

/**
 * Start the bot's HTTP server. Returns a handle for shutdown.
 */
export async function startBotHttpServer(
  client: Client,
): Promise<BotHttpServerHandle> {
  const env = getEnv();
  const server = createServer((req, res) => {
    handleRequest(req, res, client).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(
        `[phase5-bot] unhandled HTTP handler error: ${err instanceof Error ? err.stack : String(err)}`,
      );
      if (!res.headersSent) {
        writeJson(res, 500, { error: 'internal' });
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.BOT_HTTP_PORT, () => resolve());
  });

  const addr = server.address();
  const boundPort = typeof addr === 'object' && addr ? addr.port : env.BOT_HTTP_PORT;
  // eslint-disable-next-line no-console
  console.log(`[phase5-bot] HTTP server listening on port ${boundPort}`);

  return {
    port: boundPort,
    async close(): Promise<void> {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

// --- Request handler --------------------------------------------------------

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  client: Client,
): Promise<void> {
  // Health check — unauth, fast.
  if (req.method === 'GET' && req.url === '/healthz') {
    writeJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/internal/grant-role') {
    writeJson(res, 404, { error: 'not_found' });
    return;
  }

  // --- Read body ----------------------------------------------------------
  const body = await readBody(req);
  if (body === null) {
    writeJson(res, 413, { error: 'body_too_large' });
    return;
  }

  // --- Verify HMAC --------------------------------------------------------
  const env = getEnv();
  const presented = req.headers[SIG_HEADER];
  const sig = typeof presented === 'string' ? presented : '';
  if (!sig || !verifyHmac(env.CHECKERS_BOT_SHARED_SECRET, body, sig)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[phase5-bot] role-grant request rejected: bad/missing HMAC ` +
        `from=${req.socket.remoteAddress ?? 'unknown'}`,
    );
    writeJson(res, 401, { error: 'invalid_signature' });
    return;
  }

  // --- Validate body shape ------------------------------------------------
  let payload: GrantRolePayload;
  try {
    payload = parseGrantRolePayload(body);
  } catch (err) {
    writeJson(res, 400, {
      error: 'invalid_body',
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // --- Refuse if role ID not configured -----------------------------------
  if (!env.DISCORD_LEVEL_PASSED_ROLE_ID) {
    // eslint-disable-next-line no-console
    console.error(
      `[phase5-bot] role-grant refused: DISCORD_LEVEL_PASSED_ROLE_ID not set. ` +
        `Would have granted for user=${payload.discordId} path=${payload.opponentType}`,
    );
    writeJson(res, 200, {
      granted: false,
      reason: 'role-id-not-configured',
    });
    return;
  }

  // --- Call into the role service -----------------------------------------
  const result = await grantLevelPassedRole({
    client,
    guildId: env.DISCORD_GUILD_ID,
    roleId: env.DISCORD_LEVEL_PASSED_ROLE_ID,
    discordId: payload.discordId,
    opponentType: payload.opponentType,
    marksTotal: payload.marksTotal,
    marksRequired: payload.marksRequired,
  });

  logGrantOutcome(payload, result);
  writeJson(res, 200, serializeGrantResult(result));
}

// --- HMAC helpers -----------------------------------------------------------

function verifyHmac(secret: string, body: string, sig: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// --- Body parsing -----------------------------------------------------------

interface GrantRolePayload {
  discordId: string;
  opponentType: 'sheriff' | 'unbaked';
  marksTotal: number;
  marksRequired: number;
}

const MAX_BODY = 16 * 1024; // 16 KiB — payload is tiny; reject larger.

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let total = 0;
    let aborted = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      total += chunk.length;
      if (total > MAX_BODY) {
        aborted = true;
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', () => {
      if (!aborted) resolve(null);
    });
  });
}

function parseGrantRolePayload(raw: string): GrantRolePayload {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error('body is not valid JSON');
  }
  if (!obj || typeof obj !== 'object') {
    throw new Error('body must be a JSON object');
  }
  const o = obj as Record<string, unknown>;

  if (typeof o.discordId !== 'string' || !/^\d{15,25}$/.test(o.discordId)) {
    throw new Error('discordId must be a snowflake string');
  }
  if (o.opponentType !== 'sheriff' && o.opponentType !== 'unbaked') {
    throw new Error("opponentType must be 'sheriff' or 'unbaked'");
  }
  if (typeof o.marksTotal !== 'number' || !Number.isInteger(o.marksTotal) || o.marksTotal < 0) {
    throw new Error('marksTotal must be a non-negative integer');
  }
  if (
    typeof o.marksRequired !== 'number' ||
    !Number.isInteger(o.marksRequired) ||
    o.marksRequired <= 0
  ) {
    throw new Error('marksRequired must be a positive integer');
  }
  return {
    discordId: o.discordId,
    opponentType: o.opponentType,
    marksTotal: o.marksTotal,
    marksRequired: o.marksRequired,
  };
}

// --- Logging + response serialization ---------------------------------------

function logGrantOutcome(payload: GrantRolePayload, result: GrantResult): void {
  const base =
    `[phase5-bot] grant-role user=${payload.discordId} ` +
    `path=${payload.opponentType} marks=${payload.marksTotal}/${payload.marksRequired}`;
  if (result.granted) {
    // eslint-disable-next-line no-console
    console.log(`${base} → GRANTED (${result.reason})`);
    return;
  }
  if (result.reason === 'already-has-role') {
    // eslint-disable-next-line no-console
    console.log(`${base} → noop (already-has-role)`);
    return;
  }
  // Everything else is a failure mode worth logging at warn/error.
  const detailVal = getDetail(result);
  const detail = detailVal ? ` detail=${detailVal}` : '';
  if (
    result.reason === 'permission-denied' ||
    result.reason === 'hierarchy-blocked' ||
    result.reason === 'role-not-found'
  ) {
    // eslint-disable-next-line no-console
    console.error(`${base} → FAILED config=${result.reason}${detail}`);
  } else {
    // eslint-disable-next-line no-console
    console.warn(`${base} → FAILED ${result.reason}${detail}`);
  }
}

function serializeGrantResult(r: GrantResult): {
  granted: boolean;
  reason: string;
  detail?: string;
} {
  if (r.granted) return { granted: true, reason: r.reason };
  // 'detail' only exists on the rich failure variant — narrow with a typed
  // bag so TS lets us read it.
  const detail = getDetail(r);
  return detail
    ? { granted: false, reason: r.reason, detail }
    : { granted: false, reason: r.reason };
}

function getDetail(r: GrantResult): string | undefined {
  if (r.granted) return undefined;
  if (r.reason === 'already-has-role') return undefined;
  return r.detail;
}

// --- Tiny HTTP helpers ------------------------------------------------------

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

// --- Exported for tests -----------------------------------------------------

export const _internals = {
  verifyHmac,
  parseGrantRolePayload,
  serializeGrantResult,
};
