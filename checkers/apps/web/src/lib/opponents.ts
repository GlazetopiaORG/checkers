/**
 * Opponent registry — SERVER-SIDE source of truth.
 *
 * Two opponent paths:
 *   - 'sheriff' : Sheriff Buttercream. Easier (lower AI depth). 4 wins to pass.
 *   - 'unbaked' : The Unbaked. Harder (default AI depth). 2 wins to pass.
 *
 * The backend uses this registry for every authoritative decision:
 *   - which AI depth to feed `cpuMove`
 *   - how many marks are required for a level-pass
 *   - input validation when the client commits an opponent choice
 *
 * The client has its own mirror (apps/web/src/app/checkers/[sessionId]/_lib/
 * opponents.ts) for display strings ONLY. The client copy MUST NOT be
 * trusted for difficulty or marks-required — those come from here.
 *
 * Phase 5 will read `marksRequired` per opponent_type to decide when to
 * fire a Discord role assignment.
 */

export const OPPONENT_TYPES = ['sheriff', 'unbaked'] as const;

export type OpponentType = (typeof OPPONENT_TYPES)[number];

export interface OpponentPreset {
  readonly id: OpponentType;
  /** Display name shown in logs and (mirrored) on the client. */
  readonly displayName: string;
  /** AI minimax search depth used by the engine for this opponent. */
  readonly aiDepth: number;
  /** Marks (wins) required to pass the level via this opponent's path. */
  readonly marksRequired: number;
}

export const OPPONENTS: Record<OpponentType, OpponentPreset> = {
  sheriff: {
    id: 'sheriff',
    displayName: 'Sheriff Buttercream',
    aiDepth: 2,
    marksRequired: 4,
  },
  unbaked: {
    id: 'unbaked',
    displayName: 'The Unbaked',
    aiDepth: 4,
    marksRequired: 2,
  },
};

/**
 * Default opponent for new sessions that haven't committed a choice yet.
 * Conservative: defaults to the existing/harder Unbaked so the
 * pre-4.6.4 behavior is preserved for any session that bypasses the
 * commit step.
 */
export const DEFAULT_OPPONENT: OpponentType = 'unbaked';

/**
 * Type-narrowing helper for untrusted input (request bodies, DB rows
 * created before this migration ran, etc.). Returns the input if it's
 * a known opponent id; otherwise returns the default.
 */
export function coerceOpponentType(
  raw: string | null | undefined,
): OpponentType {
  if (raw && (OPPONENT_TYPES as readonly string[]).includes(raw)) {
    return raw as OpponentType;
  }
  return DEFAULT_OPPONENT;
}

/**
 * Strict variant — throws if the input isn't a recognized opponent.
 * Use this in request handlers where an invalid value should be a
 * 400-level error rather than silently coerced.
 */
export function parseOpponentTypeStrict(raw: unknown): OpponentType {
  if (typeof raw === 'string' && (OPPONENT_TYPES as readonly string[]).includes(raw)) {
    return raw as OpponentType;
  }
  throw new Error(
    `Invalid opponentType: ${JSON.stringify(raw)}. Expected one of: ${OPPONENT_TYPES.join(', ')}`,
  );
}
