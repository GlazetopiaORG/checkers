/**
 * @glazetopia/engine — public API.
 *
 * This is the only module external consumers (backend, bot, future tooling)
 * should import from. Internal modules may move without breaking contracts
 * as long as this barrel stays stable.
 */

// Types
export type {
  Board,
  Cell,
  GameState,
  GameStatus,
  Move,
  Piece,
  Position,
  Side,
} from './types.js';
export type { GameConfig } from './config.js';

// Config
export { defaultConfig, makeConfig } from './config.js';

// Board / state construction and helpers
export {
  BOARD_SIZE,
  cloneBoard,
  initialBoard,
  initialState,
  isDarkSquare,
  isInBounds,
  isInBoundsPos,
  piecesOf,
  samePosition,
} from './board.js';

// Move generation and application
export { applyMove, legalMoves, movesEqual } from './moves.js';

// Game-end detection
export { detectWinner, hasAnyMove } from './winner.js';

// AI
export { cpuMove, evaluate, pieceCounts } from './ai.js';
