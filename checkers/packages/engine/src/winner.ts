/**
 * Game-end detection: win, loss, or draw.
 *
 * A side loses when they have no legal moves on their turn. That covers
 * both "all pieces captured" and "all pieces blocked" without separate cases.
 */

import { piecesOf } from './board.js';
import { defaultConfig, type GameConfig } from './config.js';
import { captureMovesFrom, simpleMovesFrom } from './rules.js';
import type { GameState, GameStatus, Side } from './types.js';

/**
 * Determine the status of the given state.
 *
 * IMPORTANT: this expects `state.turn` to already be the side about to move
 * (i.e. it should be called AFTER turn flip in applyMove). It checks whether
 * that side has any legal response.
 */
export function detectWinner(
  state: GameState,
  config: GameConfig = defaultConfig,
): GameStatus {
  // Draw by inactivity (no captures, no promotions).
  if (state.movesWithoutProgress >= config.drawAfterMovesWithoutProgress) {
    return 'draw';
  }

  const sideToMove: Side = state.turn;
  if (!hasAnyMove(state, sideToMove, config)) {
    // The side to move cannot move — they lose.
    return sideToMove === 'player' ? 'lost' : 'won';
  }

  return 'active';
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
