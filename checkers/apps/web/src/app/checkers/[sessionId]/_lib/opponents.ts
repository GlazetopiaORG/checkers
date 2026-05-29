/**
 * Client-side opponent metadata mirror.
 *
 * IMPORTANT: this file is for DISPLAY ONLY (display names, taglines,
 * art paths, lore strings). It MUST NOT be the source of truth for
 * difficulty or marks-required — those come from the BACKEND, via
 * `marksRequired` on the move-result and `opponentType` on the session.
 *
 * The server-side equivalent lives at apps/web/src/lib/opponents.ts.
 * If you add fields to this file, think about whether they should
 * also live server-side. If a malicious client could exploit a value
 * here (difficulty, marks-required, anything game-rule-related), it
 * MUST be server-side.
 *
 * Safe-to-mirror: display labels, art paths, taglines, lore.
 * NOT-safe-to-mirror: any gameplay-impacting value.
 */

export const OPPONENT_IDS = ['sheriff', 'unbaked'] as const;

export type OpponentId = (typeof OPPONENT_IDS)[number];

export interface OpponentDisplay {
  readonly id: OpponentId;
  /** Display name shown on the picker. */
  readonly displayName: string;
  /** The narrative name of this path (e.g. "Sheriff's Trial"). */
  readonly pathName: string;
  /** One-line flavor shown next to the picker. */
  readonly tagline: string;
  /** Hint text under the picker that mentions difficulty + win count. */
  readonly intensityLabel: string;
  /** Path to the "man" piece art for the CPU. */
  readonly manArt: string;
  /** Path to the "king" piece art for the CPU. */
  readonly kingArt: string;
  /**
   * Wins required to pass this path. DISPLAY-ONLY mirror of the server's
   * `OPPONENTS[id].marksRequired`. The backend is still the source of truth;
   * the value here is only used to seed the HUD before the first server
   * response arrives. After any `MoveResult`, the HUD switches to whatever
   * `marksRequired` came back from the server — so if these ever diverge,
   * the server wins after one move.
   *
   * KEEP IN SYNC with apps/web/src/lib/opponents.ts.
   */
  readonly marksRequired: number;
}

export const OPPONENT_DISPLAY: Record<OpponentId, OpponentDisplay> = {
  sheriff: {
    id: 'sheriff',
    displayName: 'Sheriff Buttercream',
    pathName: "Sheriff's Trial",
    tagline:
      'Sheriff Buttercream tests every recruit. Hold your nerve, partner.',
    intensityLabel: 'Easier — 4 wins to earn the badge',
    manArt: '/pieces/sheriff/man.png',
    kingArt: '/pieces/sheriff/king.png',
    marksRequired: 4,
  },
  unbaked: {
    id: 'unbaked',
    displayName: 'The Unbaked',
    pathName: 'Unbaked Duel',
    tagline:
      "The Unbaked moves in patterns sane folk shouldn't see. Stay sharp.",
    intensityLabel: 'Harder — 2 wins to earn the mark',
    manArt: '/pieces/cpu-man.png',
    kingArt: '/pieces/cpu-king.png',
    marksRequired: 2,
  },
};

/** Default selection in the picker before the player chooses. */
export const DEFAULT_OPPONENT_ID: OpponentId = 'unbaked';

/**
 * Narrowing helper for untrusted strings (e.g. from a session view).
 * Returns the input if known; otherwise returns the default.
 */
export function coerceOpponentId(raw: string | null | undefined): OpponentId {
  if (raw && (OPPONENT_IDS as readonly string[]).includes(raw)) {
    return raw as OpponentId;
  }
  return DEFAULT_OPPONENT_ID;
}
