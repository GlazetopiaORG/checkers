/**
 * Board construction and coordinate utilities.
 * All functions here are pure; no state mutation.
 */

import type { Board, Cell, GameState, Position } from './types.js';

export const BOARD_SIZE = 8;

/** Dark squares are where (row + col) is odd. Pieces only occupy these. */
export function isDarkSquare(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}

/** Position is within the 8x8 board. */
export function isInBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

/** Position-tuple flavor of isInBounds, matching the readonly tuple type. */
export function isInBoundsPos(pos: Position): boolean {
  return isInBounds(pos[0], pos[1]);
}

/** Returns true if two positions refer to the same square. */
export function samePosition(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Returns a deep-enough clone of the board to mutate freely. */
export function cloneBoard(board: Board): Cell[][] {
  // Cells themselves are immutable (Piece objects are never mutated;
  // we replace them wholesale), so a row-level clone is sufficient.
  return board.map((row) => row.slice());
}

/**
 * The standard American-checkers starting position.
 * CPU (the Unbaked) occupies rows 0-2; player occupies rows 5-7.
 * Each side starts with 12 men, all on dark squares.
 */
export function initialBoard(): Board {
  const board: Cell[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, (): Cell => null),
  );

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (!isDarkSquare(row, col)) continue;
      if (row <= 2) {
        board[row]![col] = { side: 'cpu', king: false };
      } else if (row >= 5) {
        board[row]![col] = { side: 'player', king: false };
      }
    }
  }

  return board;
}

/**
 * Fresh game state at the start of a match.
 * Player always moves first (standard rule).
 */
export function initialState(): GameState {
  return {
    board: initialBoard(),
    turn: 'player',
    status: 'active',
    moveCount: 0,
    movesWithoutProgress: 0,
    lastMove: null,
    history: [],
  };
}

/** Iterate every dark square that holds a piece of the given side. */
export function* piecesOf(
  board: Board,
  side: 'player' | 'cpu',
): Generator<Position> {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = board[row]![col]!;
      if (cell !== null && cell.side === side) {
        yield [row, col];
      }
    }
  }
}
