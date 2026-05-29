/**
 * Game-end detection: win, loss, or draw.
 *
 * Two-tier model (Phase 4.6.3):
 *
 *   1. detectWinner() — reports the AUTOMATIC terminal status.
 *      It returns 'won', 'lost', or 'active' based purely on legal moves.
 *      A side that has no legal moves on its turn loses.
 *      It NEVER returns 'draw' on its own — the engine does not collapse
 *      a no-progress threshold into a terminal status. Why: the backend
 *      offers the player a choice (Keep playing / Accept draw / Resign)
 *      when the no-progress threshold is reached, rather than ending the
 *      game silently.
 *
 *   2. drawAvailable() — read-only signal: is the no-progress count at or
 *      above the configured threshold? The backend uses this to decide
 *      whether to flag `draw_offered = true` on the session row.
 *
 * IMPORTANT: this expects `state.turn` to already be the side about to move
 * (i.e. it should be called AFTER turn flip in applyMove).
 *
 * The AI's evaluation function may still treat draw-available states as
 * neutral (score 0) for search purposes — but only the backend decides
 * whether a draw actually ends the game.
 */

import { piecesOf } from './board';
import { defaultConfig, type GameConfig } from './config';
import { captureMovesFrom, simpleMovesFrom } from './rules';
import type { GameState, GameStatus, Side } from './types';

/**
 * Report the AUTOMATIC terminal status for a state, or 'active' if play
 * continues. Returns 'won' / 'lost' only when the side to move has no
 * legal moves (forced game-over). NEVER returns 'draw' — see file header.
 */
export function detectWinner(
  state: GameState,
  config: GameConfig = defaultConfig,
): GameStatus {
  const sideToMove: Side = state.turn;
  if (!hasAnyMove(state, sideToMove, config)) {
    // The side to move cannot move — they lose.
    return sideToMove === 'player' ? 'lost' : 'won';
  }
  return 'active';
}

/**
 * Read-only: is the state at or above the no-progress threshold for a
 * draw offer? The backend uses this to decide whether to offer the player
 * a Keep-Playing / Accept-Draw / Resign choice.
 *
 * Does NOT mutate state. Does NOT auto-terminate the game.
 */
export function drawAvailable(
  state: GameState,
  config: GameConfig = defaultConfig,
): boolean {
  return state.movesWithoutProgress >= config.drawAfterMovesWithoutProgress;
}

/**
 * Cheap any-move check. Stops as soon as a move is found instead of
 * generating the full list — used both here and as a hot path during AI search.
 */
export function hasAnyMove(
  state: GameState,
  side: Side,
  config: GameConfig = defaultConfig,
): boolean {
  for (const pos of piecesOf(state.board, side)) {
    if (captureMovesFrom(state.board, pos, config).length > 0) return true;
  }
  // Only check simple moves if forced captures isn't blocking them, OR
  // if forced captures is off entirely.
  if (config.forcedCaptures) {
    // If we got here, no captures exist for this side — simple moves are allowed.
  }
  for (const pos of piecesOf(state.board, side)) {
    if (simpleMovesFrom(state.board, pos, config).length > 0) return true;
  }
  return false;
}
