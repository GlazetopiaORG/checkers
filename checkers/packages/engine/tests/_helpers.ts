/**
 * Test helpers. Not exported from the package; tests only.
 */

import { initialState } from '../src/board.js';
import type {
  Board,
  Cell,
  GameState,
  Piece,
  Position,
  Side,
} from '../src/types.js';

export interface PieceSpec {
  row: number;
  col: number;
  side: Side;
  king?: boolean;
}

/** Build an empty 8x8 board. */
export function emptyBoard(): Cell[][] {
  return Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, (): Cell => null),
  );
}

/** Build a board with exactly the listed pieces and nothing else. */
export function makeBoard(pieces: PieceSpec[]): Board {
  const board = emptyBoard();
  for (const p of pieces) {
    const piece: Piece = { side: p.side, king: p.king ?? false };
    board[p.row]![p.col] = piece;
  }
  return board;
}

/** Build a state with a specific board and turn. */
export function makeState(
  pieces: PieceSpec[],
  turn: Side = 'player',
  overrides: Partial<GameState> = {},
): GameState {
  return {
    board: makeBoard(pieces),
    turn,
    status: 'active',
    moveCount: 0,
    movesWithoutProgress: 0,
    lastMove: null,
    history: [],
    ...overrides,
  };
}

/** Quick fresh-start state for tests that don't need a custom board. */
export function freshState(): GameState {
  return initialState();
}

/** Position equality for assertions. */
export function pos(row: number, col: number): Position {
  return [row, col];
}
