/**
 * Map backend API error codes to user-friendly messages for Discord replies.
 *
 * The backend returns codes like `RATE_LIMITED`, `SESSION_EXPIRED`, etc.
 * Raw codes aren't useful to players. This module renders them as in-character
 * copy that fits the Glazetopia tone.
 */

import { BackendApiError } from '../backend-client.js';

interface UserFacingError {
  title: string;
  message: string;
}

/**
 * Translate a backend error (or any unknown thrown value) into a friendly
 * title/message pair. Always returns something — even unknown errors get
 * a generic fallback.
 */
export function describeBackendError(err: unknown): UserFacingError {
  if (err instanceof BackendApiError) {
    switch (err.code) {
      case 'RATE_LIMITED': {
        const retry = typeof err.details?.retryAfterSeconds === 'number'
          ? ` Try again in ${err.details.retryAfterSeconds}s.`
          : '';
        // Backend's "you already have an active session" lands here too.
        if (/active checkers session/i.test(err.message)) {
          return {
            title: 'A duel is already in progress',
            message:
              "You already have an open game. Finish it, resign it, " +
              "or wait for it to expire.",
          };
        }
        return {
          title: 'Slow down, partner',
          message: `The Sheriff thinks you're moving too fast.${retry}`,
        };
      }

      case 'SESSION_EXPIRED':
        return {
          title: 'That duel has gone cold',
          message: 'Your session expired. Run `/checkers` again to start fresh.',
        };

      case 'NOT_FOUND':
        return {
          title: 'Nothing to do',
          message: "Couldn't find the thing you asked about.",
        };

      case 'GONE':
      case 'GAME_OVER':
        return {
          title: 'That duel is finished',
          message: 'This game has already ended.',
        };

      case 'BAD_REQUEST':
        return {
          title: 'Malformed request',
          message: err.message,
        };

      case 'UNAUTHORIZED':
      case 'FORBIDDEN':
        // These shouldn't reach end users — they indicate bot config issues.
        return {
          title: 'Bot configuration error',
          message:
            "The bot can't reach the backend. An admin has been notified " +
            '(check the bot logs).',
        };

      case 'NETWORK_ERROR':
        return {
          title: 'Cannot reach the backend',
          message:
            "The bot can't talk to the game server right now. Try again in a moment.",
        };

      case 'INTERNAL_ERROR':
      default:
        return {
          title: 'Something went sideways',
          message:
            'The game server returned an unexpected error. Try again, and let an admin know if it keeps happening.',
        };
    }
  }

  // Unknown error type — generic fallback.
  return {
    title: 'Something went wrong',
    message: 'Try again in a moment.',
  };
}
