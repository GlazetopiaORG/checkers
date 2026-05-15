/**
 * Engine GameState <-> DB JSON serialization.
 *
 * The engine's GameState includes a `history` array; we don't serialize that
 * to board_state because the history is reconstructable from checkers_moves.
 * Keeping board_state slim avoids row bloat on long games.
 */

import {
  type Board,
  type GameState,
  type GameStatus,
  type Move,
  type Side,
} from '@glazetopia/engine';

/** Slim, persistence-friendly view of GameState. */
export interface SerializedState {
  board: Board;
  turn: Side;
  status: GameStatus;
  moveCount: number;
  movesWithoutProgress: number;
  lastMove: Move | null;
}

export function serializeState(state: GameState): SerializedState {
  return {
    board: state.board,
    turn: state.turn,
    status: state.status,
    moveCount: state.moveCount,
    movesWithoutProgress: state.movesWithoutProgress,
    lastMove: state.lastMove,
  };
}

/**
 * Rehydrate a GameState from the DB. History is loaded separately via
 * checkers_moves; for engine purposes we set it to [] because the engine
 * never inspects history during legal-move generation or AI search.
 */
export function deserializeState(s: SerializedState): GameState {
  return {
    board: s.board,
    turn: s.turn,
    status: s.status,
    moveCount: s.moveCount,
    movesWithoutProgress: s.movesWithoutProgress,
    lastMove: s.lastMove,
    history: [],
  };
}
