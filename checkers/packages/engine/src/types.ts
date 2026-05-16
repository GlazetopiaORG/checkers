/**
 * Core types for the checkers engine.
 *
 * Coordinate convention:
 *   - Board is an 8x8 grid indexed by [row][col].
 *   - Row 0 is the top of the board (where CPU pieces start).
 *   - Row 7 is the bottom (where player pieces start).
 *   - Pieces only ever occupy "dark" squares where (row + col) is odd.
 *   - Player men move toward row 0 (decreasing row).
 *   - CPU men move toward row 7 (increasing row).
 *   - A man becomes a king on reaching the opposite back rank.
 */

/** A board coordinate as [row, col]. */
export type Position = readonly [row: number, col: number];

/** Which side a piece belongs to. */
export type Side = 'player' | 'cpu';

/** A single piece on the board. */
export interface Piece {
  readonly side: Side;
  readonly king: boolean;
}

/** A cell is either empty (null) or holds a piece. */
export type Cell = Piece | null;

/** The full board: 8 rows x 8 cols. */
export type Board = readonly (readonly Cell[])[];

/** Game status. 'won' = player won, 'lost' = player lost (CPU won). */
export type GameStatus = 'active' | 'won' | 'lost' | 'draw';

/**
 * A single move. Covers both simple slides and capture chains.
 *
 * For a simple slide:           steps = [to],            captures = []
 * For a single jump:            steps = [to],            captures = [midSquare]
 * For a double jump:            steps = [landing1, to],  captures = [mid1, mid2]
 * For longer chains, both arrays grow accordingly.
 *
 * `path` (steps) is given separately from `captures` so the frontend can
 * animate the piece traveling through each intermediate square in order.
 */
export interface Move {
  readonly from: Position;
  readonly to: Position;
  readonly steps: readonly Position[];
  readonly captures: readonly Position[];
  /** True if the moving piece was promoted as a result of this move. */
  readonly promoted: boolean;
}

/**
 * Full game state. Pure data — no methods, no mutation.
 * All engine functions take a state and return a new state.
 */
export interface GameState {
  readonly board: Board;
  readonly turn: Side;
  readonly status: GameStatus;
  /** Total moves played (both sides). */
  readonly moveCount: number;
  /** Moves since the last capture or promotion. Used for draw detection. */
  readonly movesWithoutProgress: number;
  /** The most recent move, useful for animation hints. */
  readonly lastMove: Move | null;
  /** Full move history in order. */
  readonly history: readonly Move[];
}
